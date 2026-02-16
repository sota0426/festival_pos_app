import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { Card } from '../common';

interface AccountDashboardProps {
  onNavigateToStore: () => void;
  onNavigateToHQ: () => void;
  onNavigateToPricing: () => void;
  onNavigateToMyStores: () => void;
  onLogout: () => void;
}

const planLabels: Record<string, { label: string; color: string; bg: string }> = {
  free: { label: '無料プラン', color: 'text-green-700', bg: 'bg-green-100' },
  store: { label: '店舗プラン', color: 'text-blue-700', bg: 'bg-blue-100' },
  organization: { label: '団体プラン', color: 'text-purple-700', bg: 'bg-purple-100' },
};

export const AccountDashboard = ({
  onNavigateToStore,
  onNavigateToHQ,
  onNavigateToPricing,
  onNavigateToMyStores,
  onLogout,
}: AccountDashboardProps) => {
  const { authState, signOut } = useAuth();
  const { plan, canAccessHQ, isFreePlan, openPortal } = useSubscription();

  if (authState.status !== 'authenticated') return null;

  const { profile } = authState;
  const planInfo = planLabels[plan] ?? planLabels.free;

  const handleLogout = async () => {
    await signOut();
    onLogout();
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView contentContainerClassName="p-6">
        {/* プロフィール */}
        <View className="items-center mb-6">
          <View className="w-16 h-16 rounded-full bg-gray-300 items-center justify-center mb-3">
            <Text className="text-2xl text-gray-600">
              {profile.display_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text className="text-xl font-bold text-gray-900">
            {profile.display_name}
          </Text>
          <Text className="text-gray-500 text-sm">{profile.email}</Text>
          <View className={`mt-2 px-3 py-1 rounded-full ${planInfo.bg}`}>
            <Text className={`text-sm font-semibold ${planInfo.color}`}>
              {planInfo.label}
            </Text>
          </View>
        </View>

        {/* クイックアクション */}
        <View className="gap-3 mb-6">
          <TouchableOpacity onPress={onNavigateToStore} activeOpacity={0.8}>
            <Card className="bg-green-500 p-5">
              <Text className="text-white text-lg font-bold text-center">
                店舗に入る
              </Text>
              <Text className="text-green-100 text-center text-sm mt-1">
                レジ操作・メニュー管理
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={canAccessHQ ? onNavigateToHQ : undefined}
            activeOpacity={canAccessHQ ? 0.8 : 1}
          >
            <Card
              className={`p-5 ${
                canAccessHQ ? 'bg-gray-600' : 'bg-gray-300'
              }`}
            >
              <Text className="text-white text-lg font-bold text-center">
                本部ダッシュボード
              </Text>
              <Text
                className={`text-center text-sm mt-1 ${
                  canAccessHQ ? 'text-gray-200' : 'text-gray-400'
                }`}
              >
                {canAccessHQ
                  ? '売上集計・店舗管理'
                  : '団体プランで利用可能'}
              </Text>
            </Card>
          </TouchableOpacity>
        </View>

        {/* 管理メニュー */}
        <View className="gap-3 mb-6">
          <Text className="text-base font-bold text-gray-800 mb-1">管理</Text>

          <TouchableOpacity onPress={onNavigateToMyStores} activeOpacity={0.8}>
            <Card className="bg-white p-4">
              <View className="flex-row justify-between items-center">
                <Text className="font-semibold text-gray-800">店舗管理</Text>
                <Text className="text-gray-400">&gt;</Text>
              </View>
              <Text className="text-gray-500 text-xs mt-1">
                ログインコードの確認・店舗の追加
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity onPress={onNavigateToPricing} activeOpacity={0.8}>
            <Card className="bg-white p-4">
              <View className="flex-row justify-between items-center">
                <Text className="font-semibold text-gray-800">プラン変更</Text>
                <Text className="text-gray-400">&gt;</Text>
              </View>
              <Text className="text-gray-500 text-xs mt-1">
                現在: {planInfo.label}
              </Text>
            </Card>
          </TouchableOpacity>

          {!isFreePlan && (
            <TouchableOpacity onPress={openPortal} activeOpacity={0.8}>
              <Card className="bg-white p-4">
                <View className="flex-row justify-between items-center">
                  <Text className="font-semibold text-gray-800">
                    お支払い管理
                  </Text>
                  <Text className="text-gray-400">&gt;</Text>
                </View>
                <Text className="text-gray-500 text-xs mt-1">
                  Stripeで支払い方法・請求書を管理
                </Text>
              </Card>
            </TouchableOpacity>
          )}
        </View>

        {/* アップグレード誘導（無料プランの場合） */}
        {isFreePlan && (
          <TouchableOpacity onPress={onNavigateToPricing} activeOpacity={0.8}>
            <Card className="bg-gradient-to-r from-blue-500 to-purple-500 bg-blue-500 p-5 mb-6">
              <Text className="text-white text-lg font-bold text-center">
                有料プランにアップグレード
              </Text>
              <Text className="text-blue-100 text-center text-sm mt-1">
                DB連携・他端末アクセス・本部機能
              </Text>
              <Text className="text-white text-center text-xs mt-2">
                月額300円から
              </Text>
            </Card>
          </TouchableOpacity>
        )}

        {/* ログアウト */}
        <TouchableOpacity
          onPress={handleLogout}
          activeOpacity={0.8}
          className="py-3"
        >
          <Text className="text-red-500 text-center font-semibold">
            ログアウト
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};
