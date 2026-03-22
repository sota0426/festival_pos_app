import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { Card } from '../common';

interface AccountDashboardProps {
  onNavigateToStore: () => void;
  onNavigateToHQ: () => void;
  onNavigateToPricing: () => void;
  onNavigateToAuth: () => void;
  onLogout: () => void;
}

const planLabels: Record<string, { label: string; color: string; bg: string }> = {
  free: { label: '無料プラン', color: 'text-green-700', bg: 'bg-green-100' },
  store: { label: '店舗プラン', color: 'text-blue-700', bg: 'bg-blue-100' },
  org_light: { label: '団体プラン（10店舗）', color: 'text-violet-700', bg: 'bg-violet-100' },
  org_standard: { label: '団体プラン（10店舗）', color: 'text-purple-700', bg: 'bg-purple-100' },
  org_premium: { label: '団体プラン（30店舗）', color: 'text-fuchsia-700', bg: 'bg-fuchsia-100' },
  organization: { label: '団体プラン（10店舗）', color: 'text-purple-700', bg: 'bg-purple-100' }, // legacy
};

export const AccountDashboard = ({
  onNavigateToStore,
  onNavigateToHQ,
  onNavigateToPricing,
  onNavigateToAuth,
  onLogout,
}: AccountDashboardProps) => {
  const { authState, signOut } = useAuth();
  const { plan, status, canAccessHQ, isFreePlan } = useSubscription();

  if (authState.status !== 'authenticated' && authState.status !== 'guest') return null;

  const isGuest = authState.status === 'guest';
  const profile = authState.status === 'authenticated' ? authState.profile : null;
  const planInfo = planLabels[plan] ?? planLabels.free;
  const trialEndLabel =
    authState.status === 'authenticated' && authState.subscription.current_period_end
      ? new Date(authState.subscription.current_period_end).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        })
      : null;

  const handleLogout = async () => {
    if (isGuest) {
      onLogout();
      return;
    }
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
              {isGuest ? '?' : profile?.display_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text className="text-xl font-bold text-gray-900">
            {isGuest ? '未ログイン' : profile?.display_name}
          </Text>
          <Text className="text-gray-500 text-sm">
            {isGuest ? 'この端末にデータを保存して利用できます' : profile?.email}
          </Text>
          <View className={`mt-2 px-3 py-1 rounded-full ${planInfo.bg}`}>
            <Text className={`text-sm font-semibold ${planInfo.color}`}>
              {isGuest ? 'ローカル利用モード' : status === 'trialing' ? '7日間無料トライアル中' : planInfo.label}
            </Text>
          </View>
          {!isGuest && status === 'trialing' && trialEndLabel ? (
            <Text className="mt-2 text-xs text-slate-500">
              無料期間: {trialEndLabel} まで
            </Text>
          ) : null}
          {isGuest && (
            <TouchableOpacity
              onPress={onNavigateToAuth}
              activeOpacity={0.8}
              className="mt-4 px-4 py-2 rounded-full bg-blue-600"
            >
              <Text className="text-white font-semibold">ログインする</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* クイックアクション */}
        <View className="gap-3 mb-6">
          <TouchableOpacity
            onPress={onNavigateToStore}
            activeOpacity={0.8}
          >
            <Card className="bg-green-500 p-5">
              <Text className="text-white text-lg font-bold text-center">
                {isGuest ? '模擬店を開く' : '店舗管理'}
              </Text>
              <Text className="text-green-100 text-center text-sm mt-1">
                {isGuest ? 'ログインなしでローカル保存のまま利用' : '店舗一覧・店舗設定・店舗画面へ移動'}
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={!isGuest && canAccessHQ ? onNavigateToHQ : undefined}
            activeOpacity={!isGuest && canAccessHQ ? 0.8 : 1}
          >
            <Card
              className={`p-5 ${
                !isGuest && canAccessHQ ? 'bg-gray-600' : 'bg-gray-300'
              }`}
            >
              <Text className="text-white text-lg font-bold text-center">
                本部ダッシュボード
              </Text>
              <Text
                className={`text-center text-sm mt-1 ${
                  !isGuest && canAccessHQ ? 'text-gray-200' : 'text-gray-400'
                }`}
              >
                {!isGuest && canAccessHQ
                  ? '売上集計・店舗管理'
                  : isGuest
                    ? 'ログイン後に利用可能'
                    : '店舗プラン以上で利用可能'}
              </Text>
            </Card>
          </TouchableOpacity>
        </View>

        {/* 管理メニュー */}
        <View className="gap-3 mb-6">
          <Text className="text-base font-bold text-gray-800 mb-1">管理</Text>

          {isGuest ? (
            <>
              <TouchableOpacity onPress={onNavigateToPricing} activeOpacity={0.8}>
                <Card className="bg-white p-4">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-semibold text-gray-800">料金プランを見る</Text>
                    <Text className="text-gray-400">&gt;</Text>
                  </View>
                  <Text className="text-gray-500 text-xs mt-1">
                    無料利用と有料プランの違いを確認できます
                  </Text>
                </Card>
              </TouchableOpacity>

              <TouchableOpacity onPress={onNavigateToAuth} activeOpacity={0.8}>
                <Card className="bg-white p-4">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-semibold text-gray-800">ログインして同期を有効化</Text>
                    <Text className="text-gray-400">&gt;</Text>
                  </View>
                  <Text className="text-gray-500 text-xs mt-1">
                    複数端末アクセスやDB同期を利用できます
                  </Text>
                </Card>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={onNavigateToPricing} activeOpacity={0.8}>
              <Card className="bg-white p-4">
                <View className="flex-row justify-between items-center">
                  <Text className="font-semibold text-gray-800">プラン変更</Text>
                  <Text className="text-gray-400">&gt;</Text>
                </View>
                <Text className="text-gray-500 text-xs mt-1">
                  現在: {status === 'trialing' ? `7日間無料トライアル中（${trialEndLabel ?? '期限確認中'}まで）` : planInfo.label}
                </Text>
              </Card>
            </TouchableOpacity>
          )}
        </View>

        {/* アップグレード誘導（無料プランの場合） */}
        {!isGuest && isFreePlan && (
          <TouchableOpacity onPress={onNavigateToPricing} activeOpacity={0.8}>
            <Card className="bg-gradient-to-r from-blue-500 to-purple-500 bg-blue-500 p-5 mb-6">
              <Text className="text-white text-lg font-bold text-center">
                有料プランにアップグレード
              </Text>
              <Text className="text-blue-100 text-center text-sm mt-1">
                DB連携・他端末アクセス・本部機能
              </Text>
              <Text className="text-white text-center text-xs mt-2">
                買い切り 500円から
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
            {isGuest ? 'トップへ戻る' : 'ログアウト'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};
