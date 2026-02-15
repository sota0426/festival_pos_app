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
import { isSupabaseConfigured, supabase } from "lib/supabase";
import type { Branch, BudgetExpense, ExpenseCategory, ExpensePaymentMethod } from "types/database";

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
  online: "オンライン",
  cashless: "キャッシュレス",
};

const PAYMENT_METHOD_COLORS: Record<ExpensePaymentMethod, { bg: string; text: string }> = {
  cash: { bg: "bg-emerald-100", text: "text-emerald-700" },
  online: { bg: "bg-sky-100", text: "text-sky-700" },
  cashless: { bg: "bg-indigo-100", text: "text-indigo-700" },
};

export const BudgetExpenseRecorder = ({ branch, onBack }: Props) => {
  const [expenses, setExpenses] = useState<BudgetExpense[]>([]);
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("material");
  const [expAmount, setExpAmount] = useState("");
  const [expMemo, setExpMemo] = useState("");
  const [expRecorder, setExpRecorder] = useState("");
  const [expPaymentMethod, setExpPaymentMethod] = useState<ExpensePaymentMethod>("cash");
  const [showCategoryHint, setShowCategoryHint] = useState(false);
  const [hintCategory, setHintCategory] = useState<ExpenseCategory>("material");
  const [syncing, setSyncing] = useState(false);

  const syncExpenses = useCallback(async () => {
    const allLocal = await getBudgetExpenses();
    const branchLocal = allLocal.filter((expense) => expense.branch_id === branch.id);

    if (!isSupabaseConfigured()) {
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
  }, [branch.id]);

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
      setExpRecorder(recorder);
    };
    loadDefaultRecorder();
  }, [branch.id]);

  const expenseWithNumbers = useMemo(() => {
    const sorted = [...expenses].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return sorted.map((expense, idx) => ({ ...expense, expenseNo: idx + 1 }));
  }, [expenses]);

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
      memo: expMemo,
      receipt_image: null,
      created_at: new Date().toISOString(),
      synced: false,
    };

    await saveDefaultExpenseRecorder(branch.id, recorderName);
    await saveBudgetExpense(expense);
    setExpenses((prev) => [...prev, expense]);

    await syncExpenses();

    setExpAmount("");
    setExpMemo("");
    alertNotify("記録完了", "支出を記録しました");
  };

  const handleDeleteExpense = (id: string) => {
    alertConfirm(
      "確認",
      "この支出を削除しますか？",
      async () => {
        await deleteBudgetExpense(id);
        setExpenses((prev) => prev.filter((expense) => expense.id !== id));

        if (isSupabaseConfigured()) {
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

  return (
    <SafeAreaView className="flex-1 bg-gray-100" edges={["top"]}>
      <Header
        title="支出記録"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
        rightElement={
          isSupabaseConfigured() ? (
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

      <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
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
            <Text className="text-gray-400 text-xs mt-1">
              一度入力すると次回からこの端末では登録者が初期値になります
            </Text>
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

          <Button title="支出を記録" onPress={handleAddExpense} variant="success" />
        </Card>

        <Card>
          <Text className="text-gray-900 text-lg font-bold mb-3">支出履歴</Text>
          {expenses.length === 0 ? (
            <Text className="text-gray-400 text-center py-4">支出データがありません</Text>
          ) : (
            <View className="gap-2">
              {[...expenseWithNumbers].reverse().map((expense) => (
                <View
                  key={expense.id}
                  className="flex-row items-center justify-between py-3 border-b border-gray-100"
                >
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
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};
