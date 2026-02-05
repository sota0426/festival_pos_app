import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Header } from '../common';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { clearHQAuth } from '../../lib/storage';
import type { SalesAggregation, BranchSales, HourlySales, HalfHourlyVisitors, BranchVisitors } from '../../types/database';

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
  const [totalVisitors, setTotalVisitors] = useState(0);
  const [halfHourlyVisitors, setHalfHourlyVisitors] = useState<HalfHourlyVisitors[]>([]);
  const [branchVisitors, setBranchVisitors] = useState<BranchVisitors[]>([]);

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

      // Demo visitor data
      setTotalVisitors(487);
      setHalfHourlyVisitors([
        { time_slot: '10:00', count: 23 },
        { time_slot: '10:30', count: 31 },
        { time_slot: '11:00', count: 45 },
        { time_slot: '11:30', count: 52 },
        { time_slot: '12:00', count: 78 },
        { time_slot: '12:30', count: 85 },
        { time_slot: '13:00', count: 67 },
        { time_slot: '13:30', count: 54 },
        { time_slot: '14:00', count: 38 },
        { time_slot: '14:30', count: 14 },
      ]);
      setBranchVisitors([
        {
          branch_id: '1',
          branch_code: 'S001',
          branch_name: '焼きそば屋',
          total_visitors: 256,
          half_hourly: [],
        },
        {
          branch_id: '2',
          branch_code: 'S002',
          branch_name: 'たこ焼き屋',
          total_visitors: 231,
          half_hourly: [],
        },
      ]);

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

      // Fetch visitor counts
      const { data: visitorCounts, error: visitorError } = await supabase
        .from('visitor_counts')
        .select('*');

      if (visitorError) console.log('Visitor counts not available:', visitorError);

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

      // Calculate visitor stats
      if (visitorCounts) {
        const total = visitorCounts.reduce((sum, v) => sum + v.count, 0);
        setTotalVisitors(total);

        // Calculate half-hourly visitors
        const halfHourlyMap = new Map<string, number>();
        visitorCounts.forEach((v) => {
          const date = new Date(v.timestamp);
          const hours = date.getHours();
          const minutes = date.getMinutes();
          const slot = minutes < 30 ? '00' : '30';
          const timeSlot = `${hours.toString().padStart(2, '0')}:${slot}`;
          const existing = halfHourlyMap.get(timeSlot) || 0;
          halfHourlyMap.set(timeSlot, existing + v.count);
        });

        const halfHourlyData: HalfHourlyVisitors[] = Array.from(halfHourlyMap.entries())
          .map(([time_slot, count]) => ({ time_slot, count }))
          .sort((a, b) => a.time_slot.localeCompare(b.time_slot));

        setHalfHourlyVisitors(halfHourlyData);

        // Calculate branch visitors
        const branchVisitorsData: BranchVisitors[] = (branches || []).map((branch) => {
          const branchCounts = visitorCounts.filter(v => v.branch_id === branch.id);
          const branchTotal = branchCounts.reduce((sum, v) => sum + v.count, 0);

          return {
            branch_id: branch.id,
            branch_code: branch.branch_code,
            branch_name: branch.branch_name,
            total_visitors: branchTotal,
            half_hourly: [],
          };
        });

        setBranchVisitors(branchVisitorsData);
      }
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
  const maxVisitors = halfHourlyVisitors.length > 0 ? Math.max(...halfHourlyVisitors.map(h => h.count)) : 1;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="本部ダッシュボード"
        subtitle="売上・来場者集計"
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

        {/* Visitor Stats */}
        <Card className="mb-4 bg-purple-50">
          <Text className="text-lg font-bold text-purple-900 mb-3">来場者数</Text>
          <View className="flex-row flex-wrap">
            <View className="w-1/2 mb-3">
              <Text className="text-purple-600 text-sm">本日の総来場者</Text>
              <Text className="text-3xl font-bold text-purple-700">
                {totalVisitors.toLocaleString()}人
              </Text>
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

        {/* Half-hourly Visitors Chart */}
        <Card className="mb-4">
          <Text className="text-lg font-bold text-gray-900 mb-3">30分毎の来場者数</Text>
          {halfHourlyVisitors.map((slot) => (
            <View key={slot.time_slot} className="flex-row items-center py-1.5 border-b border-gray-100 last:border-b-0">
              <Text className="w-14 text-gray-600 text-sm font-medium">{slot.time_slot}</Text>
              <View className="flex-1 mx-2 h-5 bg-gray-100 rounded overflow-hidden">
                <View
                  className="h-full bg-purple-500 rounded"
                  style={{
                    width: `${Math.min((slot.count / maxVisitors) * 100, 100)}%`,
                  }}
                />
              </View>
              <Text className="w-12 text-right text-gray-900 font-semibold">
                {slot.count}人
              </Text>
            </View>
          ))}
          {halfHourlyVisitors.length === 0 && (
            <Text className="text-gray-500 text-center py-4">データがありません</Text>
          )}
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
