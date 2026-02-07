import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button } from '../common';
import { clearBranch, getStoreSettings, saveStoreSettings } from '../../lib/storage';
import { alertConfirm } from '../../lib/alertUtils';
import type { Branch } from '../../types/database';

interface StoreHomeProps {
  branch: Branch;
  onNavigateToRegister: () => void;
  onNavigateToMenus: () => void;
  onNavigateToHistory: () => void;
  onNavigateToCounter: () => void;
  onNavigateToOrderBoard: () => void;
  onLogout: () => void;
}

export const StoreHome = ({
  branch,
  onNavigateToRegister,
  onNavigateToMenus,
  onNavigateToHistory,
  onNavigateToCounter,
  onNavigateToOrderBoard,
  onLogout,
}: StoreHomeProps) => {
  const [orderBoardEnabled, setOrderBoardEnabled] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getStoreSettings();
      setOrderBoardEnabled(settings.order_board_enabled ?? false);
    };
    loadSettings();
  }, []);

  const toggleOrderBoard = async () => {
    const newValue = !orderBoardEnabled;
    setOrderBoardEnabled(newValue);
    const currentSettings = await getStoreSettings();
    await saveStoreSettings({ ...currentSettings, order_board_enabled: newValue });
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

      <View className="flex-1 p-6">
        <View className="flex-1 gap-4">
          {/* Main Register Button */}
          <TouchableOpacity onPress={onNavigateToRegister} activeOpacity={0.8}>
            <Card className="bg-sky-400 p-8">
              <Text className="text-white text-3xl font-bold text-center">レジ</Text>
              <Text className="text-blue-100 text-center mt-2">注文・会計を行う</Text>
            </Card>
          </TouchableOpacity>


          {/* Visitor Counter Button */}
          <TouchableOpacity onPress={onNavigateToCounter} activeOpacity={0.8}>
            <Card className="bg-purple-500 p-6">
              <Text className="text-white text-2xl font-bold text-center">来客カウンター</Text>
              <Text className="text-purple-100 text-center mt-1">タップして来場者数を記録</Text>
            </Card>
          </TouchableOpacity>

          {/* Order Board Button - show only when enabled */}
          {orderBoardEnabled && (
            <TouchableOpacity onPress={onNavigateToOrderBoard} activeOpacity={0.8}>
              <Card className="bg-amber-400 p-6">
                <Text className="text-white text-2xl font-bold text-center">注文受付</Text>
                <Text className="text-amber-100 text-center mt-1">別端末で注文を表示・管理</Text>
              </Card>
            </TouchableOpacity>
          )}

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

        {/* Status Info */}
        <Card className="mt-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-gray-500 text-sm">売上目標</Text>
              <Text className="text-lg font-bold text-gray-900">
                {branch.sales_target > 0 ? `${branch.sales_target.toLocaleString()}円` : '未設定'}
              </Text>
            </View>
            <View className={`px-3 py-1 rounded-full ${branch.status === 'active' ? 'bg-green-100' : 'bg-gray-100'}`}>
              <Text className={`font-medium ${branch.status === 'active' ? 'text-green-700' : 'text-gray-500'}`}>
                {branch.status === 'active' ? '稼働中' : '停止中'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Order Board Toggle */}
        <Card className="mt-2">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-gray-700 font-medium">注文受付画面</Text>
              <Text className="text-gray-400 text-xs">別端末での注文表示</Text>
            </View>
            <TouchableOpacity
              onPress={toggleOrderBoard}
              activeOpacity={0.8}
              className={`w-12 h-7 rounded-full justify-center ${
                orderBoardEnabled ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <View
                className={`w-5 h-5 rounded-full bg-white shadow-sm ${
                  orderBoardEnabled ? 'ml-6' : 'ml-1'
                }`}
              />
            </TouchableOpacity>
          </View>
        </Card>
      </View>
    </SafeAreaView>
  );
};
