import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Header } from '../common';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { clearHQAuth } from '../../lib/storage';
import type { SalesAggregation, BranchSales, HourlySales } from '../../types/database';

interface HQDashboardProps {
  onNavigateToBranches: () => void;
  onLogout: () => void;
}

export const HQDashboard = ({ onNavigateToBranches, onLogout }: HQDashboardProps) => {
  const [refreshing, setRefreshing] = useState(false);
  const [totalSales, setTotalSales] = useState<SalesAggregation>({
    total_sales: 0,
    transaction_count: 0,
    average_order: 0,
    paypay_sales: 0,
    voucher_sales: 0,
  });
  const [branchSales, setBranchSales] = useState<BranchSales[]>([]);
  const [hourlySales, setHourlySales] = useState<HourlySales[]>([]);
  const [overallTarget, setOverallTarget] = useState(0);

  const fetchDashboardData = useCallback(async () => {
    
    if (!isSupabaseConfigured()) {
      // Demo data
      setTotalSales({
        total_sales: 125000,
        transaction_count: 234,
        average_order: 534,
        paypay_sales: 75000,
        voucher_sales: 50000,
      });
      setBranchSales([
        {
          branch_id: '1',
          branch_code: 'S001',
          branch_name: '焼きそば屋',
          total_sales: 65000,
          transaction_count: 130,
          average_order: 500,
          paypay_sales: 40000,
          voucher_sales: 25000,
          sales_target: 50000,
          achievement_rate: 130,
        },
        {
          branch_id: '2',
          branch_code: 'S002',
          branch_name: 'たこ焼き屋',
          total_sales: 60000,
          transaction_count: 104,
          average_order: 577,
          paypay_sales: 35000,
          voucher_sales: 25000,
          sales_target: 40000,
          achievement_rate: 150,
        },
      ]);
      setHourlySales([
        { hour: 10, sales: 15000, transaction_count: 28 },
        { hour: 11, sales: 25000, transaction_count: 47 },
        { hour: 12, sales: 35000, transaction_count: 66 },
        { hour: 13, sales: 30000, transaction_count: 56 },
        { hour: 14, sales: 20000, transaction_count: 37 },
      ]);
      setOverallTarget(90000);
      setRefreshing(false);
      return;
    }

    try {
      // Fetch transactions
      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .eq('status', 'completed');

      if (transError) throw transError;

      // Fetch branches
      const { data: branches, error: branchError } = await supabase
        .from('branches')
        .select('*');

      if (branchError) throw branchError;

      // Calculate total sales
      const total_sales = transactions?.reduce((sum, t) => sum + t.total_amount, 0) || 0;
      const transaction_count = transactions?.length || 0;
      const paypay_sales = transactions?.filter(t => t.payment_method === 'paypay').reduce((sum, t) => sum + t.total_amount, 0) || 0;
      const voucher_sales = transactions?.filter(t => t.payment_method === 'voucher').reduce((sum, t) => sum + t.total_amount, 0) || 0;

      setTotalSales({
        total_sales,
        transaction_count,
        average_order: transaction_count > 0 ? Math.round(total_sales / transaction_count) : 0,
        paypay_sales,
        voucher_sales,
      });

      // Calculate branch sales
      const branchSalesData: BranchSales[] = (branches || []).map((branch) => {
        const branchTrans = transactions?.filter(t => t.branch_id === branch.id) || [];
        const branch_total = branchTrans.reduce((sum, t) => sum + t.total_amount, 0);
        const branch_count = branchTrans.length;
        const branch_paypay = branchTrans.filter(t => t.payment_method === 'paypay').reduce((sum, t) => sum + t.total_amount, 0);
        const branch_voucher = branchTrans.filter(t => t.payment_method === 'voucher').reduce((sum, t) => sum + t.total_amount, 0);

        return {
          branch_id: branch.id,
          branch_code: branch.branch_code,
          branch_name: branch.branch_name,
          total_sales: branch_total,
          transaction_count: branch_count,
          average_order: branch_count > 0 ? Math.round(branch_total / branch_count) : 0,
          paypay_sales: branch_paypay,
          voucher_sales: branch_voucher,
          sales_target: branch.sales_target,
          achievement_rate: branch.sales_target > 0 ? Math.round((branch_total / branch.sales_target) * 100) : 0,
        };
      });

      setBranchSales(branchSalesData);
      setOverallTarget(branches?.reduce((sum, b) => sum + b.sales_target, 0) || 0);

      // Calculate hourly sales
      const hourlyMap = new Map<number, { sales: number; count: number }>();
      transactions?.forEach((t) => {
        const hour = new Date(t.created_at).getHours();
        const existing = hourlyMap.get(hour) || { sales: 0, count: 0 };
        hourlyMap.set(hour, {
          sales: existing.sales + t.total_amount,
          count: existing.count + 1,
        });
      });

      const hourlyData: HourlySales[] = Array.from(hourlyMap.entries())
        .map(([hour, data]) => ({
          hour,
          sales: data.sales,
          transaction_count: data.count,
        }))
        .sort((a, b) => a.hour - b.hour);

      setHourlySales(hourlyData);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleLogout = async () => {
    await clearHQAuth();
    onLogout();
  };

  const achievementRate = overallTarget > 0 ? Math.round((totalSales.total_sales / overallTarget) * 100) : 0;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="本部ダッシュボード"
        subtitle="売上集計"
        rightElement={
          <Button title="ログアウト" onPress={handleLogout} variant="secondary" size="sm" />
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            fetchDashboardData();
          }} />
        }
      >
        {/* Overall Stats */}
        <Card className="mb-4">
          <Text className="text-lg font-bold text-gray-900 mb-3">全体売上</Text>
          <View className="flex-row flex-wrap">
            <View className="w-1/2 mb-3">
              <Text className="text-gray-500 text-sm">売上合計</Text>
              <Text className="text-2xl font-bold text-blue-600">
                {totalSales.total_sales.toLocaleString()}円
              </Text>
            </View>
            <View className="w-1/2 mb-3">
              <Text className="text-gray-500 text-sm">取引件数</Text>
              <Text className="text-2xl font-bold text-gray-900">
                {totalSales.transaction_count}件
              </Text>
            </View>
            <View className="w-1/2 mb-3">
              <Text className="text-gray-500 text-sm">平均客単価</Text>
              <Text className="text-xl font-semibold text-gray-700">
                {totalSales.average_order.toLocaleString()}円
              </Text>
            </View>
            <View className="w-1/2 mb-3">
              <Text className="text-gray-500 text-sm">目標達成率</Text>
              <Text className={`text-xl font-semibold ${achievementRate >= 100 ? 'text-green-600' : 'text-orange-500'}`}>
                {achievementRate}%
              </Text>
            </View>
          </View>
        </Card>

        {/* Payment Method Breakdown */}
        <Card className="mb-4">
          <Text className="text-lg font-bold text-gray-900 mb-3">支払い方法別</Text>
          <View className="flex-row">
            <View className="flex-1 items-center p-3 bg-blue-50 rounded-lg mr-2">
              <Text className="text-blue-600 font-semibold">PayPay</Text>
              <Text className="text-xl font-bold text-blue-700">
                {totalSales.paypay_sales.toLocaleString()}円
              </Text>
            </View>
            <View className="flex-1 items-center p-3 bg-yellow-50 rounded-lg">
              <Text className="text-yellow-600 font-semibold">金券</Text>
              <Text className="text-xl font-bold text-yellow-700">
                {totalSales.voucher_sales.toLocaleString()}円
              </Text>
            </View>
          </View>
        </Card>

        {/* Branch Sales */}
        <Card className="mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-gray-900">支店別売上</Text>
            <Button title="支店管理" onPress={onNavigateToBranches} size="sm" variant="secondary" />
          </View>
          {branchSales.map((branch) => (
            <View key={branch.branch_id} className="border-b border-gray-100 py-3 last:border-b-0">
              <View className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center">
                  <Text className="text-blue-600 font-semibold mr-2">{branch.branch_code}</Text>
                  <Text className="text-gray-900">{branch.branch_name}</Text>
                </View>
                <Text className="font-bold text-gray-900">
                  {branch.total_sales.toLocaleString()}円
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-gray-500 text-sm">{branch.transaction_count}件</Text>
                <View className="flex-row items-center">
                  <Text className="text-gray-500 text-sm mr-2">
                    目標: {branch.sales_target.toLocaleString()}円
                  </Text>
                  <View className={`px-2 py-0.5 rounded ${branch.achievement_rate >= 100 ? 'bg-green-100' : 'bg-orange-100'}`}>
                    <Text className={`text-xs font-semibold ${branch.achievement_rate >= 100 ? 'text-green-700' : 'text-orange-700'}`}>
                      {branch.achievement_rate}%
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </Card>

        {/* Hourly Sales */}
        <Card className="mb-4">
          <Text className="text-lg font-bold text-gray-900 mb-3">時間帯別売上</Text>
          {hourlySales.map((hourly) => (
            <View key={hourly.hour} className="flex-row items-center py-2 border-b border-gray-100 last:border-b-0">
              <Text className="w-16 text-gray-600 font-medium">{hourly.hour}:00</Text>
              <View className="flex-1 mx-2">
                <View
                  className="h-6 bg-blue-500 rounded"
                  style={{
                    width: `${Math.min((hourly.sales / Math.max(...hourlySales.map(h => h.sales))) * 100, 100)}%`,
                  }}
                />
              </View>
              <Text className="w-24 text-right text-gray-900 font-semibold">
                {hourly.sales.toLocaleString()}円
              </Text>
            </View>
          ))}
          {hourlySales.length === 0 && (
            <Text className="text-gray-500 text-center py-4">データがありません</Text>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};
