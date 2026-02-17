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
    price: 0,
    period: '',
    color: 'border-emerald-400',
    buttonColor: 'bg-green-600',
    accentBg: 'bg-emerald-50',
    accentText: 'text-emerald-700',
    catch: 'まず試したい方向け',
    savingText: '初期費用ゼロで即スタート',
    features: [
      '1店舗のみ',
      'ローカル保存（端末内のみ）',
      'レジ操作・メニュー管理',
      '売上履歴・CSV出力',
      '来客カウンター',
      '予算管理',
    ],
    useCases: [
      '前日までにメニュー登録だけ済ませたい時',
      '1台運用でシンプルに会計したい時',
      'まず当日運用を試してから有料化したい時',
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
    price: 300,
    period: '/月',
    color: 'border-blue-400',
    buttonColor: 'bg-blue-600',
    accentBg: 'bg-blue-50',
    accentText: 'text-blue-700',
    catch: '1店舗を本番運用するなら',
    savingText: '自動バックアップで安心運用',
    features: [
      '1店舗',
      'DB連携（クラウド保存）',
      'ログインコードで他端末アクセス',
      '全POS機能',
      'データバックアップ',
    ],
    useCases: [
      'レジ担当と受け渡し担当で端末を分けたい時',
      '端末故障時にデータを守りたい時',
      '学園祭期間中に複数日運用する時',
    ],
    limitations: [
      '複数店舗は管理不可',
      '本部ダッシュボード利用不可',
    ],
  },
  {
    key: 'organization' as const,
    name: '団体プラン',
    price: 600,
    period: '/月',
    color: 'border-purple-400',
    buttonColor: 'bg-purple-600',
    accentBg: 'bg-violet-50',
    accentText: 'text-violet-700',
    catch: '複数店舗の全体最適に',
    savingText: '2店舗で同額、3店舗以上で実質お得',
    features: [
      '複数店舗（無制限）',
      'DB連携（クラウド保存）',
      'ログインコードで他端末アクセス',
      '全POS機能',
      '本部ダッシュボード',
      '全店舗の売上集計・CSV一括出力',
      'プレゼンテーションモード',
    ],
    useCases: [
      '模擬店を2店舗以上まとめて管理したい時',
      '本部で売上速報を見ながら人員調整したい時',
      '閉会後に全店舗分の報告資料を一気に作る時',
    ],
    limitations: [],
  },
];

const compareRows = [
  { label: '月額', free: '0円', store: '300円', organization: '600円' },
  { label: '店舗数', free: '1店舗', store: '1店舗', organization: '無制限' },
  { label: 'クラウド保存', free: 'なし', store: 'あり', organization: 'あり' },
  { label: '他端末ログイン', free: 'なし', store: 'あり', organization: 'あり' },
  { label: '本部ダッシュボード', free: 'なし', store: 'なし', organization: 'あり' },
  { label: '全店舗CSV一括出力', free: 'なし', store: 'なし', organization: 'あり' },
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
        <Card className="bg-amber-50 border border-amber-200 p-4">
          <Text className="text-amber-800 text-base font-bold mb-1">プラン比較のポイント</Text>
          <Text className="text-amber-700 text-sm">
            団体プランは月600円で複数店舗対応。2店舗で店舗プラン合計と同額、3店舗以上なら実質お得です。
          </Text>
        </Card>

        <Card className="bg-white p-4 border border-gray-200">
          <Text className="text-gray-900 font-bold mb-3">ひと目で比較</Text>
          <View className="flex-row px-2 mb-2">
            <Text className="flex-[1.5] text-xs font-semibold text-gray-500">項目</Text>
            <Text className="flex-1 text-xs font-semibold text-gray-500 text-center">無料</Text>
            <Text className="flex-1 text-xs font-semibold text-gray-500 text-center">店舗</Text>
            <Text className="flex-1 text-xs font-semibold text-gray-500 text-center">団体</Text>
          </View>
          {compareRows.map((row) => (
            <View key={row.label} className="flex-row items-center border-t border-gray-100 py-2 px-2">
              <Text className="flex-[1.5] text-xs text-gray-700">{row.label}</Text>
              <Text className="flex-1 text-xs text-gray-800 text-center">{row.free}</Text>
              <Text className="flex-1 text-xs text-blue-700 text-center">{row.store}</Text>
              <Text className="flex-1 text-xs text-violet-700 text-center">{row.organization}</Text>
            </View>
          ))}
        </Card>

        {plans.map((p) => {
          const isCurrent = p.key === currentPlan;
          const monthlyLabel = p.price === 0 ? '0円' : `${p.price.toLocaleString()}円`;
          return (
            <Card
              key={p.key}
              className={`bg-white p-5 border-2 ${
                isCurrent ? p.color : 'border-gray-100'
              }`}
            >
              <View className="flex-row justify-between items-center mb-3">
                <View>
                  <Text className="text-lg font-bold text-gray-900">{p.name}</Text>
                  <Text className="text-xs text-gray-500 mt-0.5">{p.catch}</Text>
                </View>
                <View className="flex-row items-baseline">
                  <Text className="text-2xl font-bold text-gray-900">{monthlyLabel}</Text>
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

              {!isCurrent && (
                <View className={`${p.accentBg} rounded-lg px-3 py-2 mb-3`}>
                  <Text className={`${p.accentText} text-xs font-semibold`}>
                    {p.savingText}
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

              <View className="mb-3 bg-gray-50 rounded-lg px-3 py-2">
                <Text className="text-gray-800 text-xs font-semibold mb-1">こういう時に便利</Text>
                {p.useCases.map((item) => (
                  <Text key={item} className="text-gray-600 text-xs leading-5">
                    ・{item}
                  </Text>
                ))}
              </View>

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
