import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Card } from '../common';

interface AutoCounterProps {
  onPersonDetected: (count: number) => void;
  todayCount: number;
  isActive: boolean;
}

// Web implementation using TensorFlow.js + COCO-SSD
const AutoCounterWeb = ({ onPersonDetected, todayCount, isActive }: AutoCounterProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modelRef = useRef<any>(null);
  const detectionLoopRef = useRef<number | null>(null);
  const trackedPeopleRef = useRef<Map<string, { x: number; y: number; lastSeen: number }>>(new Map());
  const cumulativeCountRef = useRef(0);
  const [detectedNow, setDetectedNow] = useState(0);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);

  // Load TensorFlow.js + COCO-SSD model
  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;

    const loadModel = async () => {
      try {
        setIsModelLoading(true);
        setError(null);

        const tf = await import('@tensorflow/tfjs');
        await tf.ready();

        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        const model = await cocoSsd.load({
          base: 'lite_mobilenet_v2',
        });

        if (!cancelled) {
          modelRef.current = model;
          setIsModelReady(true);
          setIsModelLoading(false);
        }
      } catch (err) {
        console.error('Model loading error:', err);
        if (!cancelled) {
          setError('AI モデルの読み込みに失敗しました');
          setIsModelLoading(false);
        }
      }
    };

    loadModel();

    return () => {
      cancelled = true;
    };
  }, [isActive]);

  // Start camera
  useEffect(() => {
    if (!isActive) return;

    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsCameraReady(true);
        }
      } catch (err) {
        console.error('Camera error:', err);
        setError('カメラへのアクセスが拒否されました');
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setIsCameraReady(false);
    };
  }, [isActive]);

  // Generate a zone key for tracking based on position
  const getZoneKey = useCallback((x: number, y: number, width: number): string => {
    // Divide screen into grid zones for approximate tracking
    const zoneX = Math.floor(x / (width / 4));
    const zoneY = Math.floor(y / 3);
    return `${zoneX}_${zoneY}`;
  }, []);

  // Detection loop
  useEffect(() => {
    if (!isActive || !isModelReady || !isCameraReady || !videoRef.current || !modelRef.current) return;

    const DETECTION_INTERVAL = 1500; // Detect every 1.5s to reduce CPU usage
    const PERSON_TIMEOUT = 5000; // Person considered "gone" after 5s without detection
    const MIN_CONFIDENCE = 0.45; // Minimum confidence for person detection

    const detect = async () => {
      if (!videoRef.current || !modelRef.current) return;

      try {
        const predictions = await modelRef.current.detect(videoRef.current);

        // Filter for person detections
        const people = predictions.filter(
          (p: any) => p.class === 'person' && p.score >= MIN_CONFIDENCE
        );

        setDetectedNow(people.length);

        const now = Date.now();
        const currentTracked = trackedPeopleRef.current;

        // Update tracked people based on detections
        const seenZones = new Set<string>();

        people.forEach((person: any) => {
          const [x, y, w, h] = person.bbox;
          const centerX = x + w / 2;
          const centerY = y + h / 2;
          const zoneKey = getZoneKey(centerX, centerY, videoRef.current?.videoWidth || 640);

          seenZones.add(zoneKey);

          if (!currentTracked.has(zoneKey)) {
            // New person detected in this zone
            currentTracked.set(zoneKey, { x: centerX, y: centerY, lastSeen: now });
            cumulativeCountRef.current += 1;
            setSessionCount(cumulativeCountRef.current);
            onPersonDetected(1);
          } else {
            // Update last seen time for existing tracked person
            const existing = currentTracked.get(zoneKey)!;
            existing.lastSeen = now;
            existing.x = centerX;
            existing.y = centerY;
          }
        });

        // Remove people who haven't been seen for a while (they left)
        for (const [key, data] of currentTracked.entries()) {
          if (now - data.lastSeen > PERSON_TIMEOUT) {
            currentTracked.delete(key);
          }
        }

        // Draw bounding boxes on canvas
        if (canvasRef.current && videoRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            canvasRef.current.width = videoRef.current.videoWidth || 640;
            canvasRef.current.height = videoRef.current.videoHeight || 480;
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            people.forEach((person: any) => {
              const [x, y, w, h] = person.bbox;
              ctx.strokeStyle = '#7c3aed';
              ctx.lineWidth = 3;
              ctx.strokeRect(x, y, w, h);

              // Label
              ctx.fillStyle = '#7c3aed';
              ctx.fillRect(x, y - 24, 80, 24);
              ctx.fillStyle = '#ffffff';
              ctx.font = '14px sans-serif';
              ctx.fillText(`${Math.round(person.score * 100)}%`, x + 4, y - 6);
            });
          }
        }
      } catch (err) {
        console.error('Detection error:', err);
      }
    };

    // Run detection at intervals
    const intervalId = setInterval(detect, DETECTION_INTERVAL);
    detect(); // Run immediately

    return () => {
      clearInterval(intervalId);
    };
  }, [isActive, isModelReady, isCameraReady, onPersonDetected, getZoneKey]);

  // Reset tracked people when becoming inactive
  useEffect(() => {
    if (!isActive) {
      trackedPeopleRef.current.clear();
      cumulativeCountRef.current = 0;
      setSessionCount(0);
      setDetectedNow(0);
    }
  }, [isActive]);

  if (!isActive) return null;

  if (error) {
    return (
      <Card className="bg-red-50 mb-4">
        <View className="items-center py-8">
          <Text className="text-4xl mb-3">⚠️</Text>
          <Text className="text-red-700 font-bold text-lg mb-2">エラー</Text>
          <Text className="text-red-600 text-center">{error}</Text>
        </View>
      </Card>
    );
  }

  return (
    <View className="mb-4">
      {/* Camera Preview with Overlay */}
      <Card className="overflow-hidden mb-4 p-0">
        <View className="relative" style={{ height: 300 }}>
          {isModelLoading && (
            <View className="absolute inset-0 z-10 bg-gray-900 items-center justify-center">
              <Text className="text-3xl mb-3">🤖</Text>
              <Text className="text-white font-bold text-lg mb-2">AI モデル読み込み中...</Text>
              <Text className="text-gray-400 text-sm">初回は少し時間がかかります</Text>
              <View className="mt-4 w-48 h-2 bg-gray-700 rounded-full overflow-hidden">
                <View className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: '60%' }} />
              </View>
            </View>
          )}

          <View
            style={{
              width: '100%',
              height: 300,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 12,
            }}
          >
            <video
              ref={(el: any) => {
                videoRef.current = el;
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
              }}
              autoPlay
              playsInline
              muted
            />
            <canvas
              ref={(el: any) => {
                canvasRef.current = el;
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                transform: 'scaleX(-1)',
                pointerEvents: 'none',
              }}
            />
          </View>

          {/* Detection status overlay */}
          <View
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
              {isModelReady ? `🟢 検出中: ${detectedNow}人` : '🟡 準備中...'}
            </Text>
          </View>

          {/* Live count badge */}
          <View
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: '#7c3aed',
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 6,
              minWidth: 60,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>
              +{sessionCount}
            </Text>
          </View>
        </View>
      </Card>

      {/* Auto count stats */}
      <View className="flex-row gap-3 mb-4">
        <Card className="flex-1 items-center py-3">
          <Text className="text-gray-500 text-xs">現在の検出数</Text>
          <Text className="text-2xl font-bold text-purple-600">{detectedNow}</Text>
          <Text className="text-gray-400 text-xs">人</Text>
        </Card>
        <Card className="flex-1 items-center py-3">
          <Text className="text-gray-500 text-xs">セッション加算</Text>
          <Text className="text-2xl font-bold text-green-600">+{sessionCount}</Text>
          <Text className="text-gray-400 text-xs">人</Text>
        </Card>
        <Card className="flex-1 items-center py-3">
          <Text className="text-gray-500 text-xs">本日合計</Text>
          <Text className="text-2xl font-bold text-purple-700">{todayCount}</Text>
          <Text className="text-gray-400 text-xs">人</Text>
        </Card>
      </View>

      {/* Info */}
      <Card className="bg-blue-50">
        <Text className="text-blue-700 text-center text-sm">
          📷 カメラに映る人物を AI が自動検出しカウントします。{'\n'}
          新しい人物が検出されると自動的に +1 されます。{'\n'}
          カウントは手動集計と同じく本部へ送信されます。
        </Text>
      </Card>
    </View>
  );
};

// Native implementation (iOS/Android) using expo-camera
const AutoCounterNative = ({ onPersonDetected, todayCount, isActive }: AutoCounterProps) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [detectedCount, setDetectedCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const sessionCountRef = useRef(0);
  const lastFaceCountRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isActive && !permission?.granted) {
      requestPermission();
    }
  }, [isActive, permission, requestPermission]);

  useEffect(() => {
    if (!isActive) {
      sessionCountRef.current = 0;
      setSessionCount(0);
      setDetectedCount(0);
      lastFaceCountRef.current = 0;
    }
  }, [isActive]);

  const handleFacesDetected = useCallback(
    ({ faces }: { faces: any[] }) => {
      if (!isActive) return;

      const currentCount = faces.length;
      setDetectedCount(currentCount);

      // If more faces detected than before, count the new ones
      if (currentCount > lastFaceCountRef.current) {
        const newPeople = currentCount - lastFaceCountRef.current;

        // Debounce to avoid rapid counting
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
          sessionCountRef.current += newPeople;
          setSessionCount(sessionCountRef.current);
          onPersonDetected(newPeople);
        }, 800);
      }

      lastFaceCountRef.current = currentCount;
    },
    [isActive, onPersonDetected]
  );

  if (!isActive) return null;

  if (!permission?.granted) {
    return (
      <Card className="bg-yellow-50 mb-4">
        <View className="items-center py-8">
          <Text className="text-4xl mb-3">📷</Text>
          <Text className="text-yellow-800 font-bold text-lg mb-2">カメラ権限が必要です</Text>
          <Text className="text-yellow-700 text-center mb-4">
            自動集計にはカメラへのアクセスが必要です
          </Text>
          <TouchableOpacity
            onPress={requestPermission}
            className="bg-purple-600 px-6 py-3 rounded-xl"
          >
            <Text className="text-white font-bold">権限を許可</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  }

  return (
    <View className="mb-4">
      {/* Camera Preview */}
      <Card className="overflow-hidden mb-4 p-0">
        <View style={{ height: 300, borderRadius: 12, overflow: 'hidden' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="front"
            onMountError={(error) => {
              console.error('Camera mount error:', error);
            }}
          />
          {/* Detection status overlay */}
          <View
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
              🟢 検出中: {detectedCount}人
            </Text>
          </View>

          {/* Live count badge */}
          <View
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: '#7c3aed',
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 6,
              minWidth: 60,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>
              +{sessionCount}
            </Text>
          </View>
        </View>
      </Card>

      {/* Auto count stats */}
      <View className="flex-row gap-3 mb-4">
        <Card className="flex-1 items-center py-3">
          <Text className="text-gray-500 text-xs">現在の検出数</Text>
          <Text className="text-2xl font-bold text-purple-600">{detectedCount}</Text>
          <Text className="text-gray-400 text-xs">人</Text>
        </Card>
        <Card className="flex-1 items-center py-3">
          <Text className="text-gray-500 text-xs">セッション加算</Text>
          <Text className="text-2xl font-bold text-green-600">+{sessionCount}</Text>
          <Text className="text-gray-400 text-xs">人</Text>
        </Card>
        <Card className="flex-1 items-center py-3">
          <Text className="text-gray-500 text-xs">本日合計</Text>
          <Text className="text-2xl font-bold text-purple-700">{todayCount}</Text>
          <Text className="text-gray-400 text-xs">人</Text>
        </Card>
      </View>

      {/* Info */}
      <Card className="bg-blue-50">
        <Text className="text-blue-700 text-center text-sm">
          📷 カメラに映る人物を自動検出しカウントします。{'\n'}
          新しい人物が検出されると自動的に +1 されます。{'\n'}
          カウントは手動集計と同じく本部へ送信されます。
        </Text>
      </Card>
    </View>
  );
};

// Platform-specific export
export const AutoCounter = Platform.OS === 'web' ? AutoCounterWeb : AutoCounterNative;
