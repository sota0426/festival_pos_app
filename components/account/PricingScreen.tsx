import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { Card } from '../common';
import type { PlanType } from '../../types/database';

interface PricingScreenProps {
  onBack: () => void;
}

type PaidPlanKey = 'store' | 'org_standard' | 'org_premium';
type PlanCardKey = 'free' | PaidPlanKey;
type CompareColumnKey = 'free' | 'store' | 'org';

const normalizePlanKey = (plan: PlanType): PlanCardKey => {
  if (plan === 'organization' || plan === 'org_light') return 'org_standard';
  return plan as PlanCardKey;
};

const plans: {
  key: PlanCardKey;
  name: string;
  price: number;
  period: string;
  color: string;
  buttonColor: string;
  accentBg: string;
  accentText: string;
  catch: string;
  savingText: string;
  features: string[];
  useCases: string[];
  limitations: string[];
}[] = [
  {
    key: 'free',
    name: '無料プラン',
    price: 0,
    period: '',
    color: 'border-emerald-400',
    buttonColor: 'bg-green-600',
    accentBg: 'bg-emerald-50',
    accentText: 'text-emerald-700',
    catch: '1デバイスで完全無料',
    savingText: '',
    features: [
      '1店舗のみ',
      '1デバイス運用',
      'ローカル保存（端末内のみ）',
      'レジ操作・メニュー管理',
      '売上履歴・CSV出力',
      '会計管理・在庫管理',
    ],
    useCases: [
      'まず無料で運用を始めたい時',
      '当日だけ1台で会計したい時',
      'ネット接続なしで使いたい時',
    ],
    limitations: [
      'DB連携なし',
      '他端末ログインなし',
      'Web版での店舗操作不可',
      '複数店舗は管理不可',
      '本部ダッシュボード利用不可',
    ],
  },
  {
    key: 'store',
    name: '店舗6か月パス',
    price: 200,
    period: '/6か月',
    color: 'border-blue-400',
    buttonColor: 'bg-blue-600',
    accentBg: 'bg-blue-50',
    accentText: 'text-blue-700',
    catch: '1店舗を複数デバイスで運用',
    savingText: '低価格でDB連携と複数端末運用に対応',
    features: [
      '店舗データは複数保存可（同時稼働は1店舗）',
      'DB連携（クラウド保存）',
      '複数デバイス運用',
      'Web版での店舗操作',
      'ログインコードで他端末アクセス',
      '全POS機能',
    ],
    useCases: [
      'レジ担当と受け渡し担当で端末を分けたい時',
      '端末故障時のデータ消失を防ぎたい時',
      'PCでも店舗操作したい時',
      'モバイルオーダー機能（客側の注文申請）を利用したい時',
    ],
    limitations: [
      '同時に稼働できる店舗は1つまで',
    ],
  },
  {
    key: 'org_standard',
    name: '団体スタンダード6か月パス',
    price: 500,
    period: '/6か月',
    color: 'border-purple-400',
    buttonColor: 'bg-purple-600',
    accentBg: 'bg-purple-50',
    accentText: 'text-purple-700',
    catch: '一般的な学校イベントに最適',
    savingText: '10店舗まで対応。中規模文化祭の標準構成',
    features: [
      '最大10店舗',
      'DB連携（クラウド保存）',
      'Web版での店舗操作',
      'ログインコードで他端末アクセス',
      '全POS機能',
      '本部ダッシュボード',
      '全店舗の売上集計・CSV一括出力',
    ],
    useCases: [
      '複数クラス・部活の模擬店をまとめて管理したい時',
      '本部で売上速報を見ながら人員調整したい時',
      '閉会後に全店舗分の報告資料を一気に作る時',
    ],
    limitations: [],
  },
  {
    key: 'org_premium',
    name: '団体プレミアム6か月パス',
    price: 1000,
    period: '/6か月',
    color: 'border-fuchsia-400',
    buttonColor: 'bg-fuchsia-600',
    accentBg: 'bg-fuchsia-50',
    accentText: 'text-fuchsia-700',
    catch: '大規模イベント向け',
    savingText: '30店舗まで対応。学園祭全体運営に余裕',
    features: [
      '最大30店舗',
      'DB連携（クラウド保存）',
      'Web版での店舗操作',
      'ログインコードで他端末アクセス',
      '全POS機能',
      '本部ダッシュボード',
      '全店舗の売上集計・CSV一括出力',
    ],
    useCases: [
      '大規模学園祭で多数店舗を横断管理したい時',
      '本部・各店舗で同時運用端末が多い時',
      '将来の店舗追加余地を持って運用したい時',
    ],
    limitations: [],
  },
];

const compareRows: ({ label: string } & Record<CompareColumnKey, string>)[] = [
  { label: '6か月料金', free: '0円', store: '200円', org: '500円 ~ 1,000円' },
  { label: '店舗数', free: '1店舗', store: '複数保存可（同時稼働1店舗）', org: '10 ~ 30店舗' },
  { label: 'クラウド保存', free: 'なし', store: 'あり', org: 'あり' },
  { label: 'Web版操作', free: 'なし', store: 'あり', org: 'あり' },
  { label: '他端末ログイン', free: 'なし', store: 'あり', org: 'あり' },
  { label: '本部ダッシュボード', free: 'なし', store: 'あり', org: 'あり' },
  { label: '全店舗一括出力', free: 'なし', store: 'なし', org: 'あり' },
];

export const PricingScreen = ({ onBack }: PricingScreenProps) => {
  const { plan: currentPlan, openCheckout } = useSubscription();
  const [loading, setLoading] = useState<string | null>(null);
  const [showOrgPlans, setShowOrgPlans] = useState<boolean>(true);
  const currentPlanKey = normalizePlanKey(currentPlan);
  const isPaidCurrent = currentPlanKey !== 'free';
  const basePlans = plans.filter((p) => p.key === 'free' || p.key === 'store');
  const orgPlans = plans.filter((p) => p.key !== 'free' && p.key !== 'store');
  const currentIsOrgPlan = currentPlanKey === 'org_standard' || currentPlanKey === 'org_premium';

  const handleSelectPlan = async (planKey: PaidPlanKey) => {
    if (planKey === currentPlanKey) return;
    try {
      setLoading(planKey);
      await openCheckout(planKey);
    } catch {
      // エラーはSubscriptionContextで処理
    } finally {
      setLoading(null);
    }
  };

  const renderPlanCard = (p: (typeof plans)[number], compact = false) => {
    const isCurrent = p.key === currentPlanKey;
    const isPaidPlanCard = p.key !== 'free';
    const isOrgPlanCard = p.key === 'org_standard' || p.key === 'org_premium';
    const orgStoreLimitFeature = p.features.find((feature) => feature.startsWith('最大'));
    const displayedFeatures =
      compact && isOrgPlanCard
        ? [orgStoreLimitFeature ?? '店舗数上限あり', '共通機能は上の「団体プラン共通でできること」を参照']
        : p.features;
    const monthlyLabel = p.price === 0 ? '0円' : `${p.price.toLocaleString()}円`;
    return (
      <Card
        key={p.key}
        className={`bg-white ${compact ? 'p-4' : 'p-5'} border-2 ${isCurrent ? p.color : 'border-gray-100'}`}
      >
        <View className="flex-row justify-between items-center mb-3">
          <View className="flex-1 pr-3">
            <Text className={`${compact ? 'text-base' : 'text-lg'} font-bold text-gray-900`}>{p.name}</Text>
            <Text className="text-xs text-gray-500 mt-0.5">{p.catch}</Text>
          </View>
          <View className="flex-row items-baseline">
            <Text className={`${compact ? 'text-xl' : 'text-2xl'} font-bold text-gray-900`}>{monthlyLabel}</Text>
            {p.period ? <Text className="text-gray-500 text-sm">{p.period}</Text> : null}
          </View>
        </View>

        {p.key === 'free' && (
          <View className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3 self-start">
            <Text className="text-emerald-700 text-xs font-semibold">広告なし・完全無料</Text>
          </View>
        )}

        {isCurrent && (
          <View className="bg-gray-100 rounded-lg px-3 py-1.5 mb-3 self-start">
            <Text className="text-gray-600 text-xs font-semibold">現在のプラン</Text>
          </View>
        )}

        <View className="gap-1.5 mb-3">
          {displayedFeatures.map((f) => (
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
            <Text key={item} className="text-gray-600 text-xs leading-5">・{item}</Text>
          ))}
        </View>

        {isPaidPlanCard && !isCurrent && (
          <TouchableOpacity
            onPress={() => handleSelectPlan(p.key as PaidPlanKey)}
            disabled={loading !== null}
            activeOpacity={0.8}
            className={`rounded-lg py-3 items-center mt-2 ${p.buttonColor}`}
          >
            <Text className="text-white font-bold">
              {loading === p.key ? '処理中...' : isPaidCurrent ? 'このプランを購入' : 'このプランに変更'}
            </Text>
          </TouchableOpacity>
        )}
      </Card>
    );
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
            無料プランは1デバイス専用です。1店舗で複数デバイス運用したい場合は「店舗6か月パス（200円）」を選べます。
          </Text>
          <Text className="text-amber-700 text-sm mt-2">
            一回払い（買い切り型）なので、サブスクのキャンセル忘れを心配せず使えます。文化祭シーズンをまたいだ準備・運用にも向いています。
          </Text>
        </Card>

        <Card className="bg-white p-4 border border-gray-200">
          <Text className="text-gray-900 font-bold mb-3">ひと目で比較</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View className="flex-row px-2 mb-2">
                <Text className="w-28 text-xs font-semibold text-gray-500">項目</Text>
                <Text className="w-20 text-xs font-semibold text-gray-500 text-center">無料</Text>
                <Text className="w-20 text-xs font-semibold text-blue-600 text-center">店舗</Text>
                <Text className="w-32 text-xs font-semibold text-violet-600 text-center">団体プラン</Text>
              </View>
              {compareRows.map((row) => (
                <View key={row.label} className="flex-row items-center border-t border-gray-100 py-2 px-2">
                  <Text className="w-28 text-xs text-gray-700">{row.label}</Text>
                  <Text className="w-20 text-xs text-gray-800 text-center">{row.free}</Text>
                  <Text className="w-20 text-xs text-blue-700 text-center">{row.store}</Text>
                  <Text className="w-32 text-xs text-violet-700 text-center">{row.org}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <Text className="text-[11px] text-gray-500 mt-2 px-2">団体プランの詳細は下の「団体6か月パス」から選択できます。</Text>
        </Card>

        <Card className="bg-sky-50 border border-sky-200 p-4">
          <Text className="text-sky-900 font-bold mb-1">DB連携の有料プランで使える機能（店舗/団体）</Text>
          <Text className="text-sky-800 text-xs leading-5">・QRコードによるモバイルオーダー（客側の注文申請）</Text>
          <Text className="text-sky-800 text-xs leading-5">・オーダーボード（提供ステータス管理）</Text>
          <Text className="text-sky-800 text-xs leading-5">・在庫確認（仕込み在庫）</Text>
        </Card>

        {basePlans.map((p) => renderPlanCard(p))}

        <Card className={`bg-white p-4 border-2 ${currentIsOrgPlan ? 'border-violet-400' : 'border-gray-100'}`}>
          <TouchableOpacity
            onPress={() => setShowOrgPlans((prev) => !prev)}
            activeOpacity={0.8}
            className="flex-row items-center justify-between"
          >
            <View className="flex-1 pr-3">
              <Text className="text-lg font-bold text-gray-900">団体6か月パス</Text>
              <Text className="text-xs text-gray-500 mt-1">
                500円〜 / 6か月（店舗数に応じて 10・30店舗から選択）
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-violet-700 text-xs font-semibold mb-1">
                {currentIsOrgPlan ? '現在契約中の種類あり' : '団体向け'}
              </Text>
              <Text className="text-violet-600 font-bold">{showOrgPlans ? '▲ 閉じる' : '▼ 選択肢を見る'}</Text>
            </View>
          </TouchableOpacity>

          <View className="mt-3 bg-violet-50 rounded-lg px-3 py-2">
            <Text className="text-violet-800 text-xs font-semibold">こんな時におすすめ</Text>
            <Text className="text-violet-700 text-xs mt-1 leading-5">
              複数の模擬店を本部でまとめて管理したい場合に、店舗数に合わせて無駄なく選べます。
            </Text>
          </View>

          <View className="mt-3 bg-gray-50 rounded-lg px-3 py-2">
            <Text className="text-gray-800 text-xs font-semibold mb-1">団体プラン共通でできること</Text>
            <Text className="text-gray-600 text-xs leading-5">・DB連携（クラウド保存）</Text>
            <Text className="text-gray-600 text-xs leading-5">・Web版での店舗操作</Text>
            <Text className="text-gray-600 text-xs leading-5">・ログインコードで他端末アクセス</Text>
            <Text className="text-gray-600 text-xs leading-5">・本部ダッシュボード / 全店舗集計 / 一括出力</Text>
            <Text className="text-gray-600 text-xs leading-5">・違いは「上限店舗数（10 / 30）」のみ</Text>
          </View>

          <View className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Text className="text-amber-800 text-xs font-semibold">団体プラン選択時のご案内</Text>
            <Text className="text-amber-700 text-xs mt-1 leading-5">
              6か月パスは一回払い（買い切り型）のため、アップグレード時の差額精算はありません。途中で店舗数が増える可能性がある場合は、少し多めの店舗数プランを選ぶと安心です。
            </Text>
          </View>

          {showOrgPlans && (
            <View className="gap-3 mt-4">
              {orgPlans.map((p) => renderPlanCard(p, true))}
            </View>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};
