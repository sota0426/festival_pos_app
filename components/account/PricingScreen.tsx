import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { Card } from '../common';

interface PricingScreenProps {
  onBack: () => void;
}

const plans = [
  {
    key: 'free' as const,
    name: '無料プラン',
    price: '0円',
    period: '',
    color: 'border-green-400',
    buttonColor: 'bg-green-600',
    features: [
      '1店舗のみ',
      'ローカル保存（端末内のみ）',
      'レジ操作・メニュー管理',
      '売上履歴・CSV出力',
      '来客カウンター',
      '予算管理',
    ],
    limitations: [
      'DB連携なし',
      '他端末からのアクセス不可',
      '本部ダッシュボード利用不可',
    ],
  },
  {
    key: 'store' as const,
    name: '店舗プラン',
    price: '300円',
    period: '/月',
    color: 'border-blue-400',
    buttonColor: 'bg-blue-600',
    features: [
      '1店舗',
      'DB連携（クラウド保存）',
      'ログインコードで他端末アクセス',
      '全POS機能',
      'データバックアップ',
    ],
    limitations: [
      '複数店舗は管理不可',
      '本部ダッシュボード利用不可',
    ],
  },
  {
    key: 'organization' as const,
    name: '団体プラン',
    price: '600円',
    period: '/月',
    color: 'border-purple-400',
    buttonColor: 'bg-purple-600',
    features: [
      '複数店舗（無制限）',
      'DB連携（クラウド保存）',
      'ログインコードで他端末アクセス',
      '全POS機能',
      '本部ダッシュボード',
      '全店舗の売上集計・CSV一括出力',
      'プレゼンテーションモード',
    ],
    limitations: [],
  },
];

export const PricingScreen = ({ onBack }: PricingScreenProps) => {
  const { plan: currentPlan, openCheckout, openPortal, isFreePlan } = useSubscription();
  const [loading, setLoading] = useState<string | null>(null);
  const isPaidCurrent = currentPlan === 'store' || currentPlan === 'organization';

  const handleSelectPlan = async (planKey: 'store' | 'organization') => {
    if (planKey === currentPlan) return;
    try {
      setLoading(planKey);
      if (isPaidCurrent) {
        // 既存有料契約の変更/解約はStripeポータルで一元管理
        await openPortal();
      } else {
        await openCheckout(planKey);
      }
    } catch {
      // エラーはSubscriptionContextで処理
    } finally {
      setLoading(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-row items-center p-4 border-b border-gray-200">
        <TouchableOpacity onPress={onBack} className="p-2">
          <Text className="text-blue-600">&larr; 戻る</Text>
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 ml-2">料金プラン</Text>
      </View>

      <ScrollView contentContainerClassName="p-4 gap-4">
        {plans.map((p) => {
          const isCurrent = p.key === currentPlan;
          return (
            <Card
              key={p.key}
              className={`bg-white p-5 border-2 ${
                isCurrent ? p.color : 'border-gray-100'
              }`}
            >
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-lg font-bold text-gray-900">
                  {p.name}
                </Text>
                <View className="flex-row items-baseline">
                  <Text className="text-2xl font-bold text-gray-900">{p.price}</Text>
                  {p.period ? <Text className="text-gray-500 text-sm">{p.period}</Text> : null}
                </View>
              </View>

              {isCurrent && (
                <View className="bg-gray-100 rounded-lg px-3 py-1.5 mb-3 self-start">
                  <Text className="text-gray-600 text-xs font-semibold">
                    現在のプラン
                  </Text>
                </View>
              )}

              <View className="gap-1.5 mb-3">
                {p.features.map((f) => (
                  <View key={f} className="flex-row items-start">
                    <Text className="text-green-500 mr-2 text-sm">+</Text>
                    <Text className="text-gray-700 text-sm flex-1">{f}</Text>
                  </View>
                ))}
              </View>

              {p.limitations.length > 0 && (
                <View className="gap-1.5 mb-3">
                  {p.limitations.map((l) => (
                    <View key={l} className="flex-row items-start">
                      <Text className="text-gray-400 mr-2 text-sm">-</Text>
                      <Text className="text-gray-400 text-sm flex-1">{l}</Text>
                    </View>
                  ))}
                </View>
              )}

              {p.key !== 'free' && !isCurrent && (
                <TouchableOpacity
                  onPress={() => handleSelectPlan(p.key)}
                  disabled={loading !== null}
                  activeOpacity={0.8}
                  className={`rounded-lg py-3 items-center mt-2 ${p.buttonColor}`}
                >
                  <Text className="text-white font-bold">
                    {loading === p.key
                      ? '処理中...'
                      : isPaidCurrent
                        ? 'お支払い管理で変更'
                        : 'このプランに変更'}
                  </Text>
                </TouchableOpacity>
              )}
            </Card>
          );
        })}

        {!isFreePlan && (
          <Card className="bg-white p-5 border border-orange-200">
            <Text className="text-gray-900 font-bold mb-2">キャンセル・無料プランへの変更</Text>
            <Text className="text-gray-600 text-sm mb-3">
              有料プランの解約、無料プランへの変更、請求情報の確認はStripeのお支払い管理画面で行えます。
            </Text>
            <TouchableOpacity
              onPress={openPortal}
              activeOpacity={0.8}
              className="rounded-lg py-3 items-center bg-orange-500"
            >
              <Text className="text-white font-bold">お支払い管理を開く</Text>
            </TouchableOpacity>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};
