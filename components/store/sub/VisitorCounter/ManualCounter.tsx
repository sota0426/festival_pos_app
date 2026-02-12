import { Card } from "components/common";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

interface ManualCounterProps{
  todayCount:number;
  onCount:(count:number) => void;
}

export const ManualCounter =({
  todayCount,
  onCount,
}:ManualCounterProps)=>{
  return(
    <ScrollView contentContainerStyle={{padding:16}}>

      {/**main button */}
      <View className="items-center mb-6">
        <TouchableOpacity 
          onPress={()=>onCount(1)}
          className="w-64 h-64 bg-purple-600 rounded-full  items-center  justify-center"
        >
          <Text className="text-white text-8xl font-bold">+1</Text>
          <Text className="text-purple-200 text-xl mt-2">タップでカウント</Text>
        </TouchableOpacity>
      </View>

      {/**Quick Buttons */}
      <View className="flex-row gap-3 mb-4">
        <TouchableOpacity
          onPress={()=>onCount(5)}
          className="flex-1 bg-purple-500 py-4 rounded-xl items-center"
        >
          <Text className="text-white text-2xl font-bold">+5</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={()=>onCount(10)}
          className="flex-1 bg-purple-500 py-4 rounded-xl items-center"
        >
          <Text className="text-white text-2xl font-bold">+10</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={()=>onCount(-1)}
          className="flex-1 bg-gray-400 py-4 items-center rounded-xl"
          disabled={todayCount <= 0}
        >
          <Text className="text-white text-2xl font-bold ">-1</Text>
        </TouchableOpacity>

      </View>

    </ScrollView>
  )
}