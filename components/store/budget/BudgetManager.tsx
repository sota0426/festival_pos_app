import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Card, Header, Button, Modal } from '../../common';
import {
  getBudgetSettings,
  saveBudgetSettings,
  getBudgetExpenses,
  saveBudgetExpenses,
  saveBudgetExpense,
  deleteBudgetExpense,
  getDefaultExpenseRecorder,
  saveDefaultExpenseRecorder,
  getPendingTransactions,
  getBreakevenDraft,
  saveBreakevenDraft,
} from '../../../lib/storage';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { alertNotify, alertConfirm } from '../../../lib/alertUtils';
import { useAuth } from '../../../contexts/AuthContext';
import {
  DEMO_BUDGET_EXPENSES,
  DEMO_BUDGET_SETTINGS,
  DEMO_TRANSACTIONS,
  resolveDemoBranchId,
} from '../../../data/demoData';
import type {
  Branch,
  BudgetExpense,
  BudgetSettings,
  ExpenseCategory,
  ExpensePaymentMethod,
} from '../../../types/database';

// ------- types -------
type BudgetTab = 'dashboard' | 'report';

interface BudgetManagerProps {
  branch: Branch;
  onBack: () => void;
  mode?: 'summary' | 'breakeven';
}

// ------- constants -------
const TABS: { key: BudgetTab; label: string }[] = [
  { key: 'dashboard', label: 'ダッシュボード' },
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

const PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: '現金',
  online: 'クレジット',
  cashless: 'キャッシュレス',
};

const BREAKEVEN_HINTS: Record<string, string> = {
  product_name: '代表的な商品名の単価を入力してください（例：コーヒー、焼きそば）',
  selling_price: 'お客様に販売する1個あたりの価格です',
  variable_cost: '1個作るのにかかる材料費等の原価です',
  fixed_cost: '売上に関係なくかかる費用の合計です（装飾費、機材レンタル料等）',
};

// ------- component -------
export const BudgetManager = ({ branch, onBack, mode = 'summary' }: BudgetManagerProps) => {
  const { authState } = useAuth();
  const isDemo = authState.status === 'demo';
  const demoBranchId = resolveDemoBranchId(branch);
  const canSyncToSupabase = isSupabaseConfigured() && !isDemo;

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
  const [expRecorder, setExpRecorder] = useState('');
  const [expPaymentMethod, setExpPaymentMethod] = useState<ExpensePaymentMethod>('cash');
  const [syncingExpenses, setSyncingExpenses] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [menuSalesRows, setMenuSalesRows] = useState<
    { menu_name: string; quantity: number; subtotal: number }[]
  >([]);

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
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [showSimulation, setShowSimulation] = useState(false);

  // Graph touch
  const [graphTouchQty, setGraphTouchQty] = useState<number | null>(null);
  const breakevenDraftLoadedRef = useRef(false);

  const syncExpenses = useCallback(async () => {
    if (isDemo) {
      const demoExpenses = (demoBranchId ? DEMO_BUDGET_EXPENSES[demoBranchId] ?? [] : [])
        .slice(0, 6)
        .map((expense) => ({
          ...expense,
          branch_id: branch.id,
          synced: true,
        }));
      setExpenses(demoExpenses);
      return demoExpenses;
    }

    const allLocal = await getBudgetExpenses();
    const branchLocal = allLocal.filter((expense) => expense.branch_id === branch.id);

    if (!canSyncToSupabase) {
      setExpenses(branchLocal);
      return branchLocal;
    }

    setSyncingExpenses(true);
    try {
      const unsynced = branchLocal.filter((expense) => !expense.synced);
      const failedIds = new Set<string>();

      for (const expense of unsynced) {
        const { error } = await supabase.from('budget_expenses').upsert(
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
          { onConflict: 'id' },
        );
        if (error) {
          failedIds.add(expense.id);
        }
      }

      const { data: remoteExpenses, error: remoteError } = await supabase
        .from('budget_expenses')
        .select('*')
        .eq('branch_id', branch.id)
        .order('created_at', { ascending: true });

      if (remoteError) {
        setExpenses(branchLocal);
        return branchLocal;
      }

      const normalizedRemote = (remoteExpenses ?? []).map((expense: any) => ({
        ...expense,
        synced: true,
        payment_method:
          expense.payment_method === 'paypay'
            ? 'online'
            : expense.payment_method === 'amazon'
              ? 'cashless'
              : expense.payment_method,
        recorded_by: expense.recorded_by ?? '',
      })) as BudgetExpense[];

      const failedLocal = branchLocal
        .filter((expense) => failedIds.has(expense.id))
        .map((expense) => ({ ...expense, synced: false }));

      const mergedBranchExpenses = [...normalizedRemote, ...failedLocal];
      const otherBranches = allLocal.filter((expense) => expense.branch_id !== branch.id);
      await saveBudgetExpenses([...otherBranches, ...mergedBranchExpenses]);
      setExpenses(mergedBranchExpenses);
      return mergedBranchExpenses;
    } finally {
      setSyncingExpenses(false);
    }
  }, [branch.id, isDemo, demoBranchId, canSyncToSupabase]);

  const loadSalesDetails = useCallback(async () => {
    if (isDemo) {
      const demoTransactions = demoBranchId ? DEMO_TRANSACTIONS[demoBranchId] ?? [] : [];
      const summary = new Map<string, { menu_name: string; quantity: number; subtotal: number }>();
      let rawSales = 0;

      demoTransactions.forEach((transaction) => {
        rawSales += transaction.total_amount;
        transaction.items.forEach((item) => {
          const current = summary.get(item.menu_name) ?? {
            menu_name: item.menu_name,
            quantity: 0,
            subtotal: 0,
          };
          current.quantity += item.quantity;
          current.subtotal += item.subtotal;
          summary.set(item.menu_name, current);
        });
      });

      const targetSales = branch.sales_target > 0
        ? Math.round(branch.sales_target * 0.7)
        : 35000;
      const safeRawSales = rawSales > 0 ? rawSales : 1;
      const scale = targetSales / safeRawSales;
      const scaledRows = Array.from(summary.values()).map((row) => ({
        menu_name: row.menu_name,
        quantity: Math.max(1, Math.round(row.quantity * scale)),
        subtotal: Math.max(100, Math.round(row.subtotal * scale)),
      }));

      setTotalSales(targetSales);
      setMenuSalesRows(scaledRows.sort((a, b) => b.subtotal - a.subtotal));
      return;
    }

    const pending = await getPendingTransactions();
    const localPending = pending.filter((transaction) => transaction.branch_id === branch.id);
    const localSales = localPending.reduce((sum, transaction) => sum + transaction.total_amount, 0);

    const summary = new Map<string, { menu_name: string; quantity: number; subtotal: number }>();
    localPending.forEach((transaction) => {
      transaction.items.forEach((item) => {
        const current = summary.get(item.menu_name) ?? {
          menu_name: item.menu_name,
          quantity: 0,
          subtotal: 0,
        };
        current.quantity += item.quantity;
        current.subtotal += item.subtotal;
        summary.set(item.menu_name, current);
      });
    });

    if (!canSyncToSupabase) {
      setTotalSales(localSales);
      setMenuSalesRows(Array.from(summary.values()).sort((a, b) => b.subtotal - a.subtotal));
      return;
    }

    try {
      const { data: remoteTransactions } = await supabase
        .from('transactions')
        .select('id,total_amount')
        .eq('branch_id', branch.id)
        .eq('status', 'completed');

      const transactionIds = (remoteTransactions ?? []).map((transaction) => transaction.id);
      if (transactionIds.length > 0) {
        const { data: remoteItems } = await supabase
          .from('transaction_items')
          .select('menu_name,quantity,subtotal,transaction_id')
          .in('transaction_id', transactionIds);

        (remoteItems ?? []).forEach((item) => {
          const current = summary.get(item.menu_name) ?? {
            menu_name: item.menu_name,
            quantity: 0,
            subtotal: 0,
          };
          current.quantity += item.quantity;
          current.subtotal += item.subtotal;
          summary.set(item.menu_name, current);
        });
      }

      const remoteSales = (remoteTransactions ?? []).reduce((sum, transaction) => sum + transaction.total_amount, 0);
      setTotalSales(remoteSales + localSales);
      setMenuSalesRows(Array.from(summary.values()).sort((a, b) => b.subtotal - a.subtotal));
    } catch {
      setTotalSales(localSales);
      setMenuSalesRows(Array.from(summary.values()).sort((a, b) => b.subtotal - a.subtotal));
    }
  }, [branch.id, branch.sales_target, isDemo, demoBranchId, canSyncToSupabase]);

  // ------- load data -------
  const loadData = useCallback(async () => {
    try {
      if (isDemo) {
        const seededSettings =
          (demoBranchId ? DEMO_BUDGET_SETTINGS[demoBranchId] : null) ?? {
            branch_id: branch.id,
            initial_budget: 30000,
            target_sales: 80000,
          };
        const normalizedSettings: BudgetSettings = {
          ...seededSettings,
          branch_id: branch.id,
        };
        setSettings(normalizedSettings);
        setBudgetInput(String(normalizedSettings.initial_budget));
        setTargetInput(String(normalizedSettings.target_sales));
        setExpRecorder('デモ担当');
        await Promise.all([syncExpenses(), loadSalesDetails()]);
        return;
      }

      const [budgetSettings, defaultRecorder] = await Promise.all([
        getBudgetSettings(branch.id),
        getDefaultExpenseRecorder(branch.id),
      ]);

      setSettings(budgetSettings);
      setBudgetInput(budgetSettings.initial_budget > 0 ? String(budgetSettings.initial_budget) : '');
      setTargetInput(budgetSettings.target_sales > 0 ? String(budgetSettings.target_sales) : '');
      setExpRecorder(defaultRecorder);
      await Promise.all([syncExpenses(), loadSalesDetails()]);
    } catch (error) {
      console.error('Budget data load error:', error);
    } finally {
      setLoading(false);
    }
  }, [branch.id, isDemo, demoBranchId, loadSalesDetails, syncExpenses]);

  useEffect(() => {
    loadData();
  }, [loadData]);


  useEffect(() => {
    if (mode !== 'breakeven') return;

    const loadBreakevenDraft = async () => {
      const draft = await getBreakevenDraft(branch.id);
      if (draft) {
        setBreakevenProductName(draft.product_name ?? '');
        setBreakevenSellingPrice(draft.selling_price ?? '');
        setBreakevenVariableCost(draft.variable_cost ?? '');
        setBreakevenFixedCost(draft.fixed_cost ?? '');
        setSimQuantity(draft.sim_quantity ?? '');
        setShowAnalysis(draft.show_analysis ?? true);
        setShowSimulation(draft.show_simulation ?? false);
      }
      breakevenDraftLoadedRef.current = true;
    };
    loadBreakevenDraft();
  }, [branch.id, mode]);

  useEffect(() => {
    if (mode !== 'breakeven') return;
    if (!breakevenDraftLoadedRef.current) return;

    saveBreakevenDraft(branch.id, {
      product_name: breakevenProductName,
      selling_price: breakevenSellingPrice,
      variable_cost: breakevenVariableCost,
      fixed_cost: breakevenFixedCost,
      sim_quantity: simQuantity,
      show_analysis: showAnalysis,
      show_simulation: showSimulation,
    });
  }, [
    branch.id,
    mode,
    breakevenProductName,
    breakevenSellingPrice,
    breakevenVariableCost,
    breakevenFixedCost,
    simQuantity,
    showAnalysis,
    showSimulation,
  ]);

  // ------- computed values -------
  const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
  const remainingBudget = settings.initial_budget - totalExpense;
  const profit = totalSales - totalExpense;
  const budgetPercent =
    settings.initial_budget > 0
      ? ((remainingBudget / settings.initial_budget) * 100).toFixed(1)
      : '0';
  const salesAchievementRate =
    branch.sales_target > 0
      ? Math.floor((totalSales / branch.sales_target) * 100)
      : 0;

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
    if (isDemo) {
      alertNotify('保存完了', 'デモの予算設定を更新しました');
      return;
    }
    await saveBudgetSettings(newSettings);

    if (canSyncToSupabase) {
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
    if (!expRecorder.trim()) {
      alertNotify('エラー', '登録者名を入力してください');
      return;
    }

    const recorderName = expRecorder.trim();
    const expense: BudgetExpense = {
      id: Crypto.randomUUID(),
      branch_id: branch.id,
      date: new Date().toISOString().split('T')[0],
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

    setExpAmount('');
    setExpMemo('');
    alertNotify('記録完了', '支出を記録しました');
  };

  const handleDeleteExpense = (id: string) => {
    alertConfirm('確認', 'この支出を削除しますか？', async () => {
      if (!isDemo) {
        await deleteBudgetExpense(id);
      }
      setExpenses((prev) => prev.filter((e) => e.id !== id));

      if (canSyncToSupabase) {
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
    if (!qty || qty <= 0 || !selling_price || !variable_cost || fixed_cost < 0) {
      alertNotify('エラー', '正しい数値を入力してください');
      setSimResult(null);
      return;
    }
    if (selling_price <= variable_cost) {
      alertNotify('エラー', '販売価格は変動費より大きくしてください');
      setSimResult(null);
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

  const toCsvCell = (value: string | number) => {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  };

  const handleExportCsv = async () => {
    try {
      setExportingCsv(true);
      const lines: string[] = [];
      lines.push(['区分', '項目', '値'].map(toCsvCell).join(','));
      lines.push(['サマリー', '総収入', totalSales].map(toCsvCell).join(','));
      lines.push(['サマリー', '総支出', totalExpense].map(toCsvCell).join(','));
      lines.push(['サマリー', '最終利益', profit].map(toCsvCell).join(','));
      lines.push('');

      lines.push(['販売商品', '商品名', '販売個数', '小計'].map(toCsvCell).join(','));
      menuSalesRows.forEach((row) => {
        lines.push(['収入', row.menu_name, row.quantity, row.subtotal].map(toCsvCell).join(','));
      });
      lines.push('');

      lines.push(
        ['支出明細', '日付', 'カテゴリ', '支払い方法', '登録者', '金額', 'メモ']
          .map(toCsvCell)
          .join(','),
      );
      expenseWithNumbers.forEach((expense) => {
        lines.push(
          [
            '支出',
            expense.date,
            CATEGORY_LABELS[expense.category],
            PAYMENT_METHOD_LABELS[expense.payment_method],
            expense.recorded_by || '未設定',
            expense.amount,
            expense.memo || '',
          ]
            .map(toCsvCell)
            .join(','),
        );
      });

      const csvContent = `\uFEFF${lines.join('\n')}`;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `budget_report_${branch.branch_code}_${Date.now()}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(url);
        alertNotify('CSV出力', 'CSVをダウンロードしました');
        return;
      }

      const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDir) {
        throw new Error('保存先ディレクトリを取得できませんでした');
      }
      const fileUri = `${baseDir}budget_report_${branch.branch_code}_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: '報告書CSVを共有',
        });
      } else {
        alertNotify('CSV出力', `CSVを保存しました: ${fileUri}`);
      }
    } catch (error: any) {
      console.error('CSV export error:', error);
      alertNotify('エラー', `CSVの出力に失敗しました: ${error?.message ?? 'unknown error'}`);
    } finally {
      setExportingCsv(false);
    }
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
        <Header title="会計管理" showBack onBack={onBack} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-gray-500 mt-2">読み込み中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ======= MAIN RENDER =======
  if (mode === 'breakeven') {
    return (
      <SafeAreaView className="flex-1 bg-gray-100" edges={['top']}>
        <Header
          title="損益分岐点"
          subtitle={`${branch.branch_code} - ${branch.branch_name}`}
          showBack
          onBack={onBack}
        />

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
          </View>
        </Modal>

        <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
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
                      <Text className="text-indigo-500 text-xs">? ヒント</Text>
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
                      <Text className="text-indigo-500 text-xs">? ヒント</Text>
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
                  </View>
                )}
                <BreakevenChart />
              </View>
            )}
          </Card>

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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-100" edges={['top']}>
      <Header
        title="会計処理"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
        rightElement={
          activeTab === 'report' ? (
            <Button
              title={exportingCsv ? '出力中...' : 'CSV出力'}
              onPress={handleExportCsv}
              size="sm"
              disabled={exportingCsv}
            />
          ) : canSyncToSupabase ? (
            <Button
              title={syncingExpenses ? '同期中...' : '同期'}
              onPress={() => {
                syncExpenses();
                loadSalesDetails();
              }}
              size="sm"
              disabled={syncingExpenses}
            />
          ) : null
        }
      />

      {/* Tab Bar */}
      <View className="flex-row bg-white border-b border-gray-200">
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
            className={`flex-1 py-3 items-center  ${
              activeTab === tab.key ? 'bg-indigo-500 rounded-lg' : 'border-transparent'
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                activeTab === tab.key ? 'text-white' : 'text-gray-400'
              }`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'dashboard' && (
        <ScrollView
          className="flex-1 p-4"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          <Text className="text-gray-900 text-lg font-bold mb-3">ダッシュボード</Text>
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

          <Card>
            <Text className="text-gray-900 text-lg font-bold mb-3">売上状況</Text>
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-gray-500 text-sm">売上目標</Text>
                <Text className="text-lg font-bold text-gray-900">
                  {branch.sales_target > 0 ? `${branch.sales_target.toLocaleString()}円` : '未設定'}
                </Text>
                <Text className="text-sm text-gray-600 mt-1">現在売上：{totalSales.toLocaleString()}円</Text>
                {branch.sales_target > 0 && (
                  <Text className="text-sm text-blue-600 font-medium">達成率：{salesAchievementRate}%</Text>
                )}
              </View>
              <View
                className={`px-3 py-1 rounded-full ${
                  branch.status === 'active' ? 'bg-green-100' : 'bg-gray-100'
                }`}
              >
                <Text
                  className={`font-medium ${
                    branch.status === 'active' ? 'text-green-600' : 'text-gray-500'
                  }`}
                >
                  {branch.status === 'active' ? '稼働中' : '停止中'}
                </Text>
              </View>
            </View>
          </Card>

        </ScrollView>
      )}

      {activeTab === 'report' && (
        <ScrollView
          className="flex-1 p-4"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          <View className="mb-3">
            <Text className="text-gray-900 text-lg font-bold">報告書</Text>
          </View>
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

          {/* Income Detail */}
          <Card className="mb-4">
            <Text className="text-gray-900 text-lg font-bold mb-3 border-b-2 border-sky-500 pb-2">
              収入明細（販売商品）
            </Text>
            {menuSalesRows.length === 0 ? (
              <Text className="text-gray-400 text-center py-4">売上データがありません</Text>
            ) : (
              <View className="gap-1">
                {menuSalesRows.map((row) => (
                  <View
                    key={row.menu_name}
                    className="flex-row items-center justify-between py-2 border-b border-gray-100"
                  >
                    <Text className="text-gray-800 text-sm flex-1 mr-2" numberOfLines={1}>
                      {row.menu_name}
                    </Text>
                    <Text className="text-gray-500 text-sm w-16 text-right">{row.quantity}個</Text>
                    <Text className="text-sky-700 font-semibold w-24 text-right">
                      ¥{row.subtotal.toLocaleString()}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Expense Breakdown */}
          <Card className="mb-4">
            <Text className="text-gray-900 text-lg font-bold mb-3 border-b-2 border-indigo-500 pb-2">
              支出内訳
            </Text>
            {expenseByCategory.filter((c) => c.total > 0).length === 0 ? (
              <Text className="text-gray-400 text-center py-4">支出データがありません</Text>
            ) : (
              <View className="gap-1">
                {expenseByCategory
                  .filter((c) => c.total > 0)
                  .map((c) => (
                    <View
                      key={c.category}
                      className="flex-row items-center justify-between py-2 border-b border-gray-100"
                    >
                      <View className="flex-1 min-w-0 mr-2">
                        <CategoryBadge category={c.category} />
                      </View>
                      <Text className="text-gray-500 text-sm w-16 text-right">{c.count}件</Text>
                      <Text className="text-gray-900 font-semibold w-24 text-right">
                        ¥{c.total.toLocaleString()}
                      </Text>
                    </View>
                  ))}
              </View>
            )}
          </Card>

          {/* Expense Detail List */}
          <Card>
            <Text className="text-gray-900 text-lg font-bold mb-3 border-b-2 border-indigo-500 pb-2">
              支出明細（支払い方法）
            </Text>
            {expenses.length === 0 ? (
              <Text className="text-gray-400 text-center py-4">支出データがありません</Text>
            ) : (
              <View className="gap-1">
                {expenseWithNumbers.map((exp) => (
                  <View
                    key={exp.id}
                    className="py-2.5 border-b border-gray-100"
                  >
                    <View className="flex-row items-center">
                      <View className="bg-gray-200 rounded px-1.5 py-0.5 mr-2">
                        <Text className="text-gray-600 text-xs font-bold">No.{exp.expenseNo}</Text>
                      </View>
                      <Text className="text-gray-400 text-xs">{exp.date}</Text>
                    </View>

                    <View className="flex-row items-center mt-1.5">
                      <View className="mr-2">
                        <CategoryBadge category={exp.category} />
                      </View>
                      <View className="bg-gray-100 rounded px-2 py-0.5">
                        <Text className="text-gray-600 text-[10px]">
                          {PAYMENT_METHOD_LABELS[exp.payment_method]}
                        </Text>
                      </View>
                      <Text
                        className="text-gray-500 text-xs ml-2 flex-1"
                        numberOfLines={1}
                      >
                        {exp.recorded_by || '未設定'}
                      </Text>
                      <Text className="text-gray-900 font-semibold w-24 text-right">
                        ¥{exp.amount.toLocaleString()}
                      </Text>
                    </View>

                    <Text className="text-gray-700 text-sm mt-1" numberOfLines={2}>
                      {exp.memo || '-'}
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
