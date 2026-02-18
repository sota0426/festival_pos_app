// components/hq/HQHome.tsx
import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button } from '../common';

interface HQHomeProps {
  onNavigateSales: () => void;
  onNavigateBranchInfo: () => void;
  onNavigateMyStores: () => void;
  onNavigatePresentation: () => void;
  onLogout: () => void;
}

export const HQHome = ({
  onNavigateSales,
  onNavigateBranchInfo,
  onNavigateMyStores,
  onNavigatePresentation,
  onLogout,
}: HQHomeProps) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'analytics'>('analytics');

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <Header
        title="管理画面"
        rightElement={
          <Button title="ホームに戻る" onPress={onLogout} size="sm" variant="secondary" />
        }
      />

      <View className="flex-row bg-white border-b border-gray-200">
        <TouchableOpacity
          onPress={() => setActiveTab('analytics')}
          activeOpacity={0.7}
          className={`flex-1 py-3 items-center border-b-2 ${
            activeTab === 'analytics' ? 'border-blue-500' : 'border-transparent'
          }`}
        >
          <Text className={`text-base font-bold ${activeTab === 'analytics' ? 'text-blue-600' : 'text-gray-400'}`}>
            データ分析
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('settings')}
          activeOpacity={0.7}
          className={`flex-1 py-3 items-center border-b-2 ${
            activeTab === 'settings' ? 'border-blue-500' : 'border-transparent'
          }`}
        >
          <Text className={`text-base font-bold ${activeTab === 'settings' ? 'text-blue-600' : 'text-gray-400'}`}>
            店舗設定
          </Text>
        </TouchableOpacity>
      </View>

      <View className="p-4 gap-4">
        {activeTab === 'analytics' && (
          <>
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
          </>
        )}

        {activeTab === 'settings' && (
          <>
            <TouchableOpacity onPress={onNavigateMyStores}>
              <Card className="bg-indigo-600 p-6">
                <Text className="text-white text-xl font-bold text-center">店舗管理</Text>
                <Text className="text-indigo-100 text-center mt-1 text-sm">
                  ログインコード確認・店舗の追加/編集
                </Text>
              </Card>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
};
