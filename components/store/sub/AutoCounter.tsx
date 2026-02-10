import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';


export default function AutomaticCounter() {
  const cameraRef = useRef<CameraView>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [count, setCount] = useState(0);

  /* カメラ権限 */
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  /* TensorFlow & モデル読み込み */
  useEffect(() => {
    (async () => {
      await tf.ready();
      const loaded = await cocoSsd.load();
      setModel(loaded);
    })();
  }, []);

  /* 定期的に人数を数える */
  useEffect(() => {
    if (!model) return;

    const timer = setInterval(async () => {
      if (!cameraRef.current) return;

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.4,
      });

      const tensor = await base64ToTensorWeb(photo.uri);
      const predictions = await model.detect(tensor);

      const people = predictions.filter(p => p.class === 'person');
      setCount(people.length);

      tf.dispose(tensor);



    }, 700); // 0.7秒ごと

    return () => clearInterval(timer);
  }, [model]);

  if (hasPermission === null) return <View />;
  if (hasPermission === false) return <Text>Camera permission denied</Text>;

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
      />

      <View style={styles.overlay}>
        <Text style={styles.text}>人数：{count}</Text>
      </View>
    </View>
  );
}

/* base64 → Tensor */
async function base64ToTensorWeb(base64: string) {
  const response = await fetch(base64);
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);

  const tensor = tf.browser.fromPixels(imageBitmap);
  imageBitmap.close?.(); // Chrome対策

  return tensor;
}



const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  overlay: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
  },
  text: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
});
