import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button } from '../common';
import { clearBranch, getPendingTransactions, getStoreSettings, saveStoreSettings } from '../../lib/storage';
import { alertConfirm } from '../../lib/alertUtils';
import type { Branch, PaymentMethodSettings } from '../../types/database';
import { isSupabaseConfigured, supabase } from 'lib/supabase';

type TabKey = 'main' | 'sub' | 'budget' | 'settings';

interface StoreHomeProps {
  branch: Branch;
  onNavigateToRegister: () => void;
  onNavigateToMenus: () => void;
  onNavigateToHistory: () => void;
  onNavigateToCounter: () => void;
  onNavigateToOrderBoard: () => void;
  onNavigateToBudget: () => void;
  onLogout: () => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'main', label: 'メイン' },
  { key: 'sub', label: 'サブ' },
  { key: 'budget', label: '予算管理' },
  { key: 'settings', label: '設定' },
];

export const StoreHome = ({
  branch,
  onNavigateToRegister,
  onNavigateToMenus,
  onNavigateToHistory,
  onNavigateToCounter,
  onNavigateToOrderBoard,
  onNavigateToBudget,
  onLogout,
}: StoreHomeProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>('main');
  const [currentSales, setCurrentSales] = useState(0);
  const [loadingSales, setLoadingSales] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSettings>({
    cash: false,
    cashless: true,
    voucher: true,
  });

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getStoreSettings();
      if (settings.sub_screen_mode) {
        setActiveTab('sub');
      }
      if (settings.payment_methods) {
        setPaymentMethods(settings.payment_methods);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const pending = await getPendingTransactions();
        const localSales = pending
          .filter((t) => t.branch_id === branch.id)
          .reduce((sum, t) => sum + t.total_amount, 0);

        if (!isSupabaseConfigured()) {
          setCurrentSales(localSales);
          return;
        }

        const { data, error } = await supabase
          .from('transactions')
          .select('total_amount')
          .eq('branch_id', branch.id)
          .eq('status', 'completed');

        if (error) throw error;

        const remoteSales =
          data?.reduce((sum, t) => sum + t.total_amount, 0) ?? 0;

        setCurrentSales(remoteSales + localSales);
      } catch (e) {
        console.error('売上取得失敗', e);
      } finally {
        setLoadingSales(false);
      }
    };

    fetchSales();
  }, [branch.id]);

  const achievementRate =
    branch.sales_target > 0
      ?  Math.floor((currentSales / branch.sales_target) * 100)
      : 0 ;

  const handleTabChange = async (tab: TabKey) => {
    setActiveTab(tab);
    const currentSettings = await getStoreSettings();
    await saveStoreSettings({ ...currentSettings, sub_screen_mode: tab === 'sub' });
  };

  const togglePaymentMethod = async (key: keyof PaymentMethodSettings) => {
    const updated = { ...paymentMethods, [key]: !paymentMethods[key] };
    // Ensure at least one payment method is enabled
    if (!updated.cash && !updated.cashless && !updated.voucher) return;
    setPaymentMethods(updated);
    const currentSettings = await getStoreSettings();
    await saveStoreSettings({ ...currentSettings, payment_methods: updated });
  };

  const handleLogout = () => {
    alertConfirm('ログアウト', 'ログアウトしますか？', async () => {
      await clearBranch();
      onLogout();
    }, 'ログアウト');
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100" edges={['top']}>
      <Header
        title={branch.branch_name}
        subtitle={`支店番号: ${branch.branch_code}`}
        rightElement={
          <Button title="ログアウト" onPress={handleLogout} variant="secondary" size="sm" />
        }
      />

      {/* Tab Bar */}
      <View className="flex-row bg-white border-b border-gray-200">
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => handleTabChange(tab.key)}
            activeOpacity={0.7}
            className={`flex-1 py-3 items-center border-b-2 ${
              activeTab === tab.key ? 'border-blue-500' : 'border-transparent'
            }`}
          >
            <Text
              className={`text-base font-bold ${
                activeTab === tab.key ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <ScrollView className="flex-1 p-6" contentContainerStyle={{ flexGrow: 1 }}>
        {activeTab === 'main' && (
          <View className="flex-1 gap-4">
            <TouchableOpacity onPress={onNavigateToRegister} activeOpacity={0.8}>
              <Card className="bg-sky-400 p-8">
                <Text className="text-white text-3xl font-bold text-center">レジ</Text>
                <Text className="text-blue-100 text-center mt-2">注文・会計を行う</Text>
              </Card>
            </TouchableOpacity>

            <View className="flex-row gap-4">
              <TouchableOpacity onPress={onNavigateToMenus} activeOpacity={0.8} className="flex-1">
                <Card className="bg-green-400 p-6">
                  <Text className="text-white text-xl font-bold text-center">メニュー登録</Text>
                  <Text className="text-green-100 text-center mt-1 text-sm">商品・在庫管理</Text>
                </Card>
              </TouchableOpacity>

              <TouchableOpacity onPress={onNavigateToHistory} activeOpacity={0.8} className="flex-1">
                <Card className="bg-orange-400 p-6">
                  <Text className="text-white text-xl font-bold text-center">販売履歴</Text>
                  <Text className="text-orange-100 text-center mt-1 text-sm">売上確認・取消</Text>
                </Card>
              </TouchableOpacity>
            </View>

          </View>
        )}

        {activeTab === 'sub' && (
          <View className="flex-1 gap-4">
            <TouchableOpacity onPress={onNavigateToCounter} activeOpacity={0.8}>
              <Card className="bg-purple-500 p-8">
                <Text className="text-white text-3xl font-bold text-center">来客カウンター</Text>
                <Text className="text-purple-100 text-center mt-2">タップして来場者数を記録</Text>
              </Card>
            </TouchableOpacity>

            <TouchableOpacity onPress={onNavigateToOrderBoard} activeOpacity={0.8}>
              <Card className="bg-amber-400 p-8">
                <Text className="text-white text-3xl font-bold text-center">注文受付</Text>
                <Text className="text-amber-100 text-center mt-2">別端末で注文を表示・管理</Text>
              </Card>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'budget' && (
          <View className="flex-1 gap-4">
            <TouchableOpacity onPress={onNavigateToBudget} activeOpacity={0.8}>
              <Card className="bg-indigo-500 p-8">
                <Text className="text-white text-3xl font-bold text-center">予算管理</Text>
                <Text className="text-indigo-100 text-center mt-2">支出記録・損益分岐点・報告書</Text>
              </Card>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'settings' && (
          <View className="gap-4">
            {/* Sales Status */}
            <Card>
              <Text className="text-gray-900 text-lg font-bold mb-3">売上状況</Text>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-gray-500 text-sm">売上目標</Text>
                  <Text className="text-lg font-bold text-gray-900">
                    {branch.sales_target > 0 ? `${branch.sales_target.toLocaleString()}円` : '未設定'}
                  </Text>
                  <Text className="text-sm text-gray-600 mt-1">
                    現在売上：{currentSales.toLocaleString()}円
                  </Text>
                  {branch.sales_target > 0 && (
                    <Text className="text-sm text-blue-600 font-medium">
                      達成率：{achievementRate}%
                    </Text>
                  )}
                </View>
                <View
                  className={`px-3 py-1 rounded-full ${
                    branch.status === 'active' ? 'bg-green-100' : 'bg-gray-100'
                  }`}
                >
                  <Text
                    className={`font-medium ${
                      branch.status === 'active' ? 'text-green-700' : 'text-gray-500'
                    }`}
                  >
                    {branch.status === 'active' ? '稼働中' : '停止中'}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Payment Method Settings */}
            <Card>
              <Text className="text-gray-900 text-lg font-bold mb-3">支払い設定</Text>
              <Text className="text-gray-500 text-sm mb-3">
                レジ画面に表示する支払い方法を選択してください
              </Text>
              <View className="gap-3">
                {/* Cash */}
                <TouchableOpacity
                  onPress={() => togglePaymentMethod('cash')}
                  activeOpacity={0.7}
                  className={`flex-row items-center p-4 rounded-xl border-2 ${
                    paymentMethods.cash ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <View
                    className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                      paymentMethods.cash ? 'border-green-500 bg-green-500' : 'border-gray-300'
                    }`}
                  >
                    {paymentMethods.cash && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold">現金</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">テンキーで金額入力・お釣り計算</Text>
                  </View>
                </TouchableOpacity>

                {/* Cashless */}
                <TouchableOpacity
                  onPress={() => togglePaymentMethod('cashless')}
                  activeOpacity={0.7}
                  className={`flex-row items-center p-4 rounded-xl border-2 ${
                    paymentMethods.cashless ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <View
                    className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                      paymentMethods.cashless ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}
                  >
                    {paymentMethods.cashless && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold">キャッシュレス</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">PayPay等の電子決済</Text>
                  </View>
                </TouchableOpacity>

                {/* Voucher */}
                <TouchableOpacity
                  onPress={() => togglePaymentMethod('voucher')}
                  activeOpacity={0.7}
                  className={`flex-row items-center p-4 rounded-xl border-2 ${
                    paymentMethods.voucher ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <View
                    className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                      paymentMethods.voucher ? 'border-amber-500 bg-amber-500' : 'border-gray-300'
                    }`}
                  >
                    {paymentMethods.voucher && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold">金券</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">金券・チケットでの支払い</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};
