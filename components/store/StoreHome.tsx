import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button } from '../common';
import { clearBranch, getPendingTransactions, getStoreSettings } from '../../lib/storage';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { alertConfirm } from '../../lib/alertUtils';
import type { Branch } from '../../types/database';

interface StoreHomeProps {
  branch: Branch;
  onNavigateToRegister: () => void;
  onNavigateToMenus: () => void;
  onNavigateToHistory: () => void;
  onNavigateToCounter: () => void;
  onNavigateToSettings: () => void;
  onNavigateToServing?: () => void;
  onLogout: () => void;
}

export const StoreHome = ({
  branch,
  onNavigateToRegister,
  onNavigateToMenus,
  onNavigateToHistory,
  onNavigateToCounter,
  onNavigateToSettings,
  onNavigateToServing,
  onLogout,
}: StoreHomeProps) => {
  const [currentSales, setCurrentSales] = useState(0);
  const [loading, setLoading] = useState(true);
  const [servingEnabled, setServingEnabled] = useState(false);

  const fetchCurrentSales = useCallback(async () => {
    try {
      // Get local pending transactions
      const pendingTrans = await getPendingTransactions();
      const localSales = pendingTrans
        .filter((t) => t.branch_id === branch.id)
        .reduce((sum, t) => sum + t.total_amount, 0);

      if (!isSupabaseConfigured()) {
        setCurrentSales(localSales);
        setLoading(false);
        return;
      }

      // Fetch from Supabase
      const { data: transData, error } = await supabase
        .from('transactions')
        .select('id, total_amount')
        .eq('branch_id', branch.id)
        .eq('status', 'completed');

      if (error) throw error;

      const remoteSales = (transData || []).reduce((sum, t) => sum + t.total_amount, 0);

      // Merge: avoid double-counting synced local transactions
      const remoteIds = new Set((transData || []).map((t) => t.id));
      const uniqueLocalSales = pendingTrans
        .filter((t) => t.branch_id === branch.id && !remoteIds.has(t.id))
        .reduce((sum, t) => sum + t.total_amount, 0);

      setCurrentSales(remoteSales + uniqueLocalSales);
    } catch (error) {
      console.error('Error fetching sales:', error);
      // Fallback to local only
      const pendingTrans = await getPendingTransactions();
      const localSales = pendingTrans
        .filter((t) => t.branch_id === branch.id)
        .reduce((sum, t) => sum + t.total_amount, 0);
      setCurrentSales(localSales);
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

  const fetchSettings = useCallback(async () => {
    const settings = await getStoreSettings();
    setServingEnabled(settings.serving_management_enabled ?? false);
  }, []);

  useEffect(() => {
    fetchCurrentSales();
    fetchSettings();
  }, [fetchCurrentSales, fetchSettings]);

  const handleLogout = () => {
    alertConfirm('ログアウト', 'ログアウトしますか？', async () => {
      await clearBranch();
      onLogout();
    }, 'ログアウト');
  };

  const achievementRate = branch.sales_target > 0
    ? Math.round((currentSales / branch.sales_target) * 100)
    : 0;
  const progressWidth = branch.sales_target > 0
    ? Math.min((currentSales / branch.sales_target) * 100, 100)
    : 0;
  const isAchieved = achievementRate >= 100;

  return (
    <SafeAreaView className="flex-1 bg-gray-100" edges={['top']}>
      <Header
        title={branch.branch_name}
        subtitle={`支店番号: ${branch.branch_code}`}
        rightElement={
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={onNavigateToSettings}
              className="bg-gray-200 px-3 py-2 rounded-lg"
              activeOpacity={0.7}
            >
              <Text className="text-gray-700 text-sm font-medium">⚙️</Text>
            </TouchableOpacity>
            <Button title="ログアウト" onPress={handleLogout} variant="secondary" size="sm" />
          </View>
        }
      />

      <View className="flex-1 p-6">
        <View className="flex-1 gap-4">
          {/* Main Register Button */}
          <TouchableOpacity onPress={onNavigateToRegister} activeOpacity={0.8}>
            <Card className="bg-sky-400 p-8">
              <Text className="text-white text-3xl font-bold text-center">レジ</Text>
              <Text className="text-blue-100 text-center mt-2">注文・会計を行う</Text>
            </Card>
          </TouchableOpacity>

          {/* Serving Management Button (conditional) */}
          {servingEnabled && onNavigateToServing && (
            <TouchableOpacity onPress={onNavigateToServing} activeOpacity={0.8}>
              <Card className="bg-rose-500 p-6">
                <Text className="text-white text-2xl font-bold text-center">提供管理</Text>
                <Text className="text-rose-100 text-center mt-1">注文の提供状況を管理</Text>
              </Card>
            </TouchableOpacity>
          )}

          {/* Visitor Counter Button */}
          <TouchableOpacity onPress={onNavigateToCounter} activeOpacity={0.8}>
            <Card className="bg-purple-500 p-6">
              <Text className="text-white text-2xl font-bold text-center">来客カウンター</Text>
              <Text className="text-purple-100 text-center mt-1">タップして来場者数を記録</Text>
            </Card>
          </TouchableOpacity>

          <View className="flex-row gap-4">
            {/* Menu Management */}
            <TouchableOpacity onPress={onNavigateToMenus} activeOpacity={0.8} className="flex-1">
              <Card className="bg-green-400 p-6">
                <Text className="text-white text-xl font-bold text-center">メニュー登録</Text>
                <Text className="text-green-100 text-center mt-1 text-sm">商品・在庫管理</Text>
              </Card>
            </TouchableOpacity>

            {/* Sales History */}
            <TouchableOpacity onPress={onNavigateToHistory} activeOpacity={0.8} className="flex-1">
              <Card className="bg-orange-400 p-6">
                <Text className="text-white text-xl font-bold text-center">販売履歴</Text>
                <Text className="text-orange-100 text-center mt-1 text-sm">売上確認・取消</Text>
              </Card>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sales & Achievement Status */}
        <Card className="mt-4">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-1">
              <Text className="text-gray-500 text-sm">現在の売上</Text>
              <Text className={`text-2xl font-bold ${isAchieved ? 'text-green-600' : 'text-blue-600'}`}>
                {loading ? '---' : `${currentSales.toLocaleString()}円`}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-gray-500 text-sm">売上目標</Text>
              <Text className="text-lg font-bold text-gray-900">
                {branch.sales_target > 0 ? `${branch.sales_target.toLocaleString()}円` : '未設定'}
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          {branch.sales_target > 0 && (
            <View className="mb-3">
              <View className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <View
                  className={`h-full rounded-full ${isAchieved ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${progressWidth}%` }}
                />
              </View>
              <Text className={`text-right mt-1 text-sm font-semibold ${isAchieved ? 'text-green-600' : 'text-blue-600'}`}>
                {loading ? '---' : `達成率: ${achievementRate}%`}
              </Text>
            </View>
          )}

          <View className="flex-row items-center justify-end">
            <View className={`px-3 py-1 rounded-full ${branch.status === 'active' ? 'bg-green-100' : 'bg-gray-100'}`}>
              <Text className={`font-medium ${branch.status === 'active' ? 'text-green-700' : 'text-gray-500'}`}>
                {branch.status === 'active' ? '稼働中' : '停止中'}
              </Text>
            </View>
          </View>
        </Card>
      </View>
    </SafeAreaView>
  );
};
