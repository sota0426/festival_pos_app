import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { Camera, CameraView } from "expo-camera";

interface Props {
  currentDetected: number;
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  onAutoCount:(count:number)=>void
}

const {width,height} = Dimensions.get("window")

const LINE_X = width /2;

type Person = {
  id:number;
  currentX: number
  previousX:number;
  hasCounted:boolean;
}

export const AutomaticCounter = ({
  currentDetected,
  isRunning,
  onStart,
  onStop,
  onAutoCount
}: Props) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const cameraRef = useRef<CameraView | null>(null);

  const [count , setCount] =useState(0)
  const personsRef = useRef<Person[]>([])

  const [detected , setDetected] = useState(0);
  const previoudDetected = useRef(0);

  // カメラ権限取得
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    })();
  }, []);

  // 疑似AI（2秒ごとに人数変動）
  useEffect(() => {
    const interval = setInterval(() => {
      const fake = Math.floor(Math.random() * 5); // 0〜4人
      setDetected(fake);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // 疑似人物生成
  useEffect(() => {
    personsRef.current = [
      {
        id: 1,
        currentX: 0,
        previousX: 0,
        hasCounted: false,
      },
    ]
  }, [])

 // フレーム更新（疑似移動）
  useEffect(() => {
    const interval = setInterval(() => {
      personsRef.current = personsRef.current.map((person) => {
        const newX = person.currentX + 15

        // ライン通過判定
        if (
          person.previousX < LINE_X &&
          newX >= LINE_X &&
          !person.hasCounted
        ) {
          setCount((prev) => prev + 1)
          return {
            ...person,
            previousX: person.currentX,
            currentX: newX,
            hasCounted: true,
          }
        }

        return {
          ...person,
          previousX: person.currentX,
          currentX: newX,
        }
      })
    }, 100)

    return () => clearInterval(interval)
  }, [])

  //diff
  useEffect(()=>{
    const diff = detected - previoudDetected.current;

    if(diff > 0){
      onAutoCount(diff)
    }
  })


  if (hasPermission === null)  return <Text>カメラ許可確認中...</Text>;
  if (hasPermission === false)  return <Text>カメラの使用が許可されていません</Text>;

  return (
    <View className="flex-1">
      
      {/* カメラ表示*/}
      <View className="h-80 rounded-2xl overflow-hidden">
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
        />
      </View> 

      {/* 検出人数表示 */}
      <View className="items-center mt-6">
        <Text className="text-gray-500 text-lg">
          現在検出人数
        </Text>
        <Text className="text-5xl font-bold text-purple-600 mt-2">
          {currentDetected}
        </Text>
      </View>

      {/* 開始停止 */}
      <View className="flex-row justify-center gap-6 mt-8">
        {!isRunning ? (
          <TouchableOpacity
            onPress={onStart}
            className="bg-green-500 px-6 py-3 rounded-full"
          >
            <Text className="text-white font-bold">
              自動計測開始
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onStop}
            className="bg-red-500 px-6 py-3 rounded-full"
          >
            <Text className="text-white font-bold">
              停止
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
