import { Card } from "components/common"
import { useVisitorCounter } from "hooks/useVisitorCounter";
import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native"
import { Branch } from "types/database";

interface Props{
    branch:Branch
}

export const VisitorFooter =({branch}:Props)=>{
  const [showTrend, setShowTrend] = useState(true);
  const {
    quarterHourlyData,
    maxVisitorSlot,
  } = useVisitorCounter(branch.id);
    return(
    <View className="px-4 pb-4 mt-auto bg-slate-50">

        {/* Toggle */}
        <TouchableOpacity
            onPress={() => setShowTrend(!showTrend)}
            className="bg-white rounded-xl p-3 mb-3 flex-row items-center justify-between"
        >
            <Text className="text-gray-700 font-semibold">本日の推移</Text>
            <Text className="text-gray-400">
            {showTrend ? '▲' : '▼'}
            </Text>
        </TouchableOpacity>

        {showTrend && (
            <Card className="mb-3">
            {quarterHourlyData.length > 0 ? (
                quarterHourlyData.map((slot) => (
                <View
                    key={slot.time_slot}
                    className="flex-row items-center py-1.5 border-b border-gray-100"
                >
                    <Text className="w-14 text-gray-600 text-sm font-medium">
                    {slot.time_slot}
                    </Text>

                    <View className="flex-1 mx-2 h-5 bg-gray-100 rounded overflow-hidden">
                    <View
                        className="h-full bg-purple-500 rounded"
                        style={{
                        width: `${Math.min(
                            (slot.count / maxVisitorSlot) * 100,
                            100
                        )}%`,
                        }}
                    />
                    </View>

                    <Text className="w-12 text-right text-gray-900 font-semibold">
                    {slot.count}人
                    </Text>
                </View>
                ))
            ) : (
                <Text className="text-gray-500 text-center py-4">
                まだデータがありません
                </Text>
            )}
            </Card>
        )}
    </View>
    )
}
