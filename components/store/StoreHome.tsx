import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button } from '../common';
import { clearBranch } from '../../lib/storage';
import type { Branch } from '../../types/database';

interface StoreHomeProps {
  branch: Branch;
  onNavigateToRegister: () => void;
  onNavigateToMenus: () => void;
  onNavigateToHistory: () => void;
  onNavigateToCounter: () => void;
  onLogout: () => void;
}

export const StoreHome = ({
  branch,
  onNavigateToRegister,
  onNavigateToMenus,
  onNavigateToHistory,
  onNavigateToCounter,
  onLogout,
}: StoreHomeProps) => {
  const handleLogout = () => {
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト',
        style: 'destructive',
        onPress: async () => {
          await clearBranch();
          onLogout();
        },
      },
    ]);
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
      </View>
    </SafeAreaView>
  );
};
