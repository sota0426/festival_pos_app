import { Card } from "components/common";
import {  useEffect, useState } from "react";
import { SafeAreaView, Text, View } from "react-native";
import { Branch} from "types/database";

import { VisitorHeader } from "./VisitorScreen+Header";
import { VisitorFooter } from "./VisitorScreen+Footer";
import { AutomaticCounter } from "./AutomaticCounter";
import { useVisitorCounter } from "hooks/useVisitorCounter";

interface Props{
  branch: Branch;
  onBack: () => void;
}

//automaticmode
export const AutomaticCounterScreen = ({
  branch,
  onBack,
}:Props) =>{

  const [currentDetected, setCurrentDetected] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  
  const {handleCount} = useVisitorCounter(branch.id)

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      const fake = Math.floor(Math.random() * 5);
      setCurrentDetected(fake);
    }, 2000);

    return () => clearInterval(interval);
  }, [isRunning]);


  return (
    <SafeAreaView className="flex-1 bg-purple-50">
      <VisitorHeader 
        branch={branch}
        onBack={onBack}
      />


      <View className="bottom-6 p-6">
        <AutomaticCounter
          currentDetected={currentDetected}
          isRunning={isRunning}
          onStart={() => setIsRunning(true)}
          onStop={() => setIsRunning(false)}
          onAutoCount={(count) => handleCount(count)}
        />
      </View>


      <VisitorFooter
        branch={branch}
      />

    </SafeAreaView>
  )
}