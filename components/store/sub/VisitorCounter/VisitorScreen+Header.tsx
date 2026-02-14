import { Card, Header } from "components/common"
import { Text, View } from "react-native"
import { Branch } from "types/database";

interface Props{
    branch: Branch;
    onBack:()=>void;
    todayTotal: number;
    lastCountLabel: string;
}

export const VisitorHeader =({
    branch,
    onBack,
    todayTotal,
    lastCountLabel,
}:Props)=>{
  const now = new Date();
  const slotMinute = Math.floor(now.getMinutes() / 15) * 15;
  const currentTimeSlot = `${now.getHours().toString().padStart(2, "0")}:${slotMinute.toString().padStart(2, "0")}`;

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
            <Text className="text-4xl font-bold text-purple-600">{todayTotal}</Text>
            <Text className="text-gray-400 text-xs">人</Text>
        </Card>
        <Card className="flex-1 items-center py-4">
            <Text className="text-gray-500 text-sm">現在の時間帯</Text>
            <Text className="text-2xl font-bold text-gray-700">{currentTimeSlot}</Text>
            <Text className="text-gray-400 text-xs">最終: {lastCountLabel}</Text>
        </Card>
        </View>
        </>
    )
}
