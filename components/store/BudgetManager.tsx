import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { Card, Header, Button, Modal } from '../common';
import {
  getBudgetSettings,
  saveBudgetSettings,
  getBudgetExpenses,
  saveBudgetExpense,
  deleteBudgetExpense,
  getPendingTransactions,
} from '../../lib/storage';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { alertNotify, alertConfirm } from '../../lib/alertUtils';
import type {
  Branch,
  BudgetExpense,
  BudgetSettings,
  ExpenseCategory,
  ExpensePaymentMethod,
  BreakevenParams,
} from '../../types/database';

// ------- types -------
type BudgetTab = 'dashboard' | 'expense' | 'breakeven' | 'report';

interface BudgetManagerProps {
  branch: Branch;
  onBack: () => void;
}

// ------- constants -------
const TABS: { key: BudgetTab; label: string }[] = [
  { key: 'dashboard', label: 'ダッシュボード' },
  { key: 'expense', label: '支出記録' },
  { key: 'breakeven', label: '損益分岐点' },
  { key: 'report', label: '報告書' },
];

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  material: '材料費',
  decoration: '装飾費',
  other: 'その他',
};

const CATEGORY_COLORS: Record<ExpenseCategory, { bg: string; text: string }> = {
  material: { bg: 'bg-blue-100', text: 'text-blue-700' },
  decoration: { bg: 'bg-purple-100', text: 'text-purple-700' },
  other: { bg: 'bg-orange-100', text: 'text-orange-700' },
};

const PAYMENT_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: '現金',
  paypay: 'PayPay',
  amazon: 'Amazon',
};

const PAYMENT_COLORS: Record<ExpensePaymentMethod, { bg: string; text: string }> = {
  cash: { bg: 'bg-green-100', text: 'text-green-700' },
  paypay: { bg: 'bg-red-100', text: 'text-red-700' },
  amazon: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
};

// ------- component -------
export const BudgetManager = ({ branch, onBack }: BudgetManagerProps) => {
  const [activeTab, setActiveTab] = useState<BudgetTab>('dashboard');
  const [loading, setLoading] = useState(true);

  // Budget settings
  const [settings, setSettings] = useState<BudgetSettings>({
    branch_id: branch.id,
    initial_budget: 0,
    target_sales: 0,
  });
  const [budgetInput, setBudgetInput] = useState('');
  const [targetInput, setTargetInput] = useState('');

  // Expenses
  const [expenses, setExpenses] = useState<BudgetExpense[]>([]);
  const [totalSales, setTotalSales] = useState(0);

  // Expense form
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('material');
  const [expAmount, setExpAmount] = useState('');
  const [expPayment, setExpPayment] = useState<ExpensePaymentMethod>('cash');
  const [expMemo, setExpMemo] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);

  // Breakeven
  const [breakeven, setBreakeven] = useState<BreakevenParams>({
    product_name: '',
    selling_price: 0,
    variable_cost: 0,
    fixed_cost: 0,
  });
  const [breakevenResult, setBreakevenResult] = useState<{
    quantity: number;
    sales: number;
  } | null>(null);
  const [simQuantity, setSimQuantity] = useState('');
  const [simResult, setSimResult] = useState<{
    sales: number;
    cost: number;
    profit: number;
    margin: number;
  } | null>(null);

  // ------- load data -------
  const loadData = useCallback(async () => {
    try {
      const [budgetSettings, budgetExpenses] = await Promise.all([
        getBudgetSettings(branch.id),
        getBudgetExpenses(),
      ]);

      setSettings(budgetSettings);
      setBudgetInput(budgetSettings.initial_budget > 0 ? String(budgetSettings.initial_budget) : '');
      setTargetInput(budgetSettings.target_sales > 0 ? String(budgetSettings.target_sales) : '');

      const branchExpenses = budgetExpenses.filter((e) => e.branch_id === branch.id);
      setExpenses(branchExpenses);

      // Fetch sales
      const pending = await getPendingTransactions();
      const localSales = pending
        .filter((t) => t.branch_id === branch.id)
        .reduce((sum, t) => sum + t.total_amount, 0);

      if (isSupabaseConfigured()) {
        try {
          const { data } = await supabase
            .from('transactions')
            .select('total_amount')
            .eq('branch_id', branch.id)
            .eq('status', 'completed');
          const remoteSales = data?.reduce((sum, t) => sum + t.total_amount, 0) ?? 0;
          setTotalSales(remoteSales + localSales);
        } catch {
          setTotalSales(localSales);
        }
      } else {
        setTotalSales(localSales);
      }
    } catch (error) {
      console.error('Budget data load error:', error);
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ------- computed values -------
  const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
  const remainingBudget = settings.initial_budget - totalExpense;
  const profit = totalSales - totalExpense;
  const budgetPercent =
    settings.initial_budget > 0
      ? ((remainingBudget / settings.initial_budget) * 100).toFixed(1)
      : '0';

  const expenseByCategory = (['material', 'decoration', 'other'] as ExpenseCategory[]).map(
    (cat) => {
      const catExpenses = expenses.filter((e) => e.category === cat);
      const total = catExpenses.reduce((sum, e) => sum + e.amount, 0);
      return {
        category: cat,
        total,
        count: catExpenses.length,
        percent: totalExpense > 0 ? ((total / totalExpense) * 100).toFixed(1) : '0',
      };
    }
  );

  // ------- handlers -------
  const handleSaveBudgetSettings = async () => {
    const newSettings: BudgetSettings = {
      branch_id: branch.id,
      initial_budget: parseInt(budgetInput, 10) || 0,
      target_sales: parseInt(targetInput, 10) || 0,
    };
    setSettings(newSettings);
    await saveBudgetSettings(newSettings);

    if (isSupabaseConfigured()) {
      try {
        await supabase.from('budget_settings').upsert({
          branch_id: branch.id,
          initial_budget: newSettings.initial_budget,
          target_sales: newSettings.target_sales,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'branch_id' });
      } catch (e) {
        console.log('Budget settings sync failed:', e);
      }
    }

    alertNotify('保存完了', '予算設定を保存しました');
  };

  const handleAddExpense = async () => {
    const amount = parseInt(expAmount, 10);
    if (!amount || amount <= 0) {
      alertNotify('エラー', '金額を入力してください');
      return;
    }

    const expense: BudgetExpense = {
      id: Crypto.randomUUID(),
      branch_id: branch.id,
      date: new Date().toISOString().split('T')[0],
      category: expCategory,
      amount,
      payment_method: expPayment,
      memo: expMemo,
      receipt_image: null,
      created_at: new Date().toISOString(),
      synced: false,
    };

    await saveBudgetExpense(expense);
    setExpenses((prev) => [...prev, expense]);

    if (isSupabaseConfigured()) {
      try {
        await supabase.from('budget_expenses').insert({
          id: expense.id,
          branch_id: expense.branch_id,
          date: expense.date,
          category: expense.category,
          amount: expense.amount,
          payment_method: expense.payment_method,
          memo: expense.memo,
          receipt_image: null,
          created_at: expense.created_at,
        });
      } catch (e) {
        console.log('Expense sync failed:', e);
      }
    }

    setExpAmount('');
    setExpMemo('');
    alertNotify('記録完了', '支出を記録しました');
  };

  const handleDeleteExpense = (id: string) => {
    alertConfirm('確認', 'この支出を削除しますか？', async () => {
      await deleteBudgetExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));

      if (isSupabaseConfigured()) {
        try {
          await supabase.from('budget_expenses').delete().eq('id', id);
        } catch (e) {
          console.log('Expense delete sync failed:', e);
        }
      }
    }, '削除');
  };

  const handleCalculateBreakeven = () => {
    const { selling_price, variable_cost, fixed_cost } = breakeven;
    if (!selling_price || !variable_cost || !fixed_cost) {
      alertNotify('エラー', 'すべての項目を入力してください');
      return;
    }
    if (selling_price <= variable_cost) {
      alertNotify('エラー', '販売価格は変動費より大きくしてください');
      return;
    }
    const quantity = Math.ceil(fixed_cost / (selling_price - variable_cost));
    setBreakevenResult({ quantity, sales: quantity * selling_price });
  };

  const handleSimulation = () => {
    const qty = parseInt(simQuantity, 10);
    const { selling_price, variable_cost, fixed_cost } = breakeven;
    if (!qty || !selling_price || !variable_cost || !fixed_cost) {
      alertNotify('エラー', 'すべての項目を入力してください');
      return;
    }
    const sales = qty * selling_price;
    const cost = fixed_cost + qty * variable_cost;
    const profitSim = sales - cost;
    const margin = sales > 0 ? (profitSim / sales) * 100 : 0;
    setSimResult({ sales, cost, profit: profitSim, margin });
  };

  // ------- sub-components -------
  const CategoryBadge = ({ category }: { category: ExpenseCategory }) => (
    <View className={`px-2 py-1 rounded-full ${CATEGORY_COLORS[category].bg}`}>
      <Text className={`text-xs font-semibold ${CATEGORY_COLORS[category].text}`}>
        {CATEGORY_LABELS[category]}
      </Text>
    </View>
  );

  const PaymentBadge = ({ method }: { method: ExpensePaymentMethod }) => (
    <View className={`px-2 py-1 rounded-full ${PAYMENT_COLORS[method].bg}`}>
      <Text className={`text-xs font-semibold ${PAYMENT_COLORS[method].text}`}>
        {PAYMENT_LABELS[method]}
      </Text>
    </View>
  );

  // ======= DASHBOARD TAB =======
  const DashboardTab = () => (
    <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
      {/* Stats Grid */}
      <View className="gap-3 mb-4">
        <View className="flex-row gap-3">
          <Card className="flex-1 bg-indigo-500 p-4">
            <Text className="text-indigo-100 text-xs font-semibold mb-1">初期予算</Text>
            <Text className="text-white text-xl font-bold">
              {settings.initial_budget > 0 ? `¥${settings.initial_budget.toLocaleString()}` : '未設定'}
            </Text>
          </Card>
          <Card className="flex-1 bg-rose-500 p-4">
            <Text className="text-rose-100 text-xs font-semibold mb-1">総支出</Text>
            <Text className="text-white text-xl font-bold">¥{totalExpense.toLocaleString()}</Text>
          </Card>
        </View>
        <View className="flex-row gap-3">
          <Card className="flex-1 bg-emerald-500 p-4">
            <Text className="text-emerald-100 text-xs font-semibold mb-1">残予算</Text>
            <Text className="text-white text-xl font-bold">¥{remainingBudget.toLocaleString()}</Text>
            <Text className="text-emerald-100 text-xs">{budgetPercent}%</Text>
          </Card>
          <Card className="flex-1 bg-sky-500 p-4">
            <Text className="text-sky-100 text-xs font-semibold mb-1">売上</Text>
            <Text className="text-white text-xl font-bold">¥{totalSales.toLocaleString()}</Text>
          </Card>
        </View>
        <Card className={`p-4 ${profit >= 0 ? 'bg-green-500' : 'bg-red-500'}`}>
          <Text className={`text-xs font-semibold mb-1 ${profit >= 0 ? 'text-green-100' : 'text-red-100'}`}>
            利益
          </Text>
          <Text className="text-white text-2xl font-bold text-center">
            ¥{profit.toLocaleString()}
          </Text>
        </Card>
      </View>

      {/* Budget Settings */}
      <Card className="mb-4">
        <Text className="text-gray-900 text-lg font-bold mb-3">予算設定</Text>
        <View className="gap-3">
          <View>
            <Text className="text-gray-600 text-sm mb-1">初期予算（円）</Text>
            <TextInput
              value={budgetInput}
              onChangeText={setBudgetInput}
              keyboardType="numeric"
              placeholder="30000"
              className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View>
            <Text className="text-gray-600 text-sm mb-1">目標売上（円）</Text>
            <TextInput
              value={targetInput}
              onChangeText={setTargetInput}
              keyboardType="numeric"
              placeholder="50000"
              className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <Button title="予算設定を保存" onPress={handleSaveBudgetSettings} />
        </View>
      </Card>

      {/* Expense Breakdown */}
      <Card>
        <Text className="text-gray-900 text-lg font-bold mb-3">支出内訳</Text>
        {totalExpense === 0 ? (
          <Text className="text-gray-400 text-center py-4">支出データがありません</Text>
        ) : (
          <View className="gap-2">
            {expenseByCategory
              .filter((c) => c.total > 0)
              .map((c) => (
                <View key={c.category} className="flex-row items-center justify-between py-2 border-b border-gray-100">
                  <CategoryBadge category={c.category} />
                  <Text className="text-gray-900 font-semibold">¥{c.total.toLocaleString()}</Text>
                  <Text className="text-gray-500 text-sm">{c.percent}%</Text>
                </View>
              ))}
          </View>
        )}
      </Card>
    </ScrollView>
  );

  // ======= EXPENSE TAB =======
  const ExpenseTab = () => (
    <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
      <Card className="mb-4">
        <Text className="text-gray-900 text-lg font-bold mb-3">支出を記録</Text>

        {/* Category Selector */}
        <View className="mb-3">
          <Text className="text-gray-600 text-sm mb-1">カテゴリ</Text>
          <View className="flex-row gap-2">
            {(['material', 'decoration', 'other'] as ExpenseCategory[]).map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setExpCategory(cat)}
                className={`flex-1 py-2 rounded-lg items-center border-2 ${
                  expCategory === cat
                    ? `${CATEGORY_COLORS[cat].bg} border-current`
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    expCategory === cat ? CATEGORY_COLORS[cat].text : 'text-gray-400'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Amount */}
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

        {/* Payment Method */}
        <View className="mb-3">
          <Text className="text-gray-600 text-sm mb-1">支払方法</Text>
          <View className="flex-row gap-2">
            {(['cash', 'paypay', 'amazon'] as ExpensePaymentMethod[]).map((pm) => (
              <TouchableOpacity
                key={pm}
                onPress={() => setExpPayment(pm)}
                className={`flex-1 py-2 rounded-lg items-center border-2 ${
                  expPayment === pm
                    ? `${PAYMENT_COLORS[pm].bg} border-current`
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    expPayment === pm ? PAYMENT_COLORS[pm].text : 'text-gray-400'
                  }`}
                >
                  {PAYMENT_LABELS[pm]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Memo */}
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

      {/* Expense List */}
      <Card>
        <Text className="text-gray-900 text-lg font-bold mb-3">支出履歴</Text>
        {expenses.length === 0 ? (
          <Text className="text-gray-400 text-center py-4">支出データがありません</Text>
        ) : (
          <View className="gap-2">
            {[...expenses].reverse().map((exp) => (
              <View
                key={exp.id}
                className="flex-row items-center justify-between py-3 border-b border-gray-100"
              >
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Text className="text-gray-400 text-xs">{exp.date}</Text>
                    <CategoryBadge category={exp.category} />
                    <PaymentBadge method={exp.payment_method} />
                  </View>
                  {exp.memo ? (
                    <Text className="text-gray-700 text-sm" numberOfLines={1}>
                      {exp.memo}
                    </Text>
                  ) : null}
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-gray-900 font-bold">¥{exp.amount.toLocaleString()}</Text>
                  <TouchableOpacity
                    onPress={() => handleDeleteExpense(exp.id)}
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
  );

  // ======= BREAKEVEN TAB =======
  const BreakevenTab = () => (
    <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
      <Card className="mb-4">
        <Text className="text-gray-900 text-lg font-bold mb-3">損益分岐点分析</Text>

        <View className="gap-3">
          <View>
            <Text className="text-gray-600 text-sm mb-1">商品名</Text>
            <TextInput
              value={breakeven.product_name}
              onChangeText={(v) => setBreakeven((p) => ({ ...p, product_name: v }))}
              placeholder="例：コーヒー"
              className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-gray-600 text-sm mb-1">販売価格（円）</Text>
              <TextInput
                value={breakeven.selling_price > 0 ? String(breakeven.selling_price) : ''}
                onChangeText={(v) =>
                  setBreakeven((p) => ({ ...p, selling_price: parseInt(v, 10) || 0 }))
                }
                keyboardType="numeric"
                placeholder="300"
                className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View className="flex-1">
              <Text className="text-gray-600 text-sm mb-1">変動費（1個あたり）</Text>
              <TextInput
                value={breakeven.variable_cost > 0 ? String(breakeven.variable_cost) : ''}
                onChangeText={(v) =>
                  setBreakeven((p) => ({ ...p, variable_cost: parseInt(v, 10) || 0 }))
                }
                keyboardType="numeric"
                placeholder="100"
                className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>
          <View>
            <Text className="text-gray-600 text-sm mb-1">固定費（総額）</Text>
            <TextInput
              value={breakeven.fixed_cost > 0 ? String(breakeven.fixed_cost) : ''}
              onChangeText={(v) =>
                setBreakeven((p) => ({ ...p, fixed_cost: parseInt(v, 10) || 0 }))
              }
              keyboardType="numeric"
              placeholder="10000"
              className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <Button title="損益分岐点を計算" onPress={handleCalculateBreakeven} />
        </View>

        {breakevenResult && (
          <View className="mt-4 bg-indigo-50 rounded-xl p-4">
            <Text className="text-indigo-700 font-bold text-sm mb-2">分析結果</Text>
            <Text className="text-gray-600 text-sm">損益分岐点販売数量</Text>
            <Text className="text-indigo-600 text-4xl font-bold text-center my-2">
              {breakevenResult.quantity}個
            </Text>
            <Text className="text-gray-500 text-xs text-center mb-3">
              この数量を売れば赤字にならない
            </Text>
            <View className="bg-white rounded-lg p-3">
              <Text className="text-gray-600 text-sm">
                損益分岐点売上：
                <Text className="text-indigo-600 font-bold text-lg">
                  ¥{breakevenResult.sales.toLocaleString()}
                </Text>
              </Text>
              <Text className="text-gray-400 text-xs mt-1">
                固定費 ÷ (販売価格 - 変動費) = 損益分岐点
              </Text>
            </View>
          </View>
        )}
      </Card>

      {/* Simulation */}
      <Card>
        <Text className="text-gray-900 text-lg font-bold mb-3">シミュレーション</Text>
        <View className="gap-3">
          <View>
            <Text className="text-gray-600 text-sm mb-1">予想販売数</Text>
            <TextInput
              value={simQuantity}
              onChangeText={setSimQuantity}
              keyboardType="numeric"
              placeholder="100"
              className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <Button title="シミュレーション実行" onPress={handleSimulation} variant="thirdy" />
        </View>

        {simResult && (
          <View className="mt-4 gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1 bg-blue-50 rounded-xl p-3">
                <Text className="text-gray-500 text-xs">売上</Text>
                <Text className="text-blue-700 text-lg font-bold">
                  ¥{simResult.sales.toLocaleString()}
                </Text>
              </View>
              <View className="flex-1 bg-gray-50 rounded-xl p-3">
                <Text className="text-gray-500 text-xs">総コスト</Text>
                <Text className="text-gray-700 text-lg font-bold">
                  ¥{simResult.cost.toLocaleString()}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className={`flex-1 rounded-xl p-3 ${simResult.profit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <Text className="text-gray-500 text-xs">利益</Text>
                <Text
                  className={`text-lg font-bold ${
                    simResult.profit >= 0 ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  ¥{simResult.profit.toLocaleString()}
                </Text>
              </View>
              <View className="flex-1 bg-purple-50 rounded-xl p-3">
                <Text className="text-gray-500 text-xs">利益率</Text>
                <Text className="text-purple-700 text-lg font-bold">
                  {simResult.margin.toFixed(1)}%
                </Text>
              </View>
            </View>
          </View>
        )}
      </Card>
    </ScrollView>
  );

  // ======= REPORT TAB =======
  const ReportTab = () => {
    const totalQuantity = 0; // Sales-side data — can be extended
    const budgetRate =
      settings.initial_budget > 0
        ? ((totalExpense / settings.initial_budget) * 100).toFixed(1)
        : '0';

    return (
      <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
        {/* Basic Info */}
        <Card className="mb-4">
          <Text className="text-gray-900 text-lg font-bold mb-3 border-b-2 border-indigo-500 pb-2">
            基本情報
          </Text>
          <View className="gap-3">
            <View className="bg-gray-50 rounded-lg p-3 border-l-4 border-indigo-500">
              <Text className="text-gray-500 text-xs">クラス・企画名</Text>
              <Text className="text-gray-900 text-lg font-bold">{branch.branch_name}</Text>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1 bg-gray-50 rounded-lg p-3 border-l-4 border-indigo-500">
                <Text className="text-gray-500 text-xs">初期予算</Text>
                <Text className="text-gray-900 text-lg font-bold">
                  ¥{settings.initial_budget.toLocaleString()}
                </Text>
              </View>
              <View className="flex-1 bg-gray-50 rounded-lg p-3 border-l-4 border-indigo-500">
                <Text className="text-gray-500 text-xs">目標売上</Text>
                <Text className="text-gray-900 text-lg font-bold">
                  ¥{settings.target_sales.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Summary */}
        <Card className="mb-4">
          <Text className="text-gray-900 text-lg font-bold mb-3 border-b-2 border-indigo-500 pb-2">
            収支サマリー
          </Text>
          <View className="gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1 bg-gray-50 rounded-lg p-3 border-l-4 border-rose-500">
                <Text className="text-gray-500 text-xs">総支出</Text>
                <Text className="text-gray-900 text-lg font-bold">
                  ¥{totalExpense.toLocaleString()}
                </Text>
              </View>
              <View className="flex-1 bg-gray-50 rounded-lg p-3 border-l-4 border-sky-500">
                <Text className="text-gray-500 text-xs">総売上</Text>
                <Text className="text-gray-900 text-lg font-bold">
                  ¥{totalSales.toLocaleString()}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className={`flex-1 bg-gray-50 rounded-lg p-3 border-l-4 ${profit >= 0 ? 'border-green-500' : 'border-red-500'}`}>
                <Text className="text-gray-500 text-xs">最終利益</Text>
                <Text
                  className={`text-lg font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  ¥{profit.toLocaleString()}
                </Text>
              </View>
              <View className="flex-1 bg-gray-50 rounded-lg p-3 border-l-4 border-amber-500">
                <Text className="text-gray-500 text-xs">予算執行率</Text>
                <Text className="text-gray-900 text-lg font-bold">{budgetRate}%</Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Expense Breakdown */}
        <Card className="mb-4">
          <Text className="text-gray-900 text-lg font-bold mb-3 border-b-2 border-indigo-500 pb-2">
            支出内訳
          </Text>
          {expenseByCategory.filter((c) => c.total > 0).length === 0 ? (
            <Text className="text-gray-400 text-center py-4">支出データがありません</Text>
          ) : (
            <View className="gap-2">
              {expenseByCategory
                .filter((c) => c.total > 0)
                .map((c) => (
                  <View
                    key={c.category}
                    className="flex-row items-center justify-between py-2 border-b border-gray-100"
                  >
                    <CategoryBadge category={c.category} />
                    <Text className="text-gray-900 font-semibold">
                      ¥{c.total.toLocaleString()}
                    </Text>
                    <Text className="text-gray-500 text-sm">{c.count}件</Text>
                    <Text className="text-gray-500 text-sm">{c.percent}%</Text>
                  </View>
                ))}
            </View>
          )}
        </Card>

        {/* Expense Detail List */}
        <Card>
          <Text className="text-gray-900 text-lg font-bold mb-3 border-b-2 border-indigo-500 pb-2">
            支出明細
          </Text>
          {expenses.length === 0 ? (
            <Text className="text-gray-400 text-center py-4">支出データがありません</Text>
          ) : (
            <View className="gap-1">
              {expenses.map((exp) => (
                <View
                  key={exp.id}
                  className="flex-row items-center justify-between py-2 border-b border-gray-100"
                >
                  <Text className="text-gray-400 text-xs w-20">{exp.date}</Text>
                  <CategoryBadge category={exp.category} />
                  <Text className="text-gray-700 text-sm flex-1 mx-2" numberOfLines={1}>
                    {exp.memo || '-'}
                  </Text>
                  <PaymentBadge method={exp.payment_method} />
                  <Text className="text-gray-900 font-semibold w-20 text-right">
                    ¥{exp.amount.toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    );
  };

  // ======= LOADING =======
  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100" edges={['top']}>
        <Header title="予算管理" showBack onBack={onBack} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-gray-500 mt-2">読み込み中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ======= MAIN RENDER =======
  return (
    <SafeAreaView className="flex-1 bg-gray-100" edges={['top']}>
      <Header
        title="予算管理"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
      />

      {/* Tab Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="bg-white border-b border-gray-200"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
            className={`flex-1 py-3 px-4 items-center border-b-2 ${
              activeTab === tab.key ? 'border-indigo-500' : 'border-transparent'
            }`}
          >
            <Text
              className={`text-sm font-bold ${
                activeTab === tab.key ? 'text-indigo-600' : 'text-gray-400'
              }`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab Content */}
      {activeTab === 'dashboard' && <DashboardTab />}
      {activeTab === 'expense' && <ExpenseTab />}
      {activeTab === 'breakeven' && <BreakevenTab />}
      {activeTab === 'report' && <ReportTab />}
    </SafeAreaView>
  );
};
