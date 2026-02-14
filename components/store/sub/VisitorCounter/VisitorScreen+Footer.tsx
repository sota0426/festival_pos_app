import { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Card } from "components/common";
import type {
  DailyVisitorTrend,
  QuarterHourlyGroupVisitors,
  VisitorCounterGroup,
} from "types/database";

interface Props {
  groups: VisitorCounterGroup[];
  quarterHourlyGroupData: QuarterHourlyGroupVisitors[];
  maxVisitorSlot: number;
  pastDailyTrends: DailyVisitorTrend[];
}

const UNASSIGNED_GROUP_ID = "__unassigned__";
const UNASSIGNED_GROUP: VisitorCounterGroup = {
  id: UNASSIGNED_GROUP_ID,
  name: "未設定グループ",
  color: "#6B7280",
};

export const VisitorFooter = ({
  groups,
  quarterHourlyGroupData,
  maxVisitorSlot,
  pastDailyTrends,
}: Props) => {
  const [showTrend, setShowTrend] = useState(true);
  const mergedSlotData = useMemo(() => {
    const existing = new Set(groups.map((group) => group.id));
    return quarterHourlyGroupData.map((slot) => {
      const mergedGroupCounts: Record<string, number> = {};
      let unassignedCount = 0;

      Object.entries(slot.group_counts).forEach(([groupId, count]) => {
        if (existing.has(groupId)) {
          mergedGroupCounts[groupId] = (mergedGroupCounts[groupId] ?? 0) + count;
          return;
        }
        unassignedCount += count;
      });

      if (unassignedCount > 0) {
        mergedGroupCounts[UNASSIGNED_GROUP_ID] = unassignedCount;
      }

      return {
        ...slot,
        group_counts: mergedGroupCounts,
      };
    });
  }, [groups, quarterHourlyGroupData]);

  const displayGroups = useMemo(() => {
    const hasUnassigned = mergedSlotData.some(
      (slot) => (slot.group_counts[UNASSIGNED_GROUP_ID] ?? 0) > 0,
    );
    return hasUnassigned ? [...groups, UNASSIGNED_GROUP] : groups;
  }, [groups, mergedSlotData]);

  const renderTrendRows = (
    slots: QuarterHourlyGroupVisitors[],
    slotMax: number,
    prefix: string,
  ) => {
    return slots.map((slot) => (
      <View
        key={`${prefix}-${slot.time_slot}`}
        className="flex-row items-center py-1.5 border-b border-gray-100"
      >
        <Text className="w-14 text-gray-600 text-sm font-medium">
          {slot.time_slot}
        </Text>

        <View className="flex-1 mx-2 h-5 bg-gray-100 rounded overflow-hidden">
          <View
            className="h-full flex-row"
            style={{
              width: `${Math.min((slot.count / slotMax) * 100, 100)}%`,
            }}
          >
            {displayGroups.map((group) => {
              const groupCount = slot.group_counts[group.id] ?? 0;
              if (groupCount <= 0 || slot.count <= 0) return null;

              return (
                <View
                  key={`${prefix}-${slot.time_slot}-${group.id}`}
                  style={{
                    width: `${(groupCount / slot.count) * 100}%`,
                    backgroundColor: group.color,
                  }}
                />
              );
            })}
          </View>
        </View>

        <Text className="w-12 text-right text-gray-900 font-semibold">
          {slot.count}人
        </Text>
      </View>
    ));
  };

  return (
    <View className="px-4 pb-4 bg-slate-50">
      <TouchableOpacity
        onPress={() => setShowTrend(!showTrend)}
        className="bg-white rounded-xl p-3 mb-3 flex-row items-center justify-between"
      >
        <Text className="text-gray-700 font-semibold">本日の推移</Text>
        <Text className="text-gray-400">{showTrend ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {showTrend && (
        <Card className="mb-3">
          { groups.length >= 2 &&  (
          <View className="flex-row flex-wrap mb-3 gap-x-4 gap-y-2">
            {displayGroups.map((group) => (
              <View key={group.id} className="flex-row items-center">
                <View
                  className="w-3 h-3 rounded-sm mr-1"
                  style={{ backgroundColor: group.color }}
                />
                <Text className="text-xs text-gray-600">{group.name}</Text>
              </View>
            ))}
          </View>
          )}

          {mergedSlotData.length > 0 ? (
            renderTrendRows(mergedSlotData, maxVisitorSlot, "today")
          ) : (
            <Text className="text-gray-500 text-center py-4">
              まだデータがありません
            </Text>
          )}
        </Card>
      )}

      {showTrend && (
        <View className="mt-3">
          <Text className="text-gray-700 font-semibold mb-2 px-1">
            過去の日ごとの推移
          </Text>
          {pastDailyTrends.length > 0 ? (
            pastDailyTrends.map((trend) => (
              <Card key={trend.date_key} className="mb-3">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-gray-700 font-semibold">
                    {trend.date_label}
                  </Text>
                  <Text className="text-gray-500 text-sm">
                    合計: {trend.total}人
                  </Text>
                </View>
                {trend.slots.length > 0 ? (
                  renderTrendRows(trend.slots, trend.max_slot, trend.date_key)
                ) : (
                  <Text className="text-gray-500 text-center py-3">
                    データがありません
                  </Text>
                )}
              </Card>
            ))
          ) : (
            <Card>
              <Text className="text-gray-500 text-center py-4">
                過去日のデータはまだありません
              </Text>
            </Card>
          )}
        </View>
      )}
    </View>
  );
};
