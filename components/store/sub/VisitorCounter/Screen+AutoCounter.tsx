import { Card } from "components/common";
import {  useState } from "react";
import { SafeAreaView, Text, View } from "react-native";
import { Branch} from "types/database";

import { VisitorHeader } from "./VisitorScreen+Header";
import { VisitorFooter } from "./VisitorScreen+Footer";

interface Props{
  branch: Branch;
  onBack: () => void;
}

//automaticmode
export const AutomaticCounterScreen = ({
  branch,
  onBack,
}:Props) =>{

  const [currentDetected , setCurrentDetected] =useState(0);

  
  const AutoCounter =()=>{
    return(
      <View className="bg-red-100">
        <Text>
          auto counter screen
        </Text>
      </View>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-purple-50">
      <VisitorHeader 
        branch={branch}
        onBack={onBack}
      />


      <View className="bottom-6 p-6">
        <AutoCounter />
        <Card className="items-center py-4">
          <Text className="text-gray-500">現在検出人数</Text>
          <Text className="text-4xl font-bold text-purple-600">
           {currentDetected}   
          </Text>
        </Card>
      </View>


      <VisitorFooter
        branch={branch}
      />

    </SafeAreaView>
  )
}