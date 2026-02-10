import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Dimensions } from 'react-native';
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
  equipment: '機材・設備費',
  other: 'その他',
};

const CATEGORY_HINTS: Record<ExpenseCategory, string> = {
  material: '食材、調味料、容器、紙コップ、ストロー、割り箸、ラップ等',
  decoration: '看板、ポスター、テーブルクロス、装飾品、風船等',
  equipment: 'レンタル機材、調理器具、テント、テーブル、椅子、延長コード等',
  other: '交通費、印刷費、許可申請費、雑費等',
};

const CATEGORY_COLORS: Record<ExpenseCategory, { bg: string; text: string }> = {
  material: { bg: 'bg-blue-100', text: 'text-blue-700' },
  decoration: { bg: 'bg-purple-100', text: 'text-purple-700' },
  equipment: { bg: 'bg-teal-100', text: 'text-teal-700' },
  other: { bg: 'bg-orange-100', text: 'text-orange-700' },
};

const BREAKEVEN_HINTS: Record<string, string> = {
  product_name: '代表的な商品名を入力してください（例：コーヒー、焼きそば）',
  selling_price: 'お客様に販売する1個あたりの価格です',
  variable_cost: '1個作るのにかかる材料費等の原価です',
  fixed_cost: '売上に関係なくかかる費用の合計です（装飾費、機材レンタル料等）',
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
  const [expMemo, setExpMemo] = useState('');

  // Category hint modal
  const [showCategoryHint, setShowCategoryHint] = useState(false);
  const [hintCategory, setHintCategory] = useState<ExpenseCategory>('material');

  // Breakeven (文字列stateで管理してフォーカス喪失を防止)
  const [breakevenProductName, setBreakevenProductName] = useState('');
  const [breakevenSellingPrice, setBreakevenSellingPrice] = useState('');
  const [breakevenVariableCost, setBreakevenVariableCost] = useState('');
  const [breakevenFixedCost, setBreakevenFixedCost] = useState('');
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

  // Breakeven hint modal
  const [showBreakevenHint, setShowBreakevenHint] = useState(false);
  const [breakevenHintKey, setBreakevenHintKey] = useState('product_name');

  // Collapsible sections for breakeven tab
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);

  // Graph touch
  const [graphTouchQty, setGraphTouchQty] = useState<number | null>(null);

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

  const expenseByCategory = (['material', 'decoration', 'equipment', 'other'] as ExpenseCategory[]).map(
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

  // Expense numbering: sorted by created_at ascending, assign sequential numbers
  const expenseWithNumbers = useMemo(() => {
    const sorted = [...expenses].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return sorted.map((exp, idx) => ({ ...exp, expenseNo: idx + 1 }));
  }, [expenses]);

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
      payment_method: 'cash',
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
    const selling_price = parseInt(breakevenSellingPrice, 10) || 0;
    const variable_cost = parseInt(breakevenVariableCost, 10) || 0;
    const fixed_cost = parseInt(breakevenFixedCost, 10) || 0;
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
    const selling_price = parseInt(breakevenSellingPrice, 10) || 0;
    const variable_cost = parseInt(breakevenVariableCost, 10) || 0;
    const fixed_cost = parseInt(breakevenFixedCost, 10) || 0;
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

  const openCategoryHint = (cat: ExpenseCategory) => {
    setHintCategory(cat);
    setShowCategoryHint(true);
  };

  const openBreakevenHint = (key: string) => {
    setBreakevenHintKey(key);
    setShowBreakevenHint(true);
  };

  // ------- sub-components -------
  const CategoryBadge = ({ category }: { category: ExpenseCategory }) => (
    <View className={`px-2 py-1 rounded-full ${CATEGORY_COLORS[category].bg}`}>
      <Text className={`text-xs font-semibold ${CATEGORY_COLORS[category].text}`}>
        {CATEGORY_LABELS[category]}
      </Text>
    </View>
  );

  // ------- Breakeven Chart -------
  const BreakevenChart = () => {
    const sp = parseInt(breakevenSellingPrice, 10) || 0;
    const vc = parseInt(breakevenVariableCost, 10) || 0;
    const fc = parseInt(breakevenFixedCost, 10) || 0;

    if (!sp || !vc || !fc || sp <= vc || !breakevenResult) return null;

    const beQty = breakevenResult.quantity;
    const maxQty = Math.ceil(beQty * 2);
    const screenWidth = Dimensions.get('window').width;
    const chartWidth = screenWidth - 64; // p-4 * 2 + card padding
    const chartHeight = 200;
    const paddingLeft = 50;
    const paddingBottom = 30;
    const paddingTop = 10;
    const paddingRight = 10;
    const graphW = chartWidth - paddingLeft - paddingRight;
    const graphH = chartHeight - paddingBottom - paddingTop;

    const maxSales = maxQty * sp;
    const maxCost = fc + maxQty * vc;
    const maxY = Math.max(maxSales, maxCost);

    const qtyToX = (q: number) => paddingLeft + (q / maxQty) * graphW;
    const valToY = (v: number) => paddingTop + graphH - (v / maxY) * graphH;

    // Y-axis labels (5 ticks)
    const yTicks = [0, 1, 2, 3, 4].map((i) => {
      const val = (maxY / 4) * i;
      return { val, y: valToY(val) };
    });

    // X-axis labels (5 ticks)
    const xTicks = [0, 1, 2, 3, 4].map((i) => {
      const val = Math.round((maxQty / 4) * i);
      return { val, x: qtyToX(val) };
    });

    // Calculate point data for sales and cost lines
    const numPoints = 20;
    const salesPoints: { x: number; y: number }[] = [];
    const costPoints: { x: number; y: number }[] = [];
    for (let i = 0; i <= numPoints; i++) {
      const q = (maxQty / numPoints) * i;
      salesPoints.push({ x: qtyToX(q), y: valToY(q * sp) });
      costPoints.push({ x: qtyToX(q), y: valToY(fc + q * vc) });
    }

    // Breakeven point position
    const beX = qtyToX(beQty);
    const beY = valToY(beQty * sp);

    // Touch info
    const touchQty = graphTouchQty;
    let touchInfo: { x: number; salesY: number; costY: number; salesVal: number; costVal: number; profitVal: number } | null = null;
    if (touchQty !== null && touchQty >= 0 && touchQty <= maxQty) {
      const s = touchQty * sp;
      const c = fc + touchQty * vc;
      touchInfo = {
        x: qtyToX(touchQty),
        salesY: valToY(s),
        costY: valToY(c),
        salesVal: s,
        costVal: c,
        profitVal: s - c,
      };
    }

    return (
      <View className="mt-4">
        <Text className="text-gray-700 font-bold text-sm mb-2">損益分岐点グラフ</Text>
        <View
          style={{ width: chartWidth, height: chartHeight, position: 'relative' }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => {
            const touchX = e.nativeEvent.locationX;
            const q = Math.max(0, Math.min(maxQty, Math.round(((touchX - paddingLeft) / graphW) * maxQty)));
            setGraphTouchQty(q);
          }}
          onResponderMove={(e) => {
            const touchX = e.nativeEvent.locationX;
            const q = Math.max(0, Math.min(maxQty, Math.round(((touchX - paddingLeft) / graphW) * maxQty)));
            setGraphTouchQty(q);
          }}
          onResponderRelease={() => {
            // Keep showing the last touched point
          }}
        >
          {/* Background */}
          <View style={{ position: 'absolute', left: paddingLeft, top: paddingTop, width: graphW, height: graphH, backgroundColor: '#F9FAFB', borderRadius: 4 }} />

          {/* Grid lines */}
          {yTicks.map((tick) => (
            <View key={`grid-${tick.val}`} style={{ position: 'absolute', left: paddingLeft, top: tick.y, width: graphW, height: 1, backgroundColor: '#E5E7EB' }} />
          ))}

          {/* Y-axis labels */}
          {yTicks.map((tick) => (
            <Text key={`ylabel-${tick.val}`} style={{ position: 'absolute', left: 0, top: tick.y - 7, width: paddingLeft - 4, fontSize: 9, color: '#9CA3AF', textAlign: 'right' }}>
              {tick.val >= 10000 ? `${(tick.val / 10000).toFixed(tick.val % 10000 === 0 ? 0 : 1)}万` : tick.val.toLocaleString()}
            </Text>
          ))}

          {/* X-axis labels */}
          {xTicks.map((tick) => (
            <Text key={`xlabel-${tick.val}`} style={{ position: 'absolute', left: tick.x - 12, top: chartHeight - paddingBottom + 6, fontSize: 9, color: '#9CA3AF', width: 30, textAlign: 'center' }}>
              {tick.val}個
            </Text>
          ))}

          {/* Loss area (below breakeven) */}
          <View style={{
            position: 'absolute',
            left: paddingLeft,
            top: paddingTop,
            width: beX - paddingLeft,
            height: graphH,
            backgroundColor: 'rgba(254, 202, 202, 0.3)',
            borderRadius: 2,
          }} />

          {/* Profit area (above breakeven) */}
          <View style={{
            position: 'absolute',
            left: beX,
            top: paddingTop,
            width: paddingLeft + graphW - beX,
            height: graphH,
            backgroundColor: 'rgba(187, 247, 208, 0.3)',
            borderRadius: 2,
          }} />

          {/* Sales line segments */}
          {salesPoints.slice(0, -1).map((p, i) => {
            const next = salesPoints[i + 1];
            const dx = next.x - p.x;
            const dy = next.y - p.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View key={`sales-${i}`} style={{
                position: 'absolute',
                left: p.x,
                top: p.y,
                width: len,
                height: 2.5,
                backgroundColor: '#3B82F6',
                transformOrigin: 'left center',
                transform: [{ rotate: `${angle}deg` }],
              }} />
            );
          })}

          {/* Cost line segments */}
          {costPoints.slice(0, -1).map((p, i) => {
            const next = costPoints[i + 1];
            const dx = next.x - p.x;
            const dy = next.y - p.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View key={`cost-${i}`} style={{
                position: 'absolute',
                left: p.x,
                top: p.y,
                width: len,
                height: 2.5,
                backgroundColor: '#EF4444',
                transformOrigin: 'left center',
                transform: [{ rotate: `${angle}deg` }],
              }} />
            );
          })}

          {/* Breakeven point dot */}
          <View style={{
            position: 'absolute',
            left: beX - 6,
            top: beY - 6,
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: '#6366F1',
            borderWidth: 2,
            borderColor: '#FFFFFF',
          }} />

          {/* Breakeven label */}
          <View style={{
            position: 'absolute',
            left: Math.min(beX - 30, chartWidth - 70),
            top: beY - 28,
            backgroundColor: '#6366F1',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: 'bold' }}>BEP: {beQty}個</Text>
          </View>

          {/* Touch indicator */}
          {touchInfo && (
            <>
              {/* Vertical line */}
              <View style={{
                position: 'absolute',
                left: touchInfo.x,
                top: paddingTop,
                width: 1,
                height: graphH,
                backgroundColor: '#6B7280',
                opacity: 0.5,
              }} />
              {/* Sales dot */}
              <View style={{
                position: 'absolute',
                left: touchInfo.x - 4,
                top: touchInfo.salesY - 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#3B82F6',
              }} />
              {/* Cost dot */}
              <View style={{
                position: 'absolute',
                left: touchInfo.x - 4,
                top: touchInfo.costY - 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#EF4444',
              }} />
              {/* Info tooltip */}
              <View style={{
                position: 'absolute',
                left: touchInfo.x > chartWidth / 2 ? touchInfo.x - 130 : touchInfo.x + 10,
                top: paddingTop + 4,
                backgroundColor: 'rgba(31, 41, 55, 0.95)',
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: 6,
                minWidth: 120,
              }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 'bold', marginBottom: 2 }}>
                  {touchQty}個販売時
                </Text>
                <Text style={{ color: '#93C5FD', fontSize: 9 }}>
                  売上: ¥{touchInfo.salesVal.toLocaleString()}
                </Text>
                <Text style={{ color: '#FCA5A5', fontSize: 9 }}>
                  費用: ¥{touchInfo.costVal.toLocaleString()}
                </Text>
                <Text style={{ color: touchInfo.profitVal >= 0 ? '#86EFAC' : '#FCA5A5', fontSize: 10, fontWeight: 'bold' }}>
                  損益: ¥{touchInfo.profitVal.toLocaleString()}
                </Text>
              </View>
            </>
          )}

          {/* Legend */}
          <View style={{ position: 'absolute', right: paddingRight + 4, bottom: paddingBottom + 4, flexDirection: 'row', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 10, height: 3, backgroundColor: '#3B82F6', borderRadius: 1 }} />
              <Text style={{ fontSize: 8, color: '#6B7280' }}>売上</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 10, height: 3, backgroundColor: '#EF4444', borderRadius: 1 }} />
              <Text style={{ fontSize: 8, color: '#6B7280' }}>費用</Text>
            </View>
          </View>
        </View>
        <Text className="text-gray-400 text-xs text-center mt-1">グラフをタッチすると詳細を表示</Text>
      </View>
    );
  };

  // computed value for report tab
  const budgetRate =
    settings.initial_budget > 0
      ? ((totalExpense / settings.initial_budget) * 100).toFixed(1)
      : '0';

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
      <View className="flex-row bg-white border-b border-gray-200">
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
            className={`flex-1 py-3 items-center border-b-2 ${
              activeTab === tab.key ? 'border-indigo-500' : 'border-transparent'
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                activeTab === tab.key ? 'text-indigo-600' : 'text-gray-400'
              }`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category Hint Modal */}
      <Modal visible={showCategoryHint} onClose={() => setShowCategoryHint(false)} title={`${CATEGORY_LABELS[hintCategory]}について`}>
        <View className="gap-3">
          <View className={`p-3 rounded-lg ${CATEGORY_COLORS[hintCategory].bg}`}>
            <Text className={`font-bold ${CATEGORY_COLORS[hintCategory].text}`}>{CATEGORY_LABELS[hintCategory]}</Text>
          </View>
          <Text className="text-gray-600 text-sm leading-5">
            {CATEGORY_HINTS[hintCategory]}
          </Text>
          <Text className="text-gray-400 text-xs">このカテゴリに該当する支出を記録してください。</Text>
        </View>
      </Modal>

      {/* Breakeven Hint Modal */}
      <Modal visible={showBreakevenHint} onClose={() => setShowBreakevenHint(false)} title="入力のヒント">
        <View className="gap-3">
          <View className="bg-indigo-50 p-3 rounded-lg">
            <Text className="text-indigo-700 font-bold text-sm">
              {breakevenHintKey === 'product_name' ? '商品名' :
               breakevenHintKey === 'selling_price' ? '販売価格' :
               breakevenHintKey === 'variable_cost' ? '変動費（1個あたり）' : '固定費（総額）'}
            </Text>
          </View>
          <Text className="text-gray-600 text-sm leading-5">
            {BREAKEVEN_HINTS[breakevenHintKey]}
          </Text>
          {breakevenHintKey === 'variable_cost' && (
            <View className="bg-amber-50 p-3 rounded-lg">
              <Text className="text-amber-700 text-xs">例：コーヒー1杯あたり、豆代50円＋カップ代10円＝変動費60円</Text>
            </View>
          )}
          {breakevenHintKey === 'fixed_cost' && (
            <View className="bg-amber-50 p-3 rounded-lg">
              <Text className="text-amber-700 text-xs">例：テント3,000円＋装飾5,000円＋チラシ2,000円＝固定費10,000円</Text>
            </View>
          )}
        </View>
      </Modal>

      {/* Tab Content */}
      {activeTab === 'dashboard' && (
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
      )}

      {activeTab === 'expense' && (
        <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
          <Card className="mb-4">
            <Text className="text-gray-900 text-lg font-bold mb-3">支出を記録</Text>

            {/* Category Selector */}
            <View className="mb-3">
              <Text className="text-gray-600 text-sm mb-1">カテゴリ</Text>
              <View className="flex-row flex-wrap gap-2">
                {(['material', 'decoration', 'equipment', 'other'] as ExpenseCategory[]).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setExpCategory(cat)}
                    onLongPress={() => openCategoryHint(cat)}
                    style={{ width: '48%' }}
                    className={`py-2 rounded-lg items-center border-2 ${
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
              {/* Hint for selected category */}
              <TouchableOpacity onPress={() => openCategoryHint(expCategory)} className="mt-1 flex-row items-center">
                <Text className="text-indigo-500 text-xs">💡  {CATEGORY_LABELS[expCategory]}の具体例 → 　{CATEGORY_HINTS[expCategory].substring(0, 30)}</Text>
              </TouchableOpacity>
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
                {[...expenseWithNumbers].reverse().map((exp) => (
                  <View
                    key={exp.id}
                    className="flex-row items-center justify-between py-3 border-b border-gray-100"
                  >
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-1">
                        <View className="bg-gray-200 rounded px-1.5 py-0.5">
                          <Text className="text-gray-600 text-xs font-bold">No.{exp.expenseNo}</Text>
                        </View>
                        <Text className="text-gray-400 text-xs">{exp.date}</Text>
                        <CategoryBadge category={exp.category} />
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
      )}

      {activeTab === 'breakeven' && (
        <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
          {/* Input fields (always visible) */}
          <Card className="mb-4">
            <Text className="text-gray-900 text-lg font-bold mb-3">基本データ入力</Text>

            <View className="gap-3">
              <View>
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-gray-600 text-sm">商品名</Text>
                  <TouchableOpacity onPress={() => openBreakevenHint('product_name')}>
                    <Text className="text-indigo-500 text-xs">? ヒント</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={breakevenProductName}
                  onChangeText={setBreakevenProductName}
                  placeholder="例：コーヒー"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-gray-600 text-sm">販売価格（円）</Text>
                    <TouchableOpacity onPress={() => openBreakevenHint('selling_price')}>
                      <Text className="text-indigo-500 text-xs">?</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    value={breakevenSellingPrice}
                    onChangeText={setBreakevenSellingPrice}
                    keyboardType="numeric"
                    placeholder="300"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-gray-600 text-sm">変動費（円）</Text>
                    <TouchableOpacity onPress={() => openBreakevenHint('variable_cost')}>
                      <Text className="text-indigo-500 text-xs">?</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    value={breakevenVariableCost}
                    onChangeText={setBreakevenVariableCost}
                    keyboardType="numeric"
                    placeholder="100"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>
              <View>
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-gray-600 text-sm">固定費（総額）</Text>
                  <TouchableOpacity onPress={() => openBreakevenHint('fixed_cost')}>
                    <Text className="text-indigo-500 text-xs">? ヒント</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={breakevenFixedCost}
                  onChangeText={setBreakevenFixedCost}
                  keyboardType="numeric"
                  placeholder="10000"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>
          </Card>

          {/* Collapsible: Analysis */}
          <Card className="mb-4">
            <TouchableOpacity
              onPress={() => setShowAnalysis(!showAnalysis)}
              className="flex-row items-center justify-between"
            >
              <Text className="text-gray-900 text-lg font-bold">損益分岐点分析</Text>
              <View className="bg-gray-100 rounded-full px-3 py-1">
                <Text className="text-gray-500 text-sm font-bold">{showAnalysis ? '▲ 閉じる' : '▼ 開く'}</Text>
              </View>
            </TouchableOpacity>

            {showAnalysis && (
              <View className="mt-3">
                <Button title="損益分岐点を計算" onPress={handleCalculateBreakeven} />

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

                {/* Breakeven Chart */}
                <BreakevenChart />
              </View>
            )}
          </Card>

          {/* Collapsible: Simulation */}
          <Card>
            <TouchableOpacity
              onPress={() => setShowSimulation(!showSimulation)}
              className="flex-row items-center justify-between"
            >
              <Text className="text-gray-900 text-lg font-bold">シミュレーション</Text>
              <View className="bg-gray-100 rounded-full px-3 py-1">
                <Text className="text-gray-500 text-sm font-bold">{showSimulation ? '▲ 閉じる' : '▼ 開く'}</Text>
              </View>
            </TouchableOpacity>

            {showSimulation && (
              <View className="mt-3 gap-3">
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

                {simResult && (
                  <View className="mt-2 gap-3">
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
              </View>
            )}
          </Card>
        </ScrollView>
      )}

      {activeTab === 'report' && (
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
                {expenseWithNumbers.map((exp) => (
                  <View
                    key={exp.id}
                    className="flex-row items-center justify-between py-2 border-b border-gray-100"
                  >
                    <View className="bg-gray-200 rounded px-1.5 py-0.5 mr-1">
                      <Text className="text-gray-600 text-xs font-bold">No.{exp.expenseNo}</Text>
                    </View>
                    <Text className="text-gray-400 text-xs w-16">{exp.date}</Text>
                    <CategoryBadge category={exp.category} />
                    <Text className="text-gray-700 text-sm flex-1 mx-2" numberOfLines={1}>
                      {exp.memo || '-'}
                    </Text>
                    <Text className="text-gray-900 font-semibold w-20 text-right">
                      ¥{exp.amount.toLocaleString()}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};
