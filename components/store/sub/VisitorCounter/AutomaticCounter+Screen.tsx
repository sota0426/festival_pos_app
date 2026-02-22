import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { getVisitorGroups } from "lib/storage";
import { useVisitorCounter } from "hooks/useVisitorCounter";
import type { Branch, VisitorCounterGroup } from "types/database";
import { AutomaticCounter, EntryDirection } from "./AutomaticCounter";
import { VisitorFooter } from "./VisitorScreen+Footer";
import { VisitorHeader } from "./VisitorScreen+Header";
import { SafeAreaView } from "react-native-safe-area-context";

interface Props {
  branch: Branch;
  onBack: () => void;
}

const DEFAULT_GROUPS: VisitorCounterGroup[] = [
  { id: "group1", name: "一般", color: "#7C3AED" },
];

export const AutomaticCounterScreen = ({ branch, onBack }: Props) => {
  const [currentDetected, setCurrentDetected] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [groups, setGroups] = useState<VisitorCounterGroup[]>(DEFAULT_GROUPS);
  const [entryDirection, setEntryDirection] = useState<EntryDirection>("left_to_right");
  const [showPreview, setShowPreview] = useState(true);

  const {
    todayTotal,
    lastCountTime,
    handleCount,
    formatTime,
    quarterHourlyGroupData,
    maxVisitorSlot,
    pastDailyTrends,
  } = useVisitorCounter(branch.id);

  useEffect(() => {
    const loadGroups = async () => {
      const savedGroups = await getVisitorGroups(branch.id);
      if (savedGroups.length > 0) setGroups(savedGroups);
    };
    loadGroups();
  }, [branch.id]);

  return (
    <SafeAreaView className="flex-1 bg-purple-50">
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <VisitorHeader
          branch={branch}
          onBack={onBack}
          todayTotal={todayTotal}
          lastCountLabel={formatTime(lastCountTime)}
        />

        <View className="px-4 pb-2">
          <Text className="text-xs text-gray-600 mb-2">
            カメラは通路の真横から設置してください。入場方向は上のボタンで設定できます。
          </Text>
        </View>

        <View className="px-4">
          <AutomaticCounter
            currentDetected={currentDetected}
            isRunning={isRunning}
            showPreview={showPreview}
            entryDirection={entryDirection}
            onStart={() => setIsRunning(true)}
            onStop={() => setIsRunning(false)}
            onAutoCount={(count) => handleCount("unassigned", count)}
            onDetectedChange={setCurrentDetected}
            onDirectionChange={setEntryDirection}
            onTogglePreview={setShowPreview}
          />
        </View>

        <View className="px-4 mt-4">
          <Text className="text-xs text-gray-600">
            自動集計の来客データは「未設定グループ」としてローカル保存され、15分ごとにまとめてデータベースへ送信されます。
          </Text>
        </View>

        <VisitorFooter
          groups={groups}
          quarterHourlyGroupData={quarterHourlyGroupData}
          maxVisitorSlot={maxVisitorSlot}
          pastDailyTrends={pastDailyTrends}
        />
      </ScrollView>
    </SafeAreaView>
  );
};
