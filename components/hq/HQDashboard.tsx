import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { Button, Card, Header } from '../common';
import { alertNotify } from '../../lib/alertUtils';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { createZipFromTextFiles, uint8ArrayToBase64 } from '../../lib/zip';
import type { Branch, BranchSales, BranchVisitors, SalesAggregation } from '../../types/database';

interface HQDashboardProps {
  onNavigateToBranches: () => void;
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

type VisitorRow = {
  branch_id: string;
  count: number;
  timestamp: string;
  group_type: string | null;
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

const toCsvCell = (value: string | number): string => {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

export const HQDashboard = ({ onNavigateToBranches, onNavigateToBranchInfo, onBack }: HQDashboardProps) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('dashboard');
  const [resultPanelIndex, setResultPanelIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exportingCsv, setExportingCsv] = useState(false);

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
  const [totalVisitors, setTotalVisitors] = useState(0);
  const [branchVisitors, setBranchVisitors] = useState<BranchVisitors[]>([]);
  const [hourlySalesStack, setHourlySalesStack] = useState<SlotStack[]>([]);
  const [quarterHourlyVisitors, setQuarterHourlyVisitors] = useState<SlotStack[]>([]);

  const [branchRows, setBranchRows] = useState<Branch[]>([]);
  const [transactionRows, setTransactionRows] = useState<TransactionRow[]>([]);
  const [transactionItemRows, setTransactionItemRows] = useState<TransactionItemRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [visitorRows, setVisitorRows] = useState<VisitorRow[]>([]);

  const [hoveredSalesSlot, setHoveredSalesSlot] = useState<string | null>(null);
  const [pinnedSalesSlot, setPinnedSalesSlot] = useState<string | null>(null);
  const [hoveredVisitorSlot, setHoveredVisitorSlot] = useState<string | null>(null);
  const [pinnedVisitorSlot, setPinnedVisitorSlot] = useState<string | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;



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
      const demoVisitors: VisitorRow[] = [
        { branch_id: '1', count: 12, timestamp: new Date().toISOString(), group_type: 'unassigned' },
        { branch_id: '2', count: 10, timestamp: new Date().toISOString(), group_type: 'unassigned' },
      ];

      setBranchRows(demoBranches);
      setTransactionRows(demoTransactions);
      setTransactionItemRows(demoItems);
      setExpenseRows(demoExpenses);
      setVisitorRows(demoVisitors);
    } else {
      try {
        const [
          { data: branches, error: branchError },
          { data: transactions, error: txError },
          { data: items, error: itemError },
          { data: expenses, error: expenseError },
          { data: visitors, error: visitorError },
        ] = await Promise.all([
          supabase.from('branches').select('*').order('branch_code', { ascending: true }),
          supabase.from('transactions').select('id,branch_id,total_amount,payment_method,status,created_at').eq('status', 'completed'),
          supabase.from('transaction_items').select('transaction_id,menu_name,quantity,unit_price,subtotal'),
          supabase.from('budget_expenses').select('id,branch_id,date,category,amount,recorded_by,payment_method,memo,created_at'),
          supabase.from('visitor_counts').select('branch_id,count,timestamp,group_type'),
        ]);

        if (branchError) throw branchError;
        if (txError) throw txError;
        if (itemError) throw itemError;
        if (expenseError) throw expenseError;
        if (visitorError) throw visitorError;

        setBranchRows((branches ?? []) as Branch[]);
        setTransactionRows((transactions ?? []) as TransactionRow[]);
        setTransactionItemRows((items ?? []) as TransactionItemRow[]);
        setExpenseRows((expenses ?? []) as ExpenseRow[]);
        setVisitorRows((visitors ?? []) as VisitorRow[]);
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
    setBranchLegend(
      branches.map((branch, index) => ({
        branch_id: branch.id,
        branch_code: branch.branch_code,
        branch_name: branch.branch_name,
        color: BRANCH_STACK_COLORS[index % BRANCH_STACK_COLORS.length],
      })),
    );

    const total_sales = transactionRows.reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0);
    const transaction_count = transactionRows.length;
    const paypay_sales = transactionRows
      .filter((tx) => tx.payment_method === 'paypay')
      .reduce((sum, tx) => sum + tx.total_amount, 0);
    const voucher_sales = transactionRows
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
      const tx = transactionRows.filter((t) => t.branch_id === branch.id);
      const total = tx.reduce((sum, t) => sum + t.total_amount, 0);
      const count = tx.length;
      const paypay = tx.filter((t) => t.payment_method === 'paypay').reduce((sum, t) => sum + t.total_amount, 0);
      const voucher = tx.filter((t) => t.payment_method === 'voucher').reduce((sum, t) => sum + t.total_amount, 0);
      const expense = expenseRows
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
    transactionRows.forEach((tx) => {
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

    const quarterMap = new Map<string, Record<string, number>>();
    visitorRows.forEach((v) => {
      const d = new Date(v.timestamp);
      const floored = Math.floor(d.getMinutes() / 15) * 15;
      const key = `${String(d.getHours()).padStart(2, '0')}:${String(floored).padStart(2, '0')}`;
      const current = quarterMap.get(key) ?? {};
      current[v.branch_id] = (current[v.branch_id] ?? 0) + v.count;
      quarterMap.set(key, current);
    });
    const quarterData: SlotStack[] = Array.from(quarterMap.entries())
      .map(([time_slot, by_branch]) => ({
        time_slot,
        total: Object.values(by_branch).reduce((sum, value) => sum + value, 0),
        by_branch,
      }))
      .sort((a, b) => a.time_slot.localeCompare(b.time_slot));
    setQuarterHourlyVisitors(quarterData);
    setTotalVisitors(visitorRows.reduce((sum, v) => sum + v.count, 0));

    const branchVisitorData: BranchVisitors[] = branches.map((branch) => ({
      branch_id: branch.id,
      branch_code: branch.branch_code,
      branch_name: branch.branch_name,
      total_visitors: visitorRows
        .filter((v) => v.branch_id === branch.id)
        .reduce((sum, v) => sum + v.count, 0),
      half_hourly: [],
    }));
    setBranchVisitors(branchVisitorData);
  }, [branchRows, expenseRows, transactionRows, visitorRows]);

  const maxVisitors = quarterHourlyVisitors.length > 0 ? Math.max(...quarterHourlyVisitors.map((h) => h.total)) : 1;
  const maxHourlySales = hourlySalesStack.length > 0 ? Math.max(...hourlySalesStack.map((h) => h.total)) : 1;
  const achievementRate = overallTarget > 0 ? Math.round((totalSales.total_sales / overallTarget) * 100) : 0;
  const activeSalesSlot = pinnedSalesSlot ?? hoveredSalesSlot;
  const activeVisitorSlot = pinnedVisitorSlot ?? hoveredVisitorSlot;

  const transactionToBranch = useMemo(() => {
    const map = new Map<string, string>();
    transactionRows.forEach((tx) => map.set(tx.id, tx.branch_id));
    return map;
  }, [transactionRows]);

  const menuSummaryByBranch = useMemo(() => {
    const summary = new Map<string, Map<string, { quantity: number; subtotal: number }>>();
    transactionItemRows.forEach((item) => {
      const branchId = transactionToBranch.get(item.transaction_id);
      if (!branchId) return;
      const branchMap = summary.get(branchId) ?? new Map<string, { quantity: number; subtotal: number }>();
      const current = branchMap.get(item.menu_name) ?? { quantity: 0, subtotal: 0 };
      current.quantity += item.quantity ?? 0;
      current.subtotal += item.subtotal ?? 0;
      branchMap.set(item.menu_name, current);
      summary.set(branchId, branchMap);
    });
    return summary;
  }, [transactionItemRows, transactionToBranch]);

  const buildBranchCsv = (branch: BranchFinance): string => {
    const lines: string[] = [];
    const dateLabel = toDateLabel(new Date().toISOString());
    const branchTx = transactionRows.filter((tx) => tx.branch_id === branch.branch_id);
    const branchExpenses = expenseRows.filter((expense) => expense.branch_id === branch.branch_id);
    const branchVisitorsRaw = visitorRows.filter((visitor) => visitor.branch_id === branch.branch_id);
    const branchMenuSummary = Array.from(menuSummaryByBranch.get(branch.branch_id)?.entries() ?? [])
      .map(([menu_name, row]) => ({ menu_name, ...row }))
      .sort((a, b) => b.subtotal - a.subtotal);
    const branchItemRows = transactionItemRows.filter((item) => transactionToBranch.get(item.transaction_id) === branch.branch_id);

    lines.push(['区分', '項目', '値'].map(toCsvCell).join(','));
    lines.push(['店舗', '店舗ID', branch.branch_code].map(toCsvCell).join(','));
    lines.push(['店舗', '店舗名', branch.branch_name].map(toCsvCell).join(','));
    lines.push(['店舗', '出力日', dateLabel].map(toCsvCell).join(','));
    lines.push(['サマリー', '総売上', branch.total_sales].map(toCsvCell).join(','));
    lines.push(['サマリー', '総支出', branch.total_expense].map(toCsvCell).join(','));
    lines.push(['サマリー', '利益', branch.profit].map(toCsvCell).join(','));
    lines.push(['サマリー', '取引件数', branch.transaction_count].map(toCsvCell).join(','));
    lines.push(['サマリー', '平均客単価', branch.average_order].map(toCsvCell).join(','));
    lines.push(['サマリー', '目標達成率', `${branch.achievement_rate}%`].map(toCsvCell).join(','));
    lines.push('');

    lines.push(['支払い集計', 'PayPay', branch.paypay_sales].map(toCsvCell).join(','));
    lines.push(['支払い集計', '金券', branch.voucher_sales].map(toCsvCell).join(','));
    lines.push(['支払い集計', '現金', branch.total_sales - branch.paypay_sales - branch.voucher_sales].map(toCsvCell).join(','));
    lines.push('');

    lines.push(['取引明細', 'transaction_id', 'created_at', 'payment_method', 'total_amount'].map(toCsvCell).join(','));
    branchTx.forEach((tx) => {
      lines.push(['取引明細', tx.id, tx.created_at, tx.payment_method, tx.total_amount].map(toCsvCell).join(','));
    });
    lines.push('');

    lines.push(['メニュー売上集計', 'menu_name', 'quantity', 'subtotal'].map(toCsvCell).join(','));
    branchMenuSummary.forEach((row) => {
      lines.push(['メニュー売上集計', row.menu_name, row.quantity, row.subtotal].map(toCsvCell).join(','));
    });
    lines.push('');

    lines.push(['メニュー売上明細', 'transaction_id', 'menu_name', 'quantity', 'unit_price', 'subtotal'].map(toCsvCell).join(','));
    branchItemRows.forEach((row) => {
      lines.push(['メニュー売上明細', row.transaction_id, row.menu_name, row.quantity, row.unit_price, row.subtotal].map(toCsvCell).join(','));
    });
    lines.push('');

    lines.push(['支出明細', 'id', 'date', 'category', 'payment_method', 'recorded_by', 'amount', 'memo', 'created_at'].map(toCsvCell).join(','));
    branchExpenses.forEach((expense) => {
      lines.push(['支出明細', expense.id, expense.date, expense.category, expense.payment_method, expense.recorded_by || '', expense.amount, expense.memo || '', expense.created_at].map(toCsvCell).join(','));
    });
    lines.push('');

    lines.push(['来場者(15分集計)', 'time_slot', 'count'].map(toCsvCell).join(','));
    quarterHourlyVisitors.forEach((slot) => {
      lines.push(['来場者(15分集計)', slot.time_slot, slot.by_branch[branch.branch_id] ?? 0].map(toCsvCell).join(','));
    });
    lines.push('');

    lines.push(['来場者明細', 'timestamp', 'group_type', 'count'].map(toCsvCell).join(','));
    branchVisitorsRaw.forEach((visitor) => {
      lines.push(['来場者明細', visitor.timestamp, visitor.group_type ?? 'unassigned', visitor.count].map(toCsvCell).join(','));
    });

    return `\uFEFF${lines.join('\n')}`;
  };

  const handleExportDashboardCsv = async () => {
    try {
      setExportingCsv(true);
      if (branchSales.length === 0) {
        alertNotify('CSV出力', '出力対象のデータがありません');
        return;
      }

      const dateLabel = toDateLabel(new Date().toISOString());
      const files = branchSales.map((branch) => ({
        name: `${branch.branch_id}_${dateLabel}.csv`,
        content: buildBranchCsv(branch),
      }));

      if (files.length === 1) {
        const csvContent = files[0].content;
        const filename = files[0].name;
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
          alertNotify('CSV出力', 'CSVをダウンロードしました');
          return;
        }

        const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
        if (!baseDir) throw new Error('保存先ディレクトリを取得できませんでした');
        const fileUri = `${baseDir}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'ダッシュボードCSVを共有' });
        } else {
          alertNotify('CSV出力', `CSVを保存しました: ${fileUri}`);
        }
        return;
      }

      const zipBytes = createZipFromTextFiles(files);
      const zipFilename = `all_branches_${dateLabel}.zip`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const forBlob = new Uint8Array(zipBytes.length);
        forBlob.set(zipBytes);
        const blob = new Blob([forBlob], { type: 'application/zip' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        alertNotify('CSV出力', 'ZIPをダウンロードしました');
        return;
      }

      const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDir) throw new Error('保存先ディレクトリを取得できませんでした');
      const zipUri = `${baseDir}${zipFilename}`;
      await FileSystem.writeAsStringAsync(zipUri, uint8ArrayToBase64(zipBytes), { encoding: 'base64' });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(zipUri, { mimeType: 'application/zip', dialogTitle: 'ダッシュボードZIPを共有' });
      } else {
        alertNotify('CSV出力', `ZIPを保存しました: ${zipUri}`);
      }
    } catch (error: any) {
      console.error('Dashboard export error:', error);
      alertNotify('エラー', `エクスポートに失敗しました: ${error?.message ?? 'unknown error'}`);
    } finally {
      setExportingCsv(false);
    }
  };

  const salesRanking = useMemo(() => [...branchSales].sort((a, b) => b.total_sales - a.total_sales), [branchSales]);
  const profitRanking = useMemo(() => [...branchSales].sort((a, b) => b.profit - a.profit), [branchSales]);
  const avgOrderRanking = useMemo(() => [...branchSales].sort((a, b) => b.average_order - a.average_order), [branchSales]);
  const visitorRanking = useMemo(() => {
    const map = new Map<string, number>(branchVisitors.map((v) => [v.branch_id, v.total_visitors]));
    return [...branchSales]
      .map((branch) => ({ ...branch, total_visitors: map.get(branch.branch_id) ?? 0 }))
      .sort((a, b) => b.total_visitors - a.total_visitors);
  }, [branchSales, branchVisitors]);

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
        title: '来場者ランキング',
        rows: visitorRanking.map((b) => ({ branch_code: b.branch_code, branch_name: b.branch_name, value: b.total_visitors })),
        valueFormatter: (value: number) => `${value.toLocaleString()}人`,
        accentBg: 'bg-purple-600',
      },
    ],
    [avgOrderRanking, profitRanking, salesRanking, visitorRanking],
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
      {rows.slice(0, 5).map((row, index) => {
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
            title={exportingCsv ? '出力中...' : 'CSV一括出力'}
            onPress={handleExportDashboardCsv}
            size="sm"
            disabled={exportingCsv}
            loading={exportingCsv}
          />
        }
      />
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
                  <View className="w-1/2 mb-3">
                    <Text className="text-gray-500 text-sm">目標達成率</Text>
                    <Text className={`text-xl font-semibold ${achievementRate >= 100 ? 'text-green-600' : 'text-orange-500'}`}>{achievementRate}%</Text>
                  </View>
                </View>
              </Card>

              <Card className="mb-4 bg-purple-50">
                <Text className="text-lg font-bold text-purple-900 mb-3">来場者数</Text>
                <View className="flex-row flex-wrap">
                  <View className="w-1/2 mb-3">
                    <Text className="text-purple-600 text-sm">本日の総来場者</Text>
                    <Text className="text-3xl font-bold text-purple-700">{totalVisitors.toLocaleString()}人</Text>
                  </View>
                  <View className="w-1/2 mb-3">
                    <Text className="text-purple-600 text-sm">支店別</Text>
                    {branchVisitors.map((bv) => (
                      <View key={bv.branch_id} className="flex-row justify-between">
                        <Text className="text-purple-700">{bv.branch_code}</Text>
                        <Text className="text-purple-900 font-semibold">{bv.total_visitors}人</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Card>

              <Card className="mb-4">
                <Text className="text-lg font-bold text-gray-900 mb-3">15分毎の来場者数（店舗別積み上げ）</Text>
                <View className="flex-row flex-wrap mb-2">
                  {branchLegend.map((item) => (
                    <View key={item.branch_id} className="flex-row items-center mr-3 mb-1">
                      <View className="w-3 h-3 rounded mr-1" style={{ backgroundColor: item.color }} />
                      <Text className="text-gray-500 text-xs">{item.branch_code}</Text>
                    </View>
                  ))}
                </View>
                <Text className="text-gray-400 text-xs mb-2">PCはホバー、スマホはタップで内訳を表示</Text>
                {quarterHourlyVisitors.map((slot) => (
                  <Pressable
                    key={slot.time_slot}
                    onHoverIn={() => setHoveredVisitorSlot(slot.time_slot)}
                    onHoverOut={() => setHoveredVisitorSlot(null)}
                    onPress={() => setPinnedVisitorSlot((current) => (current === slot.time_slot ? null : slot.time_slot))}
                    className="py-1.5 border-b border-gray-100 last:border-b-0"
                  >
                    <View className="flex-row items-center">
                      <Text className="w-14 text-gray-600 text-sm font-medium">{slot.time_slot}</Text>
                      <View className="flex-1 mx-2 h-5 bg-gray-100 rounded overflow-hidden">
                        <View className="h-full rounded flex-row overflow-hidden" style={{ width: `${Math.min((slot.total / maxVisitors) * 100, 100)}%` }}>
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
                      <Text className="w-12 text-right text-gray-900 font-semibold">{slot.total}人</Text>
                    </View>
                    {activeVisitorSlot === slot.time_slot && (
                      <View className="mt-2 ml-14 bg-purple-50 border border-purple-100 rounded-lg p-2">
                        <Text className="text-purple-900 text-xs font-semibold mb-1">内訳</Text>
                        {branchLegend.map((item) => {
                          const count = slot.by_branch[item.branch_id] ?? 0;
                          if (count <= 0) return null;
                          return (
                            <View key={`${slot.time_slot}-detail-${item.branch_id}`} className="flex-row items-center justify-between mb-1">
                              <View className="flex-row items-center">
                                <View className="w-2.5 h-2.5 rounded mr-1.5" style={{ backgroundColor: item.color }} />
                                <Text className="text-gray-700 text-xs">{item.branch_code}</Text>
                              </View>
                              <Text className="text-gray-900 text-xs font-semibold">{count}人</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </Pressable>
                ))}
                {quarterHourlyVisitors.length === 0 && <Text className="text-gray-500 text-center py-4">データがありません</Text>}
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
                  <View className="flex-row gap-2">
                    <Button title="各店舗情報" onPress={() => onNavigateToBranchInfo()} size="sm" variant="primary" />
                    <Button title="支店管理" onPress={onNavigateToBranches} size="sm" variant="secondary" />
                  </View>
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
                <Text className="text-gray-400 text-xs mb-2">PCはホバー、スマホはタップで内訳を表示</Text>
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
