import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Text, TouchableOpacity, View } from "react-native";
import { Camera, CameraCapturedPicture, CameraView } from "expo-camera";
import * as FaceDetector from "expo-face-detector";

export type EntryDirection = "left_to_right" | "right_to_left";

type Props = {
  isRunning: boolean;
  currentDetected: number;
  showPreview: boolean;
  entryDirection: EntryDirection;
  onStart: () => void;
  onStop: () => void;
  onAutoCount: (count: number) => void;
  onDetectedChange: (value: number) => void;
  onDirectionChange: (direction: EntryDirection) => void;
  onTogglePreview: (visible: boolean) => void;
};

type FaceBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
};

export const AutomaticCounter = ({
  isRunning,
  currentDetected,
  showPreview,
  entryDirection,
  onStart,
  onStop,
  onAutoCount,
  onDetectedChange,
  onDirectionChange,
  onTogglePreview,
}: Props) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [faceBoxes, setFaceBoxes] = useState<FaceBox[]>([]);
  const [previewSize, setPreviewSize] = useState({ width: 1, height: 1 });
  const [statusText, setStatusText] = useState("停止中");
  const cameraRef = useRef<CameraView | null>(null);
  const processingRef = useRef(false);
  const tracksRef = useRef<Map<string, { x: number; lastSeen: number }>>(new Map());
  const cooldownRef = useRef<Map<string, number>>(new Map());

  const centerLineX = previewSize.width / 2;

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    })();
  }, []);

  useEffect(() => {
    if (!isRunning) {
      setStatusText("停止中");
      return;
    }

    setStatusText("検出中");
    const interval = setInterval(() => {
      processFrame();
    }, 900);

    return () => {
      clearInterval(interval);
    };
  }, [isRunning, entryDirection, previewSize.width, previewSize.height]);

  const onPreviewLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setPreviewSize({ width, height });
    }
  };

  const mapFaceToPreview = (
    face: FaceDetector.FaceFeature,
    picture: CameraCapturedPicture,
  ): FaceBox => {
    const sourceWidth = picture.width || 1;
    const sourceHeight = picture.height || 1;
    const bounds = face.bounds;
    const bx = Number(bounds.origin.x ?? 0);
    const by = Number(bounds.origin.y ?? 0);
    const bw = Number(bounds.size.width ?? 0);
    const bh = Number(bounds.size.height ?? 0);
    const scaleX = previewSize.width / sourceWidth;
    const scaleY = previewSize.height / sourceHeight;

    const x = bx * scaleX;
    const y = by * scaleY;
    const width = bw * scaleX;
    const height = bh * scaleY;

    return {
      id: `${face.faceID ?? `${bx}-${by}-${bw}-${bh}`}`,
      x,
      y,
      width,
      height,
      centerX: x + width / 2,
    };
  };

  const processFrame = async () => {
    if (!isRunning || processingRef.current || !cameraRef.current) return;

    processingRef.current = true;
    try {
      const picture = await cameraRef.current.takePictureAsync({
        quality: 0.3,
        skipProcessing: true,
      });

      const result = await FaceDetector.detectFacesAsync(picture.uri, {
        mode: FaceDetector.FaceDetectorMode.fast,
        detectLandmarks: FaceDetector.FaceDetectorLandmarks.none,
        runClassifications: FaceDetector.FaceDetectorClassifications.none,
        minDetectionInterval: 0,
        tracking: true,
      });

      const now = Date.now();
      const mapped = result.faces.map((face) => mapFaceToPreview(face, picture));
      onDetectedChange(mapped.length);
      const nextTracks = new Map<string, { x: number; lastSeen: number }>();

      mapped.forEach((box) => {
        const previousTrack = tracksRef.current.get(box.id);
        const prevX = previousTrack?.x ?? box.centerX;
        const currX = box.centerX;

        const crossedLeftToRight = prevX < centerLineX && currX >= centerLineX;
        const crossedRightToLeft = prevX > centerLineX && currX <= centerLineX;
        const crossed =
          entryDirection === "left_to_right" ? crossedLeftToRight : crossedRightToLeft;

        const cooldownUntil = cooldownRef.current.get(box.id) ?? 0;
        if (crossed && now > cooldownUntil) {
          onAutoCount(1);
          cooldownRef.current.set(box.id, now + 3000);
        }

        nextTracks.set(box.id, { x: currX, lastSeen: now });
      });

      const prunedTracks = new Map<string, { x: number; lastSeen: number }>();
      nextTracks.forEach((value, key) => {
        if (now - value.lastSeen < 4000) {
          prunedTracks.set(key, value);
        }
      });
      tracksRef.current = prunedTracks;

      setFaceBoxes(mapped);
      setStatusText(mapped.length > 0 ? "人物を検知しました" : "検知なし");
    } catch (error) {
      console.error("Automatic detection failed:", error);
      setStatusText("検知エラー");
      onDetectedChange(0);
    } finally {
      processingRef.current = false;
    }
  };

  const directionLabel = useMemo(() => {
    return entryDirection === "left_to_right"
      ? "左 → 右 を入場としてカウント"
      : "右 → 左 を入場としてカウント";
  }, [entryDirection]);

  if (hasPermission === null) return <Text>カメラ許可確認中...</Text>;
  if (hasPermission === false) return <Text>カメラの使用が許可されていません</Text>;

  return (
    <View className="w-full">
      <View className="flex-row gap-2 mb-3">
        <TouchableOpacity
          onPress={() => onDirectionChange("left_to_right")}
          className={`px-3 py-2 rounded-lg ${entryDirection === "left_to_right" ? "bg-purple-600" : "bg-gray-300"}`}
        >
          <Text className={entryDirection === "left_to_right" ? "text-white" : "text-gray-700"}>
            左 → 右
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onDirectionChange("right_to_left")}
          className={`px-3 py-2 rounded-lg ${entryDirection === "right_to_left" ? "bg-purple-600" : "bg-gray-300"}`}
        >
          <Text className={entryDirection === "right_to_left" ? "text-white" : "text-gray-700"}>
            右 → 左
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onTogglePreview(!showPreview)}
          className={`px-3 py-2 rounded-lg ${showPreview ? "bg-blue-600" : "bg-gray-500"}`}
        >
          <Text className="text-white">{showPreview ? "映像表示中" : "映像非表示"}</Text>
        </TouchableOpacity>
      </View>

      <Text className="text-sm text-gray-600 mb-2">{directionLabel}</Text>

      <View
        className="h-80 rounded-2xl overflow-hidden bg-black"
        onLayout={onPreviewLayout}
      >
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: centerLineX - 1,
            width: 2,
            backgroundColor: "#f59e0b",
          }}
        />
        {showPreview ? (
          <>
            {faceBoxes.map((box) => (
              <View
                key={box.id}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                  borderWidth: 2,
                  borderColor: "#22c55e",
                  borderRadius: 6,
                }}
              />
            ))}
          </>
        ) : (
          <View className="absolute inset-0 items-center justify-center bg-black/80">
            <Text className="text-gray-300">撮影映像は非表示です</Text>
          </View>
        )}
      </View>

      <View className="items-center mt-5">
        <Text className="text-gray-500 text-base">現在検出人数</Text>
        <Text className="text-4xl font-bold text-purple-600 mt-1">{currentDetected}</Text>
        <Text className="text-xs text-gray-500 mt-1">{statusText}</Text>
      </View>

      <View className="flex-row justify-center gap-4 mt-5">
        {!isRunning ? (
          <TouchableOpacity
            onPress={onStart}
            className="bg-green-500 px-6 py-3 rounded-full"
          >
            <Text className="text-white font-bold">自動計測開始</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onStop}
            className="bg-red-500 px-6 py-3 rounded-full"
          >
            <Text className="text-white font-bold">停止</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
