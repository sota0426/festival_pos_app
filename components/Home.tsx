import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from './common';

interface HomeProps {
  onNavigateToHQ: () => void;
  onNavigateToStore: () => void;
  onReturnToLoggedIn?: () => void;
}

export const Home = ({ onNavigateToHQ, onNavigateToStore, onReturnToLoggedIn }: HomeProps) => {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 justify-center p-6">
        {onReturnToLoggedIn && (
          <TouchableOpacity
            onPress={onReturnToLoggedIn}
            className="absolute top-4 right-4 z-10 px-3 py-2 rounded-lg bg-white border border-blue-200"
            activeOpacity={0.8}
          >
            <Text className="text-blue-700 text-sm font-semibold">ログイン画面に戻る</Text>
          </TouchableOpacity>
        )}

        <Text className="text-3xl font-bold text-center text-gray-900 mb-2">
          文化祭レジアプリ
        </Text>
        <Text className="text-gray-500 text-center mb-12">
          ご利用のモードを選択してください
        </Text>

        <View className="gap-6">
          <TouchableOpacity onPress={onNavigateToStore} activeOpacity={0.8}>
            <Card className="bg-green-500 p-8">
              <Text className="text-white text-2xl font-bold text-center">模擬店</Text>
              <Text className="text-green-100 text-center mt-2">
                レジ操作・メニュー登録・販売履歴
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity onPress={onNavigateToHQ} activeOpacity={0.8}>
            <Card className="bg-gray-600 p-8">
              <Text className="text-white text-2xl font-bold text-center">本部</Text>
              <Text className="text-gray-100 text-center mt-2">
                支店管理・売上集計・目標管理
              </Text>
            </Card>
          </TouchableOpacity>
        </View>

        <Text className="text-center text-gray-400 text-xs mt-12">
          v1.0.0 - Festival POS System (2026)
        </Text>
      </View>
    </SafeAreaView>
  );
};
