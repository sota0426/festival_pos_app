// components/hq/HQHome.tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button } from '../common';

interface HQHomeProps {
  onNavigateSales: () => void;
  onNavigateBranchInfo: () => void;
  onNavigatePresentation: () => void;
  onLogout: () => void;
}

export const HQHome = ({
  onNavigateSales,
  onNavigateBranchInfo,
  onNavigatePresentation,
  onLogout,
}: HQHomeProps) => {
  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <Header
        title="管理画面"
        rightElement={
          <Button title="ホームに戻る" onPress={onLogout} size="sm" variant="secondary" />
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

        <TouchableOpacity onPress={onNavigateBranchInfo}>
          <Card className="bg-cyan-600 p-6">
            <Text className="text-white text-xl font-bold text-center">各店舗情報</Text>
            <Text className="text-cyan-100 text-center mt-1 text-sm">
              各店舗の報告書を一覧表示
            </Text>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity onPress={onNavigatePresentation}>
          <Card className="bg-rose-500 p-6">
            <Text className="text-white text-xl font-bold text-center">プレゼンテーション</Text>
            <Text className="text-rose-100 text-center mt-1 text-sm">
              総合結果を発表モードで表示
            </Text>
          </Card>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
