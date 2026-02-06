// components/hq/HQHome.tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button } from '../common';
import { clearBranch } from '../../lib/storage';
import { alertConfirm } from '../../lib/alertUtils';

interface HQHomeProps {
  onNavigateSales: () => void;
  onNavigateManagementStore: () => void;
  onLogout: () => void;
}

export const HQHome = ({
  onNavigateSales,
  onNavigateManagementStore,
  onLogout,
}: HQHomeProps) => {

  const handleLogout = () => {
    alertConfirm('ログアウト', 'ログアウトしますか？', async () => {
      await clearBranch();
      onLogout();
    }, 'ログアウト');
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <Header
        title="管理画面"
        rightElement={
          <Button title="ログアウト" onPress={handleLogout} size="sm" variant="secondary" />
        }
      />

      <View className="p-4 gap-4">
        <TouchableOpacity onPress={onNavigateSales}>
          <Card className="bg-blue-500 p-6">
            <Text className="text-white text-xl font-bold text-center">売上ダッシュボード</Text>
            <Text className="text-blue-100 text-center mt-1 text-sm">
              売上・支払い・支店別分析
            </Text>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity onPress={onNavigateManagementStore}>
          <Card className="bg-purple-500 p-6">
            <Text className="text-white text-xl font-bold text-center">来場者ダッシュボード</Text>
            <Text className="text-purple-100 text-center mt-1 text-sm">
              来場者数・混雑状況
            </Text>
          </Card>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
