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
  getStoreSettings,
  saveBudgetExpenses,
  saveDefaultExpenseRecorder,
  saveBudgetExpense,
} from "lib/storage";
import { isSupabaseConfigured, supabase } from "lib/supabase";
import type {
  Branch,
  BudgetExpense,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpensePaymentMethodSettings,
} from "types/database";
import { useAuth } from "contexts/AuthContext";
import { useSubscription } from "contexts/SubscriptionContext";
import { DEMO_BUDGET_EXPENSES, resolveDemoBranchId } from "data/demoData";

interface Props {
  branch: Branch;
  onBack: () => void;
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  material: "食材費",
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
  cashless: "キャッシュレス",
  bank_transfer: "振込・ネット決済",
  advance: "立替",
};

const PAYMENT_METHOD_COLORS: Record<ExpensePaymentMethod, { bg: string; text: string }> = {
  cash: { bg: "bg-emerald-100", text: "text-emerald-700" },
  cashless: { bg: "bg-indigo-100", text: "text-indigo-700" },
  bank_transfer: { bg: "bg-sky-100", text: "text-sky-700" },
  advance: { bg: "bg-amber-100", text: "text-amber-700" },
};
const EXPENSE_PAYMENT_METHOD_ORDER: ExpensePaymentMethod[] = ["cash", "cashless", "bank_transfer", "advance"];
const DEFAULT_EXPENSE_PAYMENT_METHODS: ExpensePaymentMethodSettings = {
  cash: true,
  cashless: true,
  bank_transfer: true,
  advance: true,
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
  const { canSync } = useSubscription();
  const isDemo = authState.status === "demo";
  const demoBranchId = resolveDemoBranchId(branch);
  const canSyncToSupabase =
    isSupabaseConfigured() && !isDemo && (authState.status === "login_code" || canSync);

  const [expenses, setExpenses] = useState<BudgetExpense[]>([]);
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("material");
  const [expAmount, setExpAmount] = useState("");
  const [expMemo, setExpMemo] = useState("");
  const [expRecorder, setExpRecorder] = useState("");
  const [expPaymentMethod, setExpPaymentMethod] = useState<ExpensePaymentMethod>("cash");
  const [expIsReimbursed, setExpIsReimbursed] = useState(false);
  const [showCategoryHint, setShowCategoryHint] = useState(false);
  const [hintCategory, setHintCategory] = useState<ExpenseCategory>("material");
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<ExpenseTab>("entry");
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState<"all" | ExpenseCategory>("all");
  const [historyRecorderFilter, setHistoryRecorderFilter] = useState<string>("all");
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState<"all" | ExpensePaymentMethod>("all");
  const [historySort, setHistorySort] = useState<ExpenseSortKey>("created_desc");
  const [pendingReimbursedToggle, setPendingReimbursedToggle] = useState<BudgetExpense | null>(null);
  const [enabledExpensePaymentMethods, setEnabledExpensePaymentMethods] = useState<ExpensePaymentMethodSettings>(
    DEFAULT_EXPENSE_PAYMENT_METHODS,
  );

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
      { category: "equipment", amount: 2500, recorded_by: "デモ担当", payment_method: "bank_transfer", memo: "ガスボンベ補充" },
      { category: "decoration", amount: 1200, recorded_by: "デモ担当", payment_method: "cashless", memo: "POP作成食材" },
      { category: "other", amount: 800, recorded_by: "デモ担当", payment_method: "cash", memo: "備品雑費" },
      { category: "material", amount: 1800, recorded_by: "デモ担当", payment_method: "advance", memo: "容器・割り箸追加" },
      { category: "equipment", amount: 1500, recorded_by: "デモ担当", payment_method: "bank_transfer", memo: "レンタル備品延長" },
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
        is_reimbursed: template.payment_method === "advance" ? i % 2 === 0 : false,
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
            is_reimbursed: expense.is_reimbursed ?? false,
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
              ? "cashless"
              : expense.payment_method === "amazon"
                ? "bank_transfer"
                : expense.payment_method === "online"
                  ? "bank_transfer"
                : expense.payment_method,
          recorded_by: expense.recorded_by ?? "",
          is_reimbursed: expense.is_reimbursed ?? false,
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

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

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
    const loadPaymentMethodSettings = async () => {
      const settings = await getStoreSettings();
      const nextSettings = settings.expense_payment_methods ?? DEFAULT_EXPENSE_PAYMENT_METHODS;
      setEnabledExpensePaymentMethods({
        cash: nextSettings.cash ?? true,
        cashless: nextSettings.cashless ?? true,
        bank_transfer: nextSettings.bank_transfer ?? true,
        advance: nextSettings.advance ?? true,
      });
    };
    loadPaymentMethodSettings();
  }, [branch.id]);

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
  const enabledExpenseMethods = useMemo(() => {
    const enabled = EXPENSE_PAYMENT_METHOD_ORDER.filter((method) => enabledExpensePaymentMethods[method]);
    return enabled.length > 0 ? enabled : EXPENSE_PAYMENT_METHOD_ORDER;
  }, [enabledExpensePaymentMethods]);
  const paymentMethodButtonWidth = enabledExpenseMethods.length >= 4 ? "48%" : "100%";

  useEffect(() => {
    if (historyRecorderFilter === "all") return;
    if (historyRecorderOptions.includes(historyRecorderFilter)) return;
    setHistoryRecorderFilter("all");
  }, [historyRecorderFilter, historyRecorderOptions]);

  useEffect(() => {
    if (enabledExpenseMethods.length === 0) return;
    if (enabledExpenseMethods.includes(expPaymentMethod)) return;
    setExpPaymentMethod(enabledExpenseMethods[0]);
  }, [enabledExpenseMethods, expPaymentMethod]);

  useEffect(() => {
    if (historyPaymentFilter === "all") return;
    if (enabledExpenseMethods.includes(historyPaymentFilter)) return;
    setHistoryPaymentFilter("all");
  }, [enabledExpenseMethods, historyPaymentFilter]);

  const handleAddExpense = async () => {
    const amount = parseInt(expAmount, 10);
    if (!amount || amount <= 0) {
      alertNotify("エラー", "金額を入力してください");
      return;
    }
    if (!expRecorder.trim()) {
      alertNotify("エラー", "登録者名を入力してください");
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
      is_reimbursed: expPaymentMethod === "advance" ? expIsReimbursed : false,
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
    setExpIsReimbursed(false);
    alertNotify("記録完了", "支出を記録しました");
  };

  const handleToggleReimbursed = async (expense: BudgetExpense) => {
    if (expense.payment_method !== "advance") return;
    const next = !expense.is_reimbursed;
    const updated = { ...expense, is_reimbursed: next, synced: false };
    setExpenses((prev) => prev.map((item) => (item.id === expense.id ? updated : item)));

    if (!isDemo) {
      const allLocal = await getBudgetExpenses();
      const merged = allLocal.map((item) => (item.id === expense.id ? updated : item));
      await saveBudgetExpenses(merged);
    }

    if (canSyncToSupabase) {
      try {
        await supabase.from("budget_expenses").update({ is_reimbursed: next }).eq("id", expense.id);
        setExpenses((prev) => prev.map((item) => (item.id === expense.id ? { ...item, synced: true } : item)));
      } catch (e) {
        console.log("Reimbursed status sync failed:", e);
      }
    }
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
          {expense.payment_method === "advance" ? (
            <View className={`px-1.5 py-0.5 rounded ${expense.is_reimbursed ? "bg-emerald-100" : "bg-amber-100"}`}>
              <Text className={`text-[10px] font-semibold ${expense.is_reimbursed ? "text-emerald-700" : "text-amber-700"}`}>
                {expense.is_reimbursed ? "精算済み" : "未精算"}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        {expense.payment_method === "advance" ? (
          <TouchableOpacity
            onPress={() => setPendingReimbursedToggle(expense)}
            className={`rounded-lg px-2 py-1 ${expense.is_reimbursed ? "bg-amber-100" : "bg-emerald-100"}`}
          >
            <Text className={`text-xs font-semibold ${expense.is_reimbursed ? "text-amber-700" : "text-emerald-700"}`}>
              {expense.is_reimbursed ? "未精算に戻す" : "精算済みにする"}
            </Text>
          </TouchableOpacity>
        ) : null}
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

      <Modal
        visible={!!pendingReimbursedToggle}
        onClose={() => setPendingReimbursedToggle(null)}
        title="精算状態の変更"
      >
        <Text className="text-gray-600 text-sm mb-3">
          {pendingReimbursedToggle?.is_reimbursed
            ? "この支出を未精算に戻しますか？"
            : "この支出を精算済みにしますか？"}
        </Text>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              title="キャンセル"
              variant="secondary"
              onPress={() => setPendingReimbursedToggle(null)}
            />
          </View>
          <View className="flex-1">
            <Button
              title="変更する"
              onPress={() => {
                if (pendingReimbursedToggle) {
                  void handleToggleReimbursed(pendingReimbursedToggle);
                }
                setPendingReimbursedToggle(null);
              }}
            />
          </View>
        </View>
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
                <TextInput
                  value={expRecorder}
                  onChangeText={setExpRecorder}
                  placeholder="例：山田 太郎"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
                  placeholderTextColor="#9CA3AF"
                />
                <Text className="text-gray-400 text-xs mt-1">前回記録した登録者名が自動入力されます</Text>
              </View>

              <View className="mb-3">
                <Text className="text-gray-600 text-sm mb-1">支払い方法</Text>
                <View className="flex-row flex-wrap justify-between">
                  {enabledExpenseMethods.map((method) => (
                    <TouchableOpacity
                      key={method}
                      onPress={() => setExpPaymentMethod(method)}
                      style={{ width: paymentMethodButtonWidth }}
                      className={`py-2 rounded-lg items-center border mb-2 ${
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

              {expPaymentMethod === "advance" ? (
                <View className="mb-3">
                  <Text className="text-gray-600 text-sm mb-1">立替の精算状況</Text>
                  <TouchableOpacity
                    onPress={() => setExpIsReimbursed((prev) => !prev)}
                    activeOpacity={0.8}
                    className={`rounded-lg border px-3 py-2 ${expIsReimbursed ? "border-emerald-500 bg-emerald-50" : "border-amber-500 bg-amber-50"}`}
                  >
                    <Text className={`text-sm font-semibold ${expIsReimbursed ? "text-emerald-700" : "text-amber-700"}`}>
                      {expIsReimbursed ? "精算済み" : "未精算"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

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
                disabled={!expRecorder.trim()}
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
                {enabledExpenseMethods.map((method) => (
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
