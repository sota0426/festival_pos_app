import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Button, Card, Header, Modal } from '../common';
import { alertNotify } from '../../lib/alertUtils';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import type { Branch, BranchSales, SalesAggregation } from '../../types/database';

interface HQDashboardProps {
  onNavigateToBranchInfo: (branchId?: string) => void;
  onBack: () => void;
}

type DashboardTab = 'dashboard' | 'results';

type BranchFinance = BranchSales & {
  total_expense: number;
  profit: number;
};

type SlotStack = {
  time_slot: string;
  total: number;
  by_branch: Record<string, number>;
};

type BranchLegend = {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  color: string;
};

type TransactionRow = {
  id: string;
  branch_id: string;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
};

type TransactionItemRow = {
  transaction_id: string;
  menu_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

type ExpenseRow = {
  id: string;
  branch_id: string;
  date: string;
  category: string;
  amount: number;
  recorded_by: string;
  payment_method: string;
  memo: string;
  created_at: string;
};

const BRANCH_STACK_COLORS = [
  '#2563EB',
  '#16A34A',
  '#F97316',
  '#A855F7',
  '#E11D48',
  '#0EA5E9',
  '#22C55E',
  '#F59E0B',
];

const toDateLabel = (iso: string): string => {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toDateTimeLabel = (iso: string): string => {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}年${m}月${d}日 ${hh}:${mm}`;
};

const toPaymentMethodLabel = (paymentMethod: string): string => {
  if (paymentMethod === 'paypay') return 'キャッシュレス';
  if (paymentMethod === 'cash') return '現金';
  if (paymentMethod === 'voucher') return '金券';
  return paymentMethod;
};

const toStatusLabel = (status: string): string => {
  if (status === 'completed') return '完了';
  if (status === 'cancelled') return '取消';
  if (status === 'pending') return '保留';
  return status;
};

const toCsvCell = (value: string | number): string => {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

export const HQDashboard = ({ onNavigateToBranchInfo, onBack }: HQDashboardProps) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('dashboard');
  const [resultPanelIndex, setResultPanelIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exportingType, setExportingType] = useState<'all_sales' | 'branch_summary' | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const [totalSales, setTotalSales] = useState<SalesAggregation>({
    total_sales: 0,
    transaction_count: 0,
    average_order: 0,
    paypay_sales: 0,
    voucher_sales: 0,
  });
  const [branchSales, setBranchSales] = useState<BranchFinance[]>([]);
  const [branchLegend, setBranchLegend] = useState<BranchLegend[]>([]);
  const [overallTarget, setOverallTarget] = useState(0);
  const [hourlySalesStack, setHourlySalesStack] = useState<SlotStack[]>([]);

  const [branchRows, setBranchRows] = useState<Branch[]>([]);
  const [transactionRows, setTransactionRows] = useState<TransactionRow[]>([]);
  const [transactionItemRows, setTransactionItemRows] = useState<TransactionItemRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);

  const [hoveredSalesSlot, setHoveredSalesSlot] = useState<string | null>(null);
  const [pinnedSalesSlot, setPinnedSalesSlot] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);

    if (!isSupabaseConfigured()) {
      const demoBranches: Branch[] = [
        {
          id: '1',
          branch_code: 'S001',
          branch_name: '焼きそば屋',
          password: '',
          sales_target: 50000,
          status: 'active',
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          branch_code: 'S002',
          branch_name: 'たこ焼き屋',
          password: '',
          sales_target: 40000,
          status: 'active',
          created_at: new Date().toISOString(),
        },
      ];
      const demoTransactions: TransactionRow[] = [
        { id: 't1', branch_id: '1', total_amount: 1200, payment_method: 'paypay', status: 'completed', created_at: new Date().toISOString() },
        { id: 't2', branch_id: '1', total_amount: 800, payment_method: 'cash', status: 'completed', created_at: new Date().toISOString() },
        { id: 't3', branch_id: '2', total_amount: 1000, payment_method: 'voucher', status: 'completed', created_at: new Date().toISOString() },
      ];
      const demoItems: TransactionItemRow[] = [
        { transaction_id: 't1', menu_name: '焼きそば', quantity: 2, unit_price: 600, subtotal: 1200 },
        { transaction_id: 't2', menu_name: '焼きそば', quantity: 1, unit_price: 800, subtotal: 800 },
        { transaction_id: 't3', menu_name: 'たこ焼き', quantity: 2, unit_price: 500, subtotal: 1000 },
      ];
      const demoExpenses: ExpenseRow[] = [
        { id: 'e1', branch_id: '1', date: toDateLabel(new Date().toISOString()), category: 'material', amount: 22000, recorded_by: '担当A', payment_method: 'cash', memo: '', created_at: new Date().toISOString() },
        { id: 'e2', branch_id: '2', date: toDateLabel(new Date().toISOString()), category: 'material', amount: 18000, recorded_by: '担当B', payment_method: 'online', memo: '', created_at: new Date().toISOString() },
      ];

      setBranchRows(demoBranches);
      setTransactionRows(demoTransactions);
      setTransactionItemRows(demoItems);
      setExpenseRows(demoExpenses);
    } else {
      try {
        const [
          { data: branches, error: branchError },
          { data: transactions, error: txError },
          { data: items, error: itemError },
          { data: expenses, error: expenseError },
        ] = await Promise.all([
          supabase.from('branches').select('*').order('branch_code', { ascending: true }),
          supabase.from('transactions').select('id,branch_id,total_amount,payment_method,status,created_at').eq('status', 'completed'),
          supabase.from('transaction_items').select('transaction_id,menu_name,quantity,unit_price,subtotal'),
          supabase.from('budget_expenses').select('id,branch_id,date,category,amount,recorded_by,payment_method,memo,created_at'),
        ]);

        if (branchError) throw branchError;
        if (txError) throw txError;
        if (itemError) throw itemError;
        if (expenseError) throw expenseError;

        setBranchRows((branches ?? []) as Branch[]);
        setTransactionRows((transactions ?? []) as TransactionRow[]);
        setTransactionItemRows((items ?? []) as TransactionItemRow[]);
        setExpenseRows((expenses ?? []) as ExpenseRow[]);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    }

    setRefreshing(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    if (activeTab === 'results') {
      setResultPanelIndex(0);
    }
  }, [activeTab]);

  useEffect(() => {
    const branches = [...branchRows].sort((a, b) => a.branch_code.localeCompare(b.branch_code));
    const existingBranchIds = new Set(branches.map((branch) => branch.id));
    const validTransactions = transactionRows.filter((tx) => existingBranchIds.has(tx.branch_id));
    const validExpenses = expenseRows.filter((expense) => existingBranchIds.has(expense.branch_id));

    setBranchLegend(
      branches.map((branch, index) => ({
        branch_id: branch.id,
        branch_code: branch.branch_code,
        branch_name: branch.branch_name,
        color: BRANCH_STACK_COLORS[index % BRANCH_STACK_COLORS.length],
      })),
    );

    const total_sales = validTransactions.reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0);
    const transaction_count = validTransactions.length;
    const paypay_sales = validTransactions
      .filter((tx) => tx.payment_method === 'paypay')
      .reduce((sum, tx) => sum + tx.total_amount, 0);
    const voucher_sales = validTransactions
      .filter((tx) => tx.payment_method === 'voucher')
      .reduce((sum, tx) => sum + tx.total_amount, 0);
    setTotalSales({
      total_sales,
      transaction_count,
      average_order: transaction_count > 0 ? Math.round(total_sales / transaction_count) : 0,
      paypay_sales,
      voucher_sales,
    });

    const branchSalesData: BranchFinance[] = branches.map((branch) => {
      const tx = validTransactions.filter((t) => t.branch_id === branch.id);
      const total = tx.reduce((sum, t) => sum + t.total_amount, 0);
      const count = tx.length;
      const paypay = tx.filter((t) => t.payment_method === 'paypay').reduce((sum, t) => sum + t.total_amount, 0);
      const voucher = tx.filter((t) => t.payment_method === 'voucher').reduce((sum, t) => sum + t.total_amount, 0);
      const expense = validExpenses
        .filter((e) => e.branch_id === branch.id)
        .reduce((sum, e) => sum + (e.amount ?? 0), 0);
      return {
        branch_id: branch.id,
        branch_code: branch.branch_code,
        branch_name: branch.branch_name,
        total_sales: total,
        transaction_count: count,
        average_order: count > 0 ? Math.round(total / count) : 0,
        paypay_sales: paypay,
        voucher_sales: voucher,
        sales_target: branch.sales_target,
        achievement_rate: branch.sales_target > 0 ? Math.round((total / branch.sales_target) * 100) : 0,
        total_expense: expense,
        profit: total - expense,
      };
    });
    setBranchSales(branchSalesData);
    setOverallTarget(branches.reduce((sum, b) => sum + b.sales_target, 0));

    const hourlyMap = new Map<string, Record<string, number>>();
    validTransactions.forEach((tx) => {
      const d = new Date(tx.created_at);
      const key = `${String(d.getHours()).padStart(2, '0')}:00`;
      const current = hourlyMap.get(key) ?? {};
      current[tx.branch_id] = (current[tx.branch_id] ?? 0) + tx.total_amount;
      hourlyMap.set(key, current);
    });
    const hourlyData: SlotStack[] = Array.from(hourlyMap.entries())
      .map(([time_slot, by_branch]) => ({
        time_slot,
        total: Object.values(by_branch).reduce((sum, value) => sum + value, 0),
        by_branch,
      }))
      .sort((a, b) => a.time_slot.localeCompare(b.time_slot));
    setHourlySalesStack(hourlyData);
  }, [branchRows, expenseRows, transactionRows]);
  const maxHourlySales = hourlySalesStack.length > 0 ? Math.max(...hourlySalesStack.map((h) => h.total)) : 1;
  const achievementRate = overallTarget > 0 ? Math.round((totalSales.total_sales / overallTarget) * 100) : 0;
  const activeSalesSlot = pinnedSalesSlot ?? hoveredSalesSlot;

  const downloadCsvFile = async (filename: string, csvContent: string, successLabel: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      alertNotify(successLabel, 'CSVをダウンロードしました');
      return;
    }

    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!baseDir) throw new Error('保存先ディレクトリを取得できませんでした');
    const fileUri = `${baseDir}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: `${successLabel}を共有` });
    } else {
      alertNotify(successLabel, `CSVを保存しました: ${fileUri}`);
    }
  };

  const handleExportAllSalesCsv = async () => {
    try {
      setExportingType('all_sales');
      if (transactionRows.length === 0) {
        alertNotify('全販売データCSV', '出力対象の販売データがありません');
        return;
      }

      const branchMap = new Map(branchRows.map((branch) => [branch.id, branch]));
      const lines: string[] = [];
      lines.push(
        [
          '日時',
          '店舗コード',
          '店舗名',
          '支払方法',
          'ステータス',
          '合計金額',
          'メニュー名',
          '数量',
          '単価',
          '小計',
        ]
          .map(toCsvCell)
          .join(','),
      );

      transactionItemRows.forEach((item) => {
        const tx = transactionRows.find((row) => row.id === item.transaction_id);
        if (!tx) return;
        const branch = branchMap.get(tx.branch_id);
        lines.push(
          [
            toDateTimeLabel(tx.created_at),
            branch?.branch_code ?? '',
            branch?.branch_name ?? '',
            toPaymentMethodLabel(tx.payment_method),
            toStatusLabel(tx.status),
            tx.total_amount,
            item.menu_name,
            item.quantity,
            item.unit_price,
            item.subtotal,
          ]
            .map(toCsvCell)
            .join(','),
        );
      });

      const dateLabel = toDateLabel(new Date().toISOString());
      await downloadCsvFile(`all_sales_${dateLabel}.csv`, `\uFEFF${lines.join('\n')}`, '全販売データCSV');
    } catch (error: any) {
      console.error('All sales CSV export error:', error);
      alertNotify('エラー', `全販売データCSVの出力に失敗しました: ${error?.message ?? 'unknown error'}`);
    } finally {
      setExportingType(null);
    }
  };

  const handleExportBranchSummaryCsv = async () => {
    try {
      setExportingType('branch_summary');
      if (branchSales.length === 0) {
        alertNotify('店舗別集計CSV', '出力対象の店舗データがありません');
        return;
      }

      const lines: string[] = [];
      lines.push(
        [
          '店舗コード',
          '店舗名',
          '売上合計',
          '支出合計',
          '利益',
          '取引件数',
          '平均客単価',
          'PayPay売上',
          '金券売上',
          '現金売上',
          '売上目標',
          '達成率',
        ]
          .map(toCsvCell)
          .join(','),
      );

      branchSales.forEach((branch) => {
        lines.push(
          [
            branch.branch_code,
            branch.branch_name,
            branch.total_sales,
            branch.total_expense,
            branch.profit,
            branch.transaction_count,
            branch.average_order,
            branch.paypay_sales,
            branch.voucher_sales,
            branch.total_sales - branch.paypay_sales - branch.voucher_sales,
            branch.sales_target,
            `${branch.achievement_rate}%`,
          ]
            .map(toCsvCell)
            .join(','),
        );
      });

      const totalExpense = branchSales.reduce((sum, branch) => sum + branch.total_expense, 0);
      const totalProfit = totalSales.total_sales - totalExpense;
      const totalCashSales = totalSales.total_sales - totalSales.paypay_sales - totalSales.voucher_sales;
      lines.push(
        [
          '全体',
          '全店舗合計',
          totalSales.total_sales,
          totalExpense,
          totalProfit,
          totalSales.transaction_count,
          totalSales.average_order,
          totalSales.paypay_sales,
          totalSales.voucher_sales,
          totalCashSales,
          overallTarget,
          `${achievementRate}%`,
        ]
          .map(toCsvCell)
          .join(','),
      );

      const dateLabel = toDateLabel(new Date().toISOString());
      await downloadCsvFile(`branch_summary_${dateLabel}.csv`, `\uFEFF${lines.join('\n')}`, '店舗別集計CSV');
    } catch (error: any) {
      console.error('Branch summary CSV export error:', error);
      alertNotify('エラー', `店舗別集計CSVの出力に失敗しました: ${error?.message ?? 'unknown error'}`);
    } finally {
      setExportingType(null);
    }
  };

  const salesRanking = useMemo(() => [...branchSales].sort((a, b) => b.total_sales - a.total_sales), [branchSales]);
  const profitRanking = useMemo(() => [...branchSales].sort((a, b) => b.profit - a.profit), [branchSales]);
  const avgOrderRanking = useMemo(() => [...branchSales].sort((a, b) => b.average_order - a.average_order), [branchSales]);
  const orderCountRanking = useMemo(
    () => [...branchSales].sort((a, b) => b.transaction_count - a.transaction_count),
    [branchSales],
  );
  const resultPanels = useMemo(
    () => [
      {
        title: '売上ランキング',
        rows: salesRanking.map((b) => ({ branch_code: b.branch_code, branch_name: b.branch_name, value: b.total_sales })),
        valueFormatter: (value: number) => `${value.toLocaleString()}円`,
        accentBg: 'bg-blue-600',
      },
      {
        title: '利益ランキング',
        rows: profitRanking.map((b) => ({ branch_code: b.branch_code, branch_name: b.branch_name, value: b.profit })),
        valueFormatter: (value: number) => `${value.toLocaleString()}円`,
        accentBg: 'bg-emerald-600',
      },
      {
        title: '客単価ランキング',
        rows: avgOrderRanking.map((b) => ({ branch_code: b.branch_code, branch_name: b.branch_name, value: b.average_order })),
        valueFormatter: (value: number) => `${value.toLocaleString()}円`,
        accentBg: 'bg-orange-600',
      },
      {
        title: '注文件数ランキング',
        rows: orderCountRanking.map((b) => ({ branch_code: b.branch_code, branch_name: b.branch_name, value: b.transaction_count })),
        valueFormatter: (value: number) => `${value.toLocaleString()}件`,
        accentBg: 'bg-cyan-600',
      },
    ],
    [avgOrderRanking, orderCountRanking, profitRanking, salesRanking],
  );

  const activeResultPanel = resultPanels[resultPanelIndex] ?? resultPanels[0];

  const RankingCard = ({
    title,
    rows,
    valueFormatter,
    accentBg,
  }: {
    title: string;
    rows: { branch_code: string; branch_name: string; value: number }[];
    valueFormatter: (value: number) => string;
    accentBg: string;
  }) => (
    <Card className="mb-4">
      <Text className="text-gray-900 text-2xl font-bold mb-3">{title}</Text>
      {rows.map((row, index) => {
        const rowView = (
          <View
            className={`flex-row items-center justify-between rounded-lg px-3 py-2 mb-2 ${index === 0 ? accentBg : 'bg-gray-50'}`}
          >
            <View className="flex-row items-center">
              <Text className={`font-bold mr-3 ${index === 0 ? 'text-white' : 'text-gray-500'}`}>{index + 1}</Text>
              <View>
                <Text className={`font-semibold ${index === 0 ? 'text-white' : 'text-gray-900'}`}>{row.branch_code}</Text>
                <Text className={`text-xs ${index === 0 ? 'text-white' : 'text-gray-500'}`}>{row.branch_name}</Text>
              </View>
            </View>
            <Text className={`font-bold ${index === 0 ? 'text-white' : 'text-gray-900'}`}>{valueFormatter(row.value)}</Text>
          </View>
        );

        return <View key={`${title}-${row.branch_code}`}>{rowView}</View>;
      })}
      {rows.length === 0 && <Text className="text-gray-500 text-center py-2">データがありません</Text>}
    </Card>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="本部ダッシュボード"
        subtitle="売上・来場者集計"
        showBack
        onBack={onBack}
        rightElement={
          <Button
            title={exportingType ? '出力中...' : '一括出力'}
            onPress={() => setShowExportModal(true)}
            size="sm"
            disabled={!!exportingType}
            loading={!!exportingType}
          />
        }
      />
      <Modal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="一括出力"
      >
        <View className="gap-3">
          <TouchableOpacity
            onPress={() => {
              setShowExportModal(false);
              handleExportAllSalesCsv();
            }}
            disabled={!!exportingType}
            className={`flex-row items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 ${
              exportingType ? 'opacity-50' : ''
            }`}
            activeOpacity={0.8}
          >
            <Text className="text-xl">📄</Text>
            <View className="flex-1">
              <Text className="text-blue-800 font-semibold">全販売データCSV</Text>
              <Text className="text-blue-600 text-xs">すべての販売明細を1ファイルで出力</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setShowExportModal(false);
              handleExportBranchSummaryCsv();
            }}
            disabled={!!exportingType}
            className={`flex-row items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 ${
              exportingType ? 'opacity-50' : ''
            }`}
            activeOpacity={0.8}
          >
            <Text className="text-xl">📊</Text>
            <View className="flex-1">
              <Text className="text-emerald-800 font-semibold">店舗別集計CSV</Text>
              <Text className="text-emerald-600 text-xs">売上・支出・利益などの表データを出力</Text>
            </View>
          </TouchableOpacity>

          <Button
            title="キャンセル"
            onPress={() => setShowExportModal(false)}
            variant="secondary"
          />
        </View>
      </Modal>
      <View className="flex-row bg-white border-b border-gray-200">
        <TouchableOpacity
          className={`flex-1 py-3 items-center ${activeTab === 'dashboard' ? 'bg-blue-600' : 'bg-white'}`}
          onPress={() => setActiveTab('dashboard')}
        >
          <Text className={`font-bold ${activeTab === 'dashboard' ? 'text-white' : 'text-gray-500'}`}>ダッシュボード</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3 items-center ${activeTab === 'results' ? 'bg-rose-600' : 'bg-white'}`}
          onPress={() => setActiveTab('results')}
        >
          <Text className={`font-bold ${activeTab === 'results' ? 'text-white' : 'text-gray-500'}`}>総合結果</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-gray-500 mt-2">読み込み中...</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchDashboardData();
              }}
            />
          }
        >
          {activeTab === 'dashboard' && (
            <>
              <Card className="mb-4">
                <Text className="text-lg font-bold text-gray-900 mb-3">全体売上</Text>
                <View className="flex-row flex-wrap">
                  <View className="w-1/2 mb-3">
                    <Text className="text-gray-500 text-sm">売上合計</Text>
                    <Text className="text-2xl font-bold text-blue-600">{totalSales.total_sales.toLocaleString()}円</Text>
                  </View>
                  <View className="w-1/2 mb-3">
                    <Text className="text-gray-500 text-sm">取引件数</Text>
                    <Text className="text-2xl font-bold text-gray-900">{totalSales.transaction_count}件</Text>
                  </View>
                  <View className="w-1/2 mb-3">
                    <Text className="text-gray-500 text-sm">平均客単価</Text>
                    <Text className="text-xl font-semibold text-gray-700">{totalSales.average_order.toLocaleString()}円</Text>
                  </View>
                </View>
              </Card>
              <Card className="mb-4">
                <Text className="text-lg font-bold text-gray-900 mb-3">支払い方法別</Text>
                <View className="flex-row">
                  <View className="flex-1 items-center p-3 bg-blue-50 rounded-lg mr-2">
                    <Text className="text-blue-600 font-semibold">PayPay</Text>
                    <Text className="text-xl font-bold text-blue-700">{totalSales.paypay_sales.toLocaleString()}円</Text>
                  </View>
                  <View className="flex-1 items-center p-3 bg-yellow-50 rounded-lg">
                    <Text className="text-yellow-600 font-semibold">金券</Text>
                    <Text className="text-xl font-bold text-yellow-700">{totalSales.voucher_sales.toLocaleString()}円</Text>
                  </View>
                </View>
              </Card>

              <Card className="mb-4">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-lg font-bold text-gray-900">支店別売上</Text>
                </View>
                {branchSales.map((branch) => (
                  <TouchableOpacity
                    key={branch.branch_id}
                    activeOpacity={0.85}
                    onPress={() => onNavigateToBranchInfo(branch.branch_id)}
                    className="mb-2 rounded-xl bg-white border border-gray-200 px-3 py-3"
                  >
                    <View className="flex-row items-center justify-between mb-1">
                      <View className="flex-row items-center">
                        <Text className="text-blue-600 font-semibold mr-2">{branch.branch_code}</Text>
                        <Text className="text-gray-900">{branch.branch_name}</Text>
                      </View>
                      <Text className="font-bold text-gray-900">{branch.total_sales.toLocaleString()}円</Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-gray-500 text-sm">{branch.transaction_count}件</Text>
                      <View className="flex-row items-center">
                        <Text className="text-gray-500 text-sm mr-2">目標: {branch.sales_target.toLocaleString()}円</Text>
                        <View className={`px-2 py-0.5 rounded ${branch.achievement_rate >= 100 ? 'bg-green-100' : 'bg-orange-100'}`}>
                          <Text className={`text-xs font-semibold ${branch.achievement_rate >= 100 ? 'text-green-700' : 'text-orange-700'}`}>{branch.achievement_rate}%</Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </Card>

              <Card className="mb-4">
                <Text className="text-lg font-bold text-gray-900 mb-3">時間帯別売上（店舗別積み上げ）</Text>
                <View className="flex-row flex-wrap mb-2">
                  {branchLegend.map((item) => (
                    <View key={`sales-${item.branch_id}`} className="flex-row items-center mr-3 mb-1">
                      <View className="w-3 h-3 rounded mr-1" style={{ backgroundColor: item.color }} />
                      <Text className="text-gray-500 text-xs">{item.branch_code}</Text>
                    </View>
                  ))}
                </View>
                {hourlySalesStack.map((slot) => (
                  <Pressable
                    key={slot.time_slot}
                    onHoverIn={() => setHoveredSalesSlot(slot.time_slot)}
                    onHoverOut={() => setHoveredSalesSlot(null)}
                    onPress={() => setPinnedSalesSlot((current) => (current === slot.time_slot ? null : slot.time_slot))}
                    className="py-2 border-b border-gray-100 last:border-b-0"
                  >
                    <View className="flex-row items-center">
                      <Text className="w-16 text-gray-600 font-medium">{slot.time_slot}</Text>
                      <View className="flex-1 mx-2">
                        <View className="h-6 rounded flex-row overflow-hidden bg-gray-100" style={{ width: `${Math.min((slot.total / maxHourlySales) * 100, 100)}%` }}>
                          {branchLegend.map((item) => {
                            const value = slot.by_branch[item.branch_id] || 0;
                            if (value <= 0 || slot.total <= 0) return null;
                            return (
                              <View
                                key={`${slot.time_slot}-${item.branch_id}`}
                                style={{ width: `${(value / slot.total) * 100}%`, backgroundColor: item.color }}
                              />
                            );
                          })}
                        </View>
                      </View>
                      <Text className="w-24 text-right text-gray-900 font-semibold">{slot.total.toLocaleString()}円</Text>
                    </View>
                    {activeSalesSlot === slot.time_slot && (
                      <View className="mt-2 ml-16 bg-blue-50 border border-blue-100 rounded-lg p-2">
                        <Text className="text-blue-900 text-xs font-semibold mb-1">内訳</Text>
                        {branchLegend.map((item) => {
                          const amount = slot.by_branch[item.branch_id] ?? 0;
                          if (amount <= 0) return null;
                          return (
                            <View key={`${slot.time_slot}-detail-${item.branch_id}`} className="flex-row items-center justify-between mb-1">
                              <View className="flex-row items-center">
                                <View className="w-2.5 h-2.5 rounded mr-1.5" style={{ backgroundColor: item.color }} />
                                <Text className="text-gray-700 text-xs">{item.branch_code}</Text>
                              </View>
                              <Text className="text-gray-900 text-xs font-semibold">{amount.toLocaleString()}円</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </Pressable>
                ))}
                {hourlySalesStack.length === 0 && <Text className="text-gray-500 text-center py-4">データがありません</Text>}
              </Card>
            </>
          )}

          {activeTab === 'results' && (
            <>
              <View className="mb-3 flex-row items-center justify-between">
                <Button
                  title="前へ"
                  onPress={() => setResultPanelIndex((prev) => (prev - 1 + resultPanels.length) % resultPanels.length)}
                  size="sm"
                  variant="secondary"
                  disabled={resultPanels.length <= 1}
                />
                <Text className="text-gray-600 text-sm font-semibold">
                  {resultPanelIndex + 1} / {resultPanels.length}
                </Text>
                <Button
                  title="次へ"
                  onPress={() => setResultPanelIndex((prev) => (prev + 1) % resultPanels.length)}
                  size="sm"
                  variant="secondary"
                  disabled={resultPanels.length <= 1}
                />
              </View>
              {activeResultPanel ? (
                <RankingCard
                  title={activeResultPanel.title}
                  rows={activeResultPanel.rows}
                  valueFormatter={activeResultPanel.valueFormatter}
                  accentBg={activeResultPanel.accentBg}
                />
              ) : (
                <Card>
                  <Text className="text-gray-500 text-center py-2">ランキングデータがありません</Text>
                </Card>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};
