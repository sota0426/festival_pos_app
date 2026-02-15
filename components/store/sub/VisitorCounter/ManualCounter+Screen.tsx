import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Modal } from "components/common";
import { getVisitorGroups, saveVisitorGroups, verifyAdminPassword } from "lib/storage";
import { useVisitorCounter } from "hooks/useVisitorCounter";
import type { Branch, VisitorCounterGroup, VisitorGroup } from "types/database";
import { ManualCounter } from "./ManualCounter";
import { VisitorFooter } from "./VisitorScreen+Footer";
import { VisitorHeader } from "./VisitorScreen+Header";

interface Props {
  branch: Branch;
  onBack: () => void;
}

export type GroupOption = VisitorCounterGroup;

const MAX_GROUPS = 4;
const COLORS = ["#7C3AED", "#2563EB", "#16A34A", "#F97316"];
const GROUP_TYPE_IDS = ["group1", "group2", "group3", "group4"] as const;

const createDefaultGroups = (): GroupOption[] => [
  {
    id: "group1",
    name: "一般客",
    color: COLORS[0],
  },
];

const normalizeGroups = (inputGroups: GroupOption[]): GroupOption[] => {
  const used = new Set<string>();
  const normalized: GroupOption[] = [];

  inputGroups.forEach((group, index) => {
    if (normalized.length >= MAX_GROUPS) return;
    let nextId = group.id;
    if (!GROUP_TYPE_IDS.includes(nextId as (typeof GROUP_TYPE_IDS)[number]) || used.has(nextId)) {
      const available = GROUP_TYPE_IDS.find((id) => !used.has(id));
      if (!available) return;
      nextId = available;
    }

    used.add(nextId);
    normalized.push({
      id: nextId,
      name: group.name?.trim() ? group.name : `グループ${index + 1}`,
      color: group.color ?? COLORS[index % COLORS.length],
    });
  });

  if (normalized.length === 0) return createDefaultGroups();
  return normalized;
};

export const ManualCounterScreen = ({ branch, onBack }: Props) => {
  const {
    groupCounts,
    todayTotal,
    lastCountTime,
    handleCount,
    formatTime,
    quarterHourlyGroupData,
    maxVisitorSlot,
    pastDailyTrends,
    resetTodayCounts,
    resetAllCounts,
  } = useVisitorCounter(branch.id);

  const [groups, setGroups] = useState<GroupOption[]>(createDefaultGroups());
  const [loadedGroups, setLoadedGroups] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetMode, setResetMode] = useState<"today" | "all">("today");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    const loadGroups = async () => {
      const savedGroups = await getVisitorGroups(branch.id);
      if (savedGroups.length > 0) {
        const normalized = normalizeGroups(savedGroups);
        setGroups(normalized);
        await saveVisitorGroups(branch.id, normalized);
      } else {
        const defaults = createDefaultGroups();
        setGroups(defaults);
        await saveVisitorGroups(branch.id, defaults);
      }
      setLoadedGroups(true);
    };
    loadGroups();
  }, [branch.id]);

  const persistGroups = useCallback(
    async (nextGroups: GroupOption[]) => {
      setGroups(nextGroups);
      await saveVisitorGroups(branch.id, nextGroups);
    },
    [branch.id],
  );

  const addGroup = async () => {
    if (groups.length >= MAX_GROUPS) return;

    const usedColors = groups.map((group) => group.color);
    const color =
      COLORS.find((value) => !usedColors.includes(value)) ??
      COLORS[groups.length % COLORS.length];
    const nextId = GROUP_TYPE_IDS.find(
      (id) => !groups.some((group) => group.id === id),
    );
    if (!nextId) return;
    const newIndex = groups.length + 1;
    const nextGroups = [
      ...groups,
      {
        id: nextId as VisitorGroup,
        name: `グループ${newIndex}`,
        color,
      },
    ];

    await persistGroups(nextGroups);
  };

  const handleRename = async (groupId: VisitorGroup, name: string) => {
    const nextGroups = groups.map((group) =>
      group.id === groupId ? { ...group, name } : group,
    );
    await persistGroups(nextGroups);
  };

  const handleDelete = async (groupId: VisitorGroup) => {
    if (groups.length <= 1) return;
    const nextGroups = groups.filter((group) => group.id !== groupId);
    await persistGroups(nextGroups);
  };

  const requestReset = (mode: "today" | "all") => {
    setResetMode(mode);
    setAdminPasswordInput("");
    setResetError("");
    setShowResetModal(true);
  };

  const handleConfirmedReset = async () => {
    if (!adminPasswordInput.trim()) {
      setResetError("管理者パスワードを入力してください");
      return;
    }

    const isValid = await verifyAdminPassword(adminPasswordInput);
    if (!isValid) {
      setResetError("パスワードが正しくありません");
      return;
    }

    const executeReset = async () => {
      if (resetMode === "today") {
        await resetTodayCounts();
      } else {
        await resetAllCounts();
      }

      setShowResetModal(false);
      setAdminPasswordInput("");
      setResetError("");
    };

    const confirmMessage =
      resetMode === "today"
        ? "本日の来客カウントを削除します。よろしいですか？"
        : "この店舗の来客カウントをすべて削除します。よろしいですか？";

    if (Platform.OS === "web") {
      if (window.confirm(confirmMessage)) {
        await executeReset();
      }
      return;
    }

    Alert.alert(
      "最終確認",
      confirmMessage,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除する",
          style: "destructive",
          onPress: () => {
            executeReset();
          },
        },
      ],
    );
  };

  if (!loadedGroups) {
    return (
      <SafeAreaView className="flex-1 bg-purple-50 items-center justify-center">
        <Text className="text-gray-500">読み込み中...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-purple-50" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <VisitorHeader
          branch={branch}
          onBack={onBack}
          todayTotal={todayTotal}
          lastCountLabel={formatTime(lastCountTime)}
        />

        <View className="px-4 pb-2 flex justify-between">
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => requestReset("today")}
              className="bg-amber-400 px-4 py-2 rounded-xl"
            >
              <Text className="text-white font-bold text-xs">本日をリセット</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => requestReset("all")}
              className="bg-red-400 px-4 py-2 rounded-xl"
            >
              <Text className="text-white font-bold text-xs">すべて削除</Text>
            </TouchableOpacity>
          </View>
          <View className="flex-row justify-end mb-2">
            {groups.length < MAX_GROUPS && (
              <TouchableOpacity
                onPress={addGroup}
                className="bg-green-600 px-4 py-2 rounded-xl"
              >
                <Text className="text-white font-bold text-xs">＋ グループ追加</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ManualCounter
          groups={groups}
          counts={groupCounts}
          onCount={handleCount}
          onDelete={handleDelete}
          onRename={handleRename}
        />

     {/* 説明文 */}
      <View className="mt-6 items-end">
        <Text className="text-gray-600 text-center text-xs pb-3 pr-2">
          ※ 長押しで名称変更・数値変更ができます
        </Text>
      </View>

        <VisitorFooter
          groups={groups}
          quarterHourlyGroupData={quarterHourlyGroupData}
          maxVisitorSlot={maxVisitorSlot}
          pastDailyTrends={pastDailyTrends}
        />
      </ScrollView>

      <Modal
        visible={showResetModal}
        onClose={() => setShowResetModal(false)}
        title={resetMode === "today" ? "本日の来客数をリセット" : "来客数をすべて削除"}
      >
        <View className="gap-3">
          <Text className="text-gray-600 text-sm">
            管理者パスワードを入力して実行してください。
            {"\n"}初期パスワードは「0000」です。設定タブから変更できます。
          </Text>
          <TextInput
            value={adminPasswordInput}
            onChangeText={(text) => {
              setAdminPasswordInput(text);
              setResetError("");
            }}
            secureTextEntry
            placeholder="管理者パスワード"
            className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
            placeholderTextColor="#9CA3AF"
          />
          {resetError ? (
            <Text className="text-red-500 text-sm">{resetError}</Text>
          ) : null}
          <View className="flex-row justify-end gap-2">
            <TouchableOpacity
              onPress={() => setShowResetModal(false)}
              className="px-4 py-2 rounded-lg bg-gray-200"
            >
              <Text className="text-gray-700 font-semibold">キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirmedReset}
              className="px-4 py-2 rounded-lg bg-red-500"
            >
              <Text className="text-white font-semibold">実行</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
