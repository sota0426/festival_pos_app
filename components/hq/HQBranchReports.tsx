import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Header } from '../common';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import type { Branch } from '../../types/database';

interface HQBranchReportsProps {
  focusBranchId?: string | null;
  onBack: () => void;
  onBackToHQ: () => void;
}

interface BranchReportSummary {
  branch: Branch;
  totalSales: number;
  totalExpense: number;
  profit: number;
  transactionCount: number;
  averageOrder: number;
  targetAchievementRate: number;
  paypaySales: number;
  voucherSales: number;
  cashSales: number;
  menuRows: { menu_name: string; quantity: number; subtotal: number }[];
}

export const HQBranchReports = ({ focusBranchId, onBack, onBackToHQ }: HQBranchReportsProps) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState<BranchReportSummary[]>([]);

  const fetchData = useCallback(async () => {
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

      const demoReports: BranchReportSummary[] = [
        {
          branch: demoBranches[0],
          totalSales: 65000,
          totalExpense: 22000,
          profit: 43000,
          transactionCount: 130,
          averageOrder: 500,
          targetAchievementRate: 130,
          paypaySales: 40000,
          voucherSales: 15000,
          cashSales: 10000,
          menuRows: [
            { menu_name: '焼きそば', quantity: 180, subtotal: 54000 },
            { menu_name: 'トッピング', quantity: 55, subtotal: 11000 },
          ],
        },
        {
          branch: demoBranches[1],
          totalSales: 60000,
          totalExpense: 18000,
          profit: 42000,
          transactionCount: 104,
          averageOrder: 577,
          targetAchievementRate: 150,
          paypaySales: 35000,
          voucherSales: 12000,
          cashSales: 13000,
          menuRows: [
            { menu_name: 'たこ焼き', quantity: 160, subtotal: 51200 },
            { menu_name: 'ドリンク', quantity: 44, subtotal: 8800 },
          ],
        },
      ];

      setReports(demoReports);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [{ data: branches, error: branchError }, { data: transactions, error: txError }, { data: items, error: itemError }, { data: expenses, error: expenseError }] =
        await Promise.all([
          supabase.from('branches').select('*').order('branch_code', { ascending: true }),
          supabase.from('transactions').select('id,branch_id,total_amount,payment_method,status').eq('status', 'completed'),
          supabase.from('transaction_items').select('transaction_id,menu_name,quantity,subtotal'),
          supabase.from('budget_expenses').select('branch_id,amount'),
        ]);

      if (branchError) throw branchError;
      if (txError) throw txError;
      if (itemError) throw itemError;
      if (expenseError) throw expenseError;

      const txList = transactions ?? [];
      const itemList = items ?? [];
      const expenseList = expenses ?? [];
      const txBranchMap = new Map<string, string>(txList.map((tx) => [tx.id, tx.branch_id]));

      const summaries: BranchReportSummary[] = (branches ?? []).map((branch: Branch) => {
        const branchTx = txList.filter((tx) => tx.branch_id === branch.id);
        const totalSales = branchTx.reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0);
        const transactionCount = branchTx.length;
        const averageOrder = transactionCount > 0 ? Math.round(totalSales / transactionCount) : 0;
        const paypaySales = branchTx
          .filter((tx) => tx.payment_method === 'paypay')
          .reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0);
        const voucherSales = branchTx
          .filter((tx) => tx.payment_method === 'voucher')
          .reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0);
        const cashSales = branchTx
          .filter((tx) => tx.payment_method === 'cash')
          .reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0);
        const totalExpense = expenseList
          .filter((expense) => expense.branch_id === branch.id)
          .reduce((sum, expense) => sum + (expense.amount ?? 0), 0);
        const profit = totalSales - totalExpense;
        const targetAchievementRate =
          branch.sales_target > 0 ? Math.round((totalSales / branch.sales_target) * 100) : 0;

        const menuMap = new Map<string, { menu_name: string; quantity: number; subtotal: number }>();
        itemList.forEach((item) => {
          const itemBranchId = txBranchMap.get(item.transaction_id);
          if (itemBranchId !== branch.id) return;
          const current = menuMap.get(item.menu_name) ?? {
            menu_name: item.menu_name,
            quantity: 0,
            subtotal: 0,
          };
          current.quantity += item.quantity ?? 0;
          current.subtotal += item.subtotal ?? 0;
          menuMap.set(item.menu_name, current);
        });

        const menuRows = Array.from(menuMap.values()).sort((a, b) => b.subtotal - a.subtotal);

        return {
          branch,
          totalSales,
          totalExpense,
          profit,
          transactionCount,
          averageOrder,
          targetAchievementRate,
          paypaySales,
          voucherSales,
          cashSales,
          menuRows,
        };
      });

      setReports(summaries);
    } catch (error) {
      console.error('Error fetching branch report list:', error);
      setReports([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sortedReports = useMemo(() => {
    if (!focusBranchId) return reports;
    const focused = reports.find((report) => report.branch.id === focusBranchId);
    if (!focused) return reports;
    const others = reports.filter((report) => report.branch.id !== focusBranchId);
    return [focused, ...others];
  }, [focusBranchId, reports]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="各店舗情報"
        subtitle="各店舗の報告書一覧"
        showBack
        onBack={onBack}
        rightElement={<Button title="本部画面" onPress={onBackToHQ} variant="secondary" size="sm" />}
      />
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
                fetchData();
              }}
            />
          }
        >
          {sortedReports.map((report) => (
            <Card
              key={report.branch.id}
              className={`mb-4 ${focusBranchId === report.branch.id ? 'border-2 border-blue-400' : ''}`}
            >
              <View className="flex-row items-center justify-between mb-2">
                <View>
                  <Text className="text-blue-700 font-bold">{report.branch.branch_code}</Text>
                  <Text className="text-gray-900 text-lg font-bold">{report.branch.branch_name}</Text>
                </View>
                <View
                  className={`px-2 py-1 rounded ${
                    report.targetAchievementRate >= 100 ? 'bg-green-100' : 'bg-orange-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      report.targetAchievementRate >= 100 ? 'text-green-700' : 'text-orange-700'
                    }`}
                  >
                    目標達成 {report.targetAchievementRate}%
                  </Text>
                </View>
              </View>

              <View className="flex-row gap-2 mb-3">
                <View className="flex-1 bg-blue-50 rounded-lg p-2">
                  <Text className="text-blue-700 text-xs">収入</Text>
                  <Text className="text-blue-900 font-bold">{report.totalSales.toLocaleString()}円</Text>
                </View>
                <View className="flex-1 bg-rose-50 rounded-lg p-2">
                  <Text className="text-rose-700 text-xs">支出</Text>
                  <Text className="text-rose-900 font-bold">{report.totalExpense.toLocaleString()}円</Text>
                </View>
                <View className={`flex-1 rounded-lg p-2 ${report.profit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <Text className={`text-xs ${report.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>利益</Text>
                  <Text className={`font-bold ${report.profit >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                    {report.profit.toLocaleString()}円
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-gray-600 text-sm">取引 {report.transactionCount}件</Text>
                <Text className="text-gray-600 text-sm">客単価 {report.averageOrder.toLocaleString()}円</Text>
                <Text className="text-gray-600 text-sm">目標 {report.branch.sales_target.toLocaleString()}円</Text>
              </View>

              <View className="mb-3">
                <Text className="text-gray-800 font-semibold mb-1">支払い内訳</Text>
                <View className="flex-row gap-2">
                  <View className="flex-1 bg-sky-50 rounded-lg p-2">
                    <Text className="text-sky-700 text-xs">PayPay</Text>
                    <Text className="text-sky-900 font-semibold">{report.paypaySales.toLocaleString()}円</Text>
                  </View>
                  <View className="flex-1 bg-yellow-50 rounded-lg p-2">
                    <Text className="text-yellow-700 text-xs">金券</Text>
                    <Text className="text-yellow-900 font-semibold">{report.voucherSales.toLocaleString()}円</Text>
                  </View>
                  <View className="flex-1 bg-emerald-50 rounded-lg p-2">
                    <Text className="text-emerald-700 text-xs">現金</Text>
                    <Text className="text-emerald-900 font-semibold">{report.cashSales.toLocaleString()}円</Text>
                  </View>
                </View>
              </View>

              <View>
                <Text className="text-gray-800 font-semibold mb-1">販売商品内訳</Text>
                {report.menuRows.length === 0 ? (
                  <Text className="text-gray-400 text-sm">販売データがありません</Text>
                ) : (
                  report.menuRows.slice(0, 6).map((row) => (
                    <View key={row.menu_name} className="flex-row items-center justify-between py-1 border-b border-gray-100">
                      <Text className="text-gray-700 text-sm">{row.menu_name}</Text>
                      <Text className="text-gray-600 text-xs">{row.quantity}個</Text>
                      <Text className="text-gray-900 text-sm font-semibold">{row.subtotal.toLocaleString()}円</Text>
                    </View>
                  ))
                )}
              </View>
            </Card>
          ))}
          {sortedReports.length === 0 && (
            <Card>
              <Text className="text-gray-500 text-center">表示できる店舗データがありません</Text>
            </Card>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};
