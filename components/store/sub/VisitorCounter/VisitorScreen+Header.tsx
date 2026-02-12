import { Card, Header } from "components/common"
import { useVisitorCounter } from "hooks/useVisitorCounter";
import { Text, View } from "react-native"
import { Branch } from "types/database";

interface Props{
    branch: Branch;
    onBack:()=>void
}

export const VisitorHeader =({
    branch,
    onBack
}:Props)=>{

  const {
    todayCount,
    lastCountTime,
    formatTime,
    getCurrentTimeSlot,
  } = useVisitorCounter(branch.id);

    return(
        <>
      <Header
        title="来客カウンター"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
      />        
        <View className="flex-row gap-4 mb-6">
        <Card className="flex-1 items-center py-4">
            <Text className="text-gray-500 text-sm">本日の来客数</Text>
            <Text className="text-4xl font-bold text-purple-600">{todayCount}</Text>
            <Text className="text-gray-400 text-xs">人</Text>
        </Card>
        <Card className="flex-1 items-center py-4">
            <Text className="text-gray-500 text-sm">現在の時間帯</Text>
            <Text className="text-2xl font-bold text-gray-700">{getCurrentTimeSlot()}</Text>
            <Text className="text-gray-400 text-xs">最終: {formatTime(lastCountTime)}</Text>
        </Card>
        </View>
        </>
    )
}