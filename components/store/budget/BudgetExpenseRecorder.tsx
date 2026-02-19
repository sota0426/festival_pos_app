import { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Crypto from "expo-crypto";
import { Button, Card, Header, Modal } from "components/common";
import { alertConfirm, alertNotify } from "lib/alertUtils";
import {
  deleteBudgetExpense,
  getDefaultExpenseRecorder,
  getBudgetExpenses,
  saveBudgetExpenses,
  saveDefaultExpenseRecorder,
  saveBudgetExpense,
} from "lib/storage";
import { fetchBranchRecorders } from "lib/recorderRegistry";
import { isSupabaseConfigured, supabase } from "lib/supabase";
import type { Branch, BranchRecorder, BudgetExpense, ExpenseCategory, ExpensePaymentMethod } from "types/database";
import { useAuth } from "contexts/AuthContext";
import { DEMO_BUDGET_EXPENSES, resolveDemoBranchId } from "data/demoData";

interface Props {
  branch: Branch;
  onBack: () => void;
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  material: "材料費",
  decoration: "装飾費",
  equipment: "機材・設備費",
  other: "その他",
};

const CATEGORY_HINTS: Record<ExpenseCategory, string> = {
  material: "食材、調味料、容器、紙コップ、ストロー、割り箸、ラップ等",
  decoration: "看板、ポスター、テーブルクロス、装飾品、風船等",
  equipment: "レンタル機材、調理器具、テント、テーブル、椅子、延長コード等",
  other: "交通費、印刷費、許可申請費、雑費等",
};

const CATEGORY_COLORS: Record<ExpenseCategory, { bg: string; text: string }> = {
  material: { bg: "bg-blue-100", text: "text-blue-700" },
  decoration: { bg: "bg-purple-100", text: "text-purple-700" },
  equipment: { bg: "bg-teal-100", text: "text-teal-700" },
  other: { bg: "bg-orange-100", text: "text-orange-700" },
};

const PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: "現金",
  online: "クレジット",
  cashless: "キャッシュレス",
};

const PAYMENT_METHOD_COLORS: Record<ExpensePaymentMethod, { bg: string; text: string }> = {
  cash: { bg: "bg-emerald-100", text: "text-emerald-700" },
  online: { bg: "bg-sky-100", text: "text-sky-700" },
  cashless: { bg: "bg-indigo-100", text: "text-indigo-700" },
};
const INITIAL_VISIBLE_EXPENSES = 5;
type ExpenseTab = "entry" | "history";
type ExpenseSortKey = "created_desc" | "created_asc" | "amount_desc" | "amount_asc";

const EXPENSE_TABS: { key: ExpenseTab; label: string }[] = [
  { key: "entry", label: "支出記録" },
  { key: "history", label: "支出履歴" },
];

const EXPENSE_SORT_OPTIONS: { key: ExpenseSortKey; label: string }[] = [
  { key: "created_desc", label: "新しい順" },
  { key: "created_asc", label: "古い順" },
  { key: "amount_desc", label: "金額が高い順" },
  { key: "amount_asc", label: "金額が低い順" },
];

export const BudgetExpenseRecorder = ({ branch, onBack }: Props) => {
  const { authState } = useAuth();
  const isDemo = authState.status === "demo";
  const demoBranchId = resolveDemoBranchId(branch);
  const canSyncToSupabase = isSupabaseConfigured() && !isDemo;

  const [expenses, setExpenses] = useState<BudgetExpense[]>([]);
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("material");
  const [expAmount, setExpAmount] = useState("");
  const [expMemo, setExpMemo] = useState("");
  const [expRecorder, setExpRecorder] = useState("");
  const [expPaymentMethod, setExpPaymentMethod] = useState<ExpensePaymentMethod>("cash");
  const [showCategoryHint, setShowCategoryHint] = useState(false);
  const [hintCategory, setHintCategory] = useState<ExpenseCategory>("material");
  const [syncing, setSyncing] = useState(false);
  const [recorderOptions, setRecorderOptions] = useState<BranchRecorder[]>([]);
  const [showRecorderModal, setShowRecorderModal] = useState(false);
  const [activeTab, setActiveTab] = useState<ExpenseTab>("entry");
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState<"all" | ExpenseCategory>("all");
  const [historyRecorderFilter, setHistoryRecorderFilter] = useState<string>("all");
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState<"all" | ExpensePaymentMethod>("all");
  const [historySort, setHistorySort] = useState<ExpenseSortKey>("created_desc");

  const buildDemoExpenses = useCallback((): BudgetExpense[] => {
    const base = (demoBranchId ? DEMO_BUDGET_EXPENSES[demoBranchId] ?? [] : [])
      .map((expense) => ({
        ...expense,
        branch_id: branch.id,
        synced: true,
      }));

    if (base.length >= 6) return base.slice(0, 6);

    const templates: {
      category: ExpenseCategory;
      amount: number;
      recorded_by: string;
      payment_method: ExpensePaymentMethod;
      memo: string;
    }[] = [
      { category: "material", amount: 3000, recorded_by: "デモ担当", payment_method: "cash", memo: "追加食材の購入" },
      { category: "equipment", amount: 2500, recorded_by: "デモ担当", payment_method: "online", memo: "ガスボンベ補充" },
      { category: "decoration", amount: 1200, recorded_by: "デモ担当", payment_method: "cashless", memo: "POP作成材料" },
      { category: "other", amount: 800, recorded_by: "デモ担当", payment_method: "cash", memo: "備品雑費" },
      { category: "material", amount: 1800, recorded_by: "デモ担当", payment_method: "online", memo: "容器・割り箸追加" },
      { category: "equipment", amount: 1500, recorded_by: "デモ担当", payment_method: "cash", memo: "レンタル備品延長" },
    ];

    const now = new Date();
    const extended = [...base];
    for (let i = base.length; i < 6; i += 1) {
      const createdAt = new Date(now.getTime() - (6 - i) * 20 * 60 * 1000).toISOString();
      const template = templates[i];
      extended.push({
        id: `demo-expense-seed-${branch.id}-${i + 1}`,
        branch_id: branch.id,
        date: createdAt.split("T")[0],
        category: template.category,
        amount: template.amount,
        recorded_by: template.recorded_by,
        payment_method: template.payment_method,
        memo: template.memo,
        receipt_image: null,
        created_at: createdAt,
        synced: true,
      });
    }
    return extended;
  }, [branch.id, demoBranchId]);

  const syncExpenses = useCallback(async () => {
    if (isDemo) {
      setExpenses(buildDemoExpenses());
      return;
    }

    const allLocal = await getBudgetExpenses();
    const branchLocal = allLocal.filter((expense) => expense.branch_id === branch.id);

    if (!canSyncToSupabase) {
      setExpenses(branchLocal);
      return;
    }

    setSyncing(true);
    try {
      const unsynced = branchLocal.filter((expense) => !expense.synced);
      const failedIds = new Set<string>();

      for (const expense of unsynced) {
        const { error } = await supabase.from("budget_expenses").upsert(
          {
            id: expense.id,
            branch_id: expense.branch_id,
            date: expense.date,
            category: expense.category,
            amount: expense.amount,
            recorded_by: expense.recorded_by,
            payment_method: expense.payment_method,
            memo: expense.memo,
            receipt_image: expense.receipt_image,
            created_at: expense.created_at,
          },
          { onConflict: "id" },
        );
        if (error) {
          failedIds.add(expense.id);
        }
      }

      const { data: remoteExpenses, error: fetchError } = await supabase
        .from("budget_expenses")
        .select("*")
        .eq("branch_id", branch.id)
        .order("created_at", { ascending: true });

      if (fetchError) {
        setExpenses(branchLocal);
        return;
      }

      const mergedBranchExpenses: BudgetExpense[] = [
        ...(remoteExpenses ?? []).map((expense: any) => ({
          ...expense,
          synced: true,
          payment_method:
            expense.payment_method === "paypay"
              ? "online"
              : expense.payment_method === "amazon"
                ? "cashless"
                : expense.payment_method,
          recorded_by: expense.recorded_by ?? "",
        })),
        ...branchLocal
          .filter((expense) => failedIds.has(expense.id))
          .map((expense) => ({ ...expense, synced: false })),
      ];

      const otherBranches = allLocal.filter((expense) => expense.branch_id !== branch.id);
      await saveBudgetExpenses([...otherBranches, ...mergedBranchExpenses]);
      setExpenses(mergedBranchExpenses);
    } finally {
      setSyncing(false);
    }
  }, [branch.id, canSyncToSupabase, isDemo, buildDemoExpenses]);

  const loadExpenses = useCallback(async () => {
    await syncExpenses();
  }, [syncExpenses]);

  const loadRecorderOptions = useCallback(async () => {
    if (isDemo) {
      const now = new Date().toISOString();
      setRecorderOptions([
        {
          id: `demo-recorder-${branch.id}`,
          branch_id: branch.id,
          recorder_name: "デモ担当",
          note: "デモ用登録者",
          group_id: 1,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ]);
      return;
    }
    const options = await fetchBranchRecorders(branch.id, canSyncToSupabase);
    setRecorderOptions(options);
  }, [branch.id, canSyncToSupabase, isDemo]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    loadRecorderOptions();
  }, [loadRecorderOptions]);

  useEffect(() => {
    const timer = setInterval(() => {
      syncExpenses();
    }, 30 * 1000);
    return () => clearInterval(timer);
  }, [syncExpenses]);

  useEffect(() => {
    const loadDefaultRecorder = async () => {
      const recorder = await getDefaultExpenseRecorder(branch.id);
      setExpRecorder(recorder.trim());
    };
    loadDefaultRecorder();
  }, [branch.id]);

  useEffect(() => {
    if (expRecorder.trim()) return;
    if (recorderOptions.length === 0) return;
    setExpRecorder(recorderOptions[0].recorder_name);
  }, [expRecorder, recorderOptions]);

  useEffect(() => {
    if (!expRecorder.trim()) return;
    if (recorderOptions.some((item) => item.recorder_name === expRecorder.trim())) return;
    setExpRecorder(recorderOptions[0]?.recorder_name ?? "");
  }, [expRecorder, recorderOptions]);

  const expenseWithNumbers = useMemo(() => {
    const sorted = [...expenses].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return sorted.map((expense, idx) => ({ ...expense, expenseNo: idx + 1 }));
  }, [expenses]);
  const sortedExpenses = useMemo(
    () => [...expenseWithNumbers].reverse(),
    [expenseWithNumbers],
  );
  const visibleExpenses = useMemo(
    () => sortedExpenses.slice(0, INITIAL_VISIBLE_EXPENSES),
    [sortedExpenses],
  );
  const historyRecorderOptions = useMemo(() => {
    const names = Array.from(
      new Set(expenses.map((expense) => expense.recorded_by?.trim()).filter((name): name is string => !!name)),
    );
    return names.sort((a, b) => a.localeCompare(b, "ja"));
  }, [expenses]);
  const filteredHistoryExpenses = useMemo(() => {
    const filtered = expenseWithNumbers.filter((expense) => {
      if (historyCategoryFilter !== "all" && expense.category !== historyCategoryFilter) return false;
      if (historyPaymentFilter !== "all" && expense.payment_method !== historyPaymentFilter) return false;
      if (historyRecorderFilter !== "all" && expense.recorded_by !== historyRecorderFilter) return false;
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (historySort === "created_asc") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (historySort === "created_desc") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (historySort === "amount_asc") return a.amount - b.amount;
      return b.amount - a.amount;
    });
    return sorted;
  }, [expenseWithNumbers, historyCategoryFilter, historyPaymentFilter, historyRecorderFilter, historySort]);

  useEffect(() => {
    if (historyRecorderFilter === "all") return;
    if (historyRecorderOptions.includes(historyRecorderFilter)) return;
    setHistoryRecorderFilter("all");
  }, [historyRecorderFilter, historyRecorderOptions]);

  const handleAddExpense = async () => {
    const amount = parseInt(expAmount, 10);
    if (!amount || amount <= 0) {
      alertNotify("エラー", "金額を入力してください");
      return;
    }
    if (!expRecorder.trim()) {
      alertNotify("エラー", "登録者を選択してください");
      return;
    }
    const recorderName = expRecorder.trim();

    const expense: BudgetExpense = {
      id: Crypto.randomUUID(),
      branch_id: branch.id,
      date: new Date().toISOString().split("T")[0],
      category: expCategory,
      amount,
      recorded_by: recorderName,
      payment_method: expPaymentMethod,
      memo: expMemo,
      receipt_image: null,
      created_at: new Date().toISOString(),
      synced: false,
    };

    if (!isDemo) {
      await saveDefaultExpenseRecorder(branch.id, recorderName);
      await saveBudgetExpense(expense);
    }
    setExpenses((prev) => [...prev, expense]);

    if (!isDemo) {
      await syncExpenses();
    }

    setExpAmount("");
    setExpMemo("");
    alertNotify("記録完了", "支出を記録しました");
  };

  const handleDeleteExpense = (id: string) => {
    alertConfirm(
      "確認",
      "この支出を削除しますか？",
      async () => {
        if (!isDemo) {
          await deleteBudgetExpense(id);
        }
        setExpenses((prev) => prev.filter((expense) => expense.id !== id));

        if (canSyncToSupabase) {
          try {
            await supabase.from("budget_expenses").delete().eq("id", id);
          } catch (e) {
            console.log("Expense delete sync failed:", e);
          }
        }
      },
      "削除",
    );
  };

  const selectedRecorderLabel = expRecorder.trim() || "登録者を選択してください";

  const CategoryBadge = ({ category }: { category: ExpenseCategory }) => (
    <View className={`px-2 py-1 rounded-full ${CATEGORY_COLORS[category].bg}`}>
      <Text className={`text-xs font-semibold ${CATEGORY_COLORS[category].text}`}>
        {CATEGORY_LABELS[category]}
      </Text>
    </View>
  );

  const ExpenseRow = ({ expense }: { expense: BudgetExpense & { expenseNo: number } }) => (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-100">
      <View className="flex-1">
        <View className="flex-row items-center gap-2 mb-1">
          <View className="bg-gray-200 rounded px-1.5 py-0.5">
            <Text className="text-gray-600 text-xs font-bold">No.{expense.expenseNo}</Text>
          </View>
          <Text className="text-gray-400 text-xs">{expense.date}</Text>
          <CategoryBadge category={expense.category} />
        </View>
        {expense.memo ? (
          <Text className="text-gray-700 text-sm" numberOfLines={1}>
            {expense.memo}
          </Text>
        ) : null}
        <View className="flex-row items-center gap-2 mt-0.5">
          <Text className="text-gray-400 text-xs">
            登録者: {expense.recorded_by || "未設定"}
          </Text>
          <View className={`px-1.5 py-0.5 rounded ${PAYMENT_METHOD_COLORS[expense.payment_method].bg}`}>
            <Text className={`text-[10px] font-semibold ${PAYMENT_METHOD_COLORS[expense.payment_method].text}`}>
              {PAYMENT_METHOD_LABELS[expense.payment_method]}
            </Text>
          </View>
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="text-gray-900 font-bold">¥{expense.amount.toLocaleString()}</Text>
        <TouchableOpacity
          onPress={() => handleDeleteExpense(expense.id)}
          className="bg-red-100 rounded-lg px-2 py-1"
        >
          <Text className="text-red-600 text-xs font-semibold">削除</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-100" edges={["top"]}>
      <Header
        title="支出管理"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
        rightElement={
          canSyncToSupabase ? (
            <Button title={syncing ? "同期中..." : "同期"} onPress={syncExpenses} size="sm" disabled={syncing} />
          ) : null
        }
      />

      <Modal
        visible={showCategoryHint}
        onClose={() => setShowCategoryHint(false)}
        title={`${CATEGORY_LABELS[hintCategory]}について`}
      >
        <View className="gap-3">
          <View className={`p-3 rounded-lg ${CATEGORY_COLORS[hintCategory].bg}`}>
            <Text className={`font-bold ${CATEGORY_COLORS[hintCategory].text}`}>
              {CATEGORY_LABELS[hintCategory]}
            </Text>
          </View>
          <Text className="text-gray-600 text-sm leading-5">
            {CATEGORY_HINTS[hintCategory]}
          </Text>
        </View>
      </Modal>

      <Modal visible={showRecorderModal} onClose={() => setShowRecorderModal(false)} title="登録者を選択">
        {recorderOptions.length === 0 ? (
          <Text className="text-gray-500 text-sm">
            登録者が設定されていません。設定画面の「登録者設定」で追加してください。
          </Text>
        ) : (
          <View className="gap-2">
            {recorderOptions.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  setExpRecorder(item.recorder_name);
                  setShowRecorderModal(false);
                }}
                activeOpacity={0.8}
                className={`rounded-lg border px-3 py-3 ${
                  expRecorder === item.recorder_name ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
                }`}
              >
                <Text className={`font-semibold ${expRecorder === item.recorder_name ? "text-blue-700" : "text-gray-800"}`}>
                  {item.recorder_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Modal>

      <View className="flex-row bg-white border-b border-gray-200">
        {EXPENSE_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
            className={`flex-1 py-3 items-center ${activeTab === tab.key ? "bg-indigo-500" : "bg-white"}`}
          >
            <Text className={`text-sm font-bold ${activeTab === tab.key ? "text-white" : "text-gray-500"}`}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView 
        className="flex-1 p-4" 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingBottom:100}}
      >
        {activeTab === "entry" ? (
          <>
            <Card className="mb-4">
              <Text className="text-gray-900 text-lg font-bold mb-3">支出を記録</Text>

              <View className="mb-3">
                <Text className="text-gray-600 text-sm mb-1">カテゴリ</Text>
                <View className="flex-row flex-wrap gap-2">
                  {(["material", "decoration", "equipment", "other"] as ExpenseCategory[]).map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setExpCategory(cat)}
                      onLongPress={() => {
                        setHintCategory(cat);
                        setShowCategoryHint(true);
                      }}
                      style={{ width: "48%" }}
                      className={`py-2 rounded-lg items-center border-2 ${
                        expCategory === cat
                          ? `${CATEGORY_COLORS[cat].bg} border-current`
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          expCategory === cat ? CATEGORY_COLORS[cat].text : "text-gray-400"
                        }`}
                      >
                        {CATEGORY_LABELS[cat]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View className="mb-3">
                <Text className="text-gray-600 text-sm mb-1">登録者</Text>
                <TouchableOpacity
                  onPress={() => setShowRecorderModal(true)}
                  activeOpacity={0.8}
                  className="border border-gray-300 rounded-lg px-3 py-2 bg-white"
                >
                  <Text className={`${expRecorder ? "text-gray-900" : "text-gray-400"} text-base`}>
                    {selectedRecorderLabel}
                  </Text>
                  <Text className="text-gray-400 text-xs mt-1">プルダウンから選択</Text>
                </TouchableOpacity>
                {recorderOptions.length === 0 ? (
                  <Text className="text-amber-600 text-xs mt-1">
                    登録者がありません。設定画面の「登録者設定」で先に登録してください。
                  </Text>
                ) : null}
              </View>

              <View className="mb-3">
                <Text className="text-gray-600 text-sm mb-1">支払い方法</Text>
                <View className="flex-row gap-2">
                  {(["cash", "online", "cashless"] as ExpensePaymentMethod[]).map((method) => (
                    <TouchableOpacity
                      key={method}
                      onPress={() => setExpPaymentMethod(method)}
                      className={`flex-1 py-2 rounded-lg items-center border ${
                        expPaymentMethod === method ? `${PAYMENT_METHOD_COLORS[method].bg} border-current` : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          expPaymentMethod === method ? PAYMENT_METHOD_COLORS[method].text : "text-gray-500"
                        }`}
                      >
                        {PAYMENT_METHOD_LABELS[method]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View className="mb-3">
                <Text className="text-gray-600 text-sm mb-1">金額（円）</Text>
                <TextInput
                  value={expAmount}
                  onChangeText={setExpAmount}
                  keyboardType="numeric"
                  placeholder="1500"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View className="mb-3">
                <Text className="text-gray-600 text-sm mb-1">メモ・品目</Text>
                <TextInput
                  value={expMemo}
                  onChangeText={setExpMemo}
                  placeholder="例：紙コップ 100個"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <Button
                title="支出を記録"
                onPress={handleAddExpense}
                variant="success"
                disabled={recorderOptions.length === 0 || !expRecorder.trim()}
              />
            </Card>

            <Card>
              <Text className="text-gray-900 text-lg font-bold mb-3">支出履歴（直近5件）</Text>
              {expenses.length === 0 ? (
                <Text className="text-gray-400 text-center py-4">支出データがありません</Text>
              ) : (
                <View className="gap-2">
                  {visibleExpenses.map((expense) => (
                    <ExpenseRow key={expense.id} expense={expense} />
                  ))}
                  <TouchableOpacity
                    onPress={() => setActiveTab("history")}
                    className="bg-indigo-50 rounded-lg px-4 py-2 items-center mt-2"
                    activeOpacity={0.8}
                  >
                    <Text className="text-indigo-600 font-semibold text-sm">支出履歴を見る</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          </>
        ) : (
          <>
            <Card className="mb-4">
              <Text className="text-gray-900 text-lg font-bold mb-3">絞り込み</Text>

              <Text className="text-gray-600 text-sm mb-1">カテゴリ</Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                <TouchableOpacity
                  onPress={() => setHistoryCategoryFilter("all")}
                  className={`px-3 py-1.5 rounded-full border ${historyCategoryFilter === "all" ? "bg-indigo-500 border-indigo-500" : "bg-white border-gray-300"}`}
                >
                  <Text className={`text-xs font-semibold ${historyCategoryFilter === "all" ? "text-white" : "text-gray-600"}`}>すべて</Text>
                </TouchableOpacity>
                {(["material", "decoration", "equipment", "other"] as ExpenseCategory[]).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setHistoryCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-full border ${historyCategoryFilter === cat ? "bg-indigo-500 border-indigo-500" : "bg-white border-gray-300"}`}
                  >
                    <Text className={`text-xs font-semibold ${historyCategoryFilter === cat ? "text-white" : "text-gray-600"}`}>
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-gray-600 text-sm mb-1">登録者</Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                <TouchableOpacity
                  onPress={() => setHistoryRecorderFilter("all")}
                  className={`px-3 py-1.5 rounded-full border ${historyRecorderFilter === "all" ? "bg-indigo-500 border-indigo-500" : "bg-white border-gray-300"}`}
                >
                  <Text className={`text-xs font-semibold ${historyRecorderFilter === "all" ? "text-white" : "text-gray-600"}`}>
                    すべて
                  </Text>
                </TouchableOpacity>
                {historyRecorderOptions.map((name) => (
                  <TouchableOpacity
                    key={name}
                    onPress={() => setHistoryRecorderFilter(name)}
                    className={`px-3 py-1.5 rounded-full border ${historyRecorderFilter === name ? "bg-indigo-500 border-indigo-500" : "bg-white border-gray-300"}`}
                  >
                    <Text className={`text-xs font-semibold ${historyRecorderFilter === name ? "text-white" : "text-gray-600"}`}>
                      {name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-gray-600 text-sm mb-1">支払い方法</Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                <TouchableOpacity
                  onPress={() => setHistoryPaymentFilter("all")}
                  className={`px-3 py-1.5 rounded-full border ${historyPaymentFilter === "all" ? "bg-indigo-500 border-indigo-500" : "bg-white border-gray-300"}`}
                >
                  <Text className={`text-xs font-semibold ${historyPaymentFilter === "all" ? "text-white" : "text-gray-600"}`}>すべて</Text>
                </TouchableOpacity>
                {(["cash", "online", "cashless"] as ExpensePaymentMethod[]).map((method) => (
                  <TouchableOpacity
                    key={method}
                    onPress={() => setHistoryPaymentFilter(method)}
                    className={`px-3 py-1.5 rounded-full border ${historyPaymentFilter === method ? "bg-indigo-500 border-indigo-500" : "bg-white border-gray-300"}`}
                  >
                    <Text className={`text-xs font-semibold ${historyPaymentFilter === method ? "text-white" : "text-gray-600"}`}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-gray-600 text-sm mb-1">並び順</Text>
              <View className="flex-row flex-wrap gap-2">
                {EXPENSE_SORT_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => setHistorySort(option.key)}
                    className={`px-3 py-1.5 rounded-full border ${historySort === option.key ? "bg-indigo-500 border-indigo-500" : "bg-white border-gray-300"}`}
                  >
                    <Text className={`text-xs font-semibold ${historySort === option.key ? "text-white" : "text-gray-600"}`}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>

            <Card>
              <Text className="text-gray-900 text-lg font-bold mb-3">
                支出履歴一覧（{filteredHistoryExpenses.length}件）
              </Text>
              {filteredHistoryExpenses.length === 0 ? (
                <Text className="text-gray-400 text-center py-4">条件に一致する支出データがありません</Text>
              ) : (
                <View className="gap-2">
                  {filteredHistoryExpenses.map((expense) => (
                    <ExpenseRow key={expense.id} expense={expense} />
                  ))}
                </View>
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};
