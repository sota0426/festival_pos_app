import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { Card } from '../common';
import type { PlanType } from '../../types/database';

interface PricingScreenProps {
  onBack: () => void;
}

type PaidPlanKey = 'store' | 'org_light' | 'org_standard' | 'org_premium';
type PlanCardKey = 'free' | PaidPlanKey;
type CompareColumnKey = 'free' | 'store' | 'org';

const normalizePlanKey = (plan: PlanType): PlanCardKey => (
  plan === 'organization' ? 'org_standard' : (plan as PlanCardKey)
);

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
      '会計管理',
    ],
    useCases: [
      '前日までにメニュー登録だけ済ませたい時',
      '1台運用でシンプルに会計したい時',
      'まず当日運用を試してから有料化したい時',
    ],
    limitations: [
      'DB連携なし',
      '他端末からのアクセス不可',
      'Web版での店舗操作は不可（スマホ/タブレット向け）',
      '本部ダッシュボード利用不可',
    ],
  },
  {
    key: 'store' as const,
    name: '店舗3か月パス',
    price: 300,
    period: '/3か月',
    color: 'border-blue-400',
    buttonColor: 'bg-blue-600',
    accentBg: 'bg-blue-50',
    accentText: 'text-blue-700',
    catch: '1店舗を本番運用するなら',
    savingText: '自動バックアップで安心運用',
    features: [
      '最大1店舗',
      'DB連携（クラウド保存）',
      'Web版での店舗操作',
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
    key: 'org_light' as const,
    name: '団体ライト3か月パス',
    price: 600,
    period: '/3か月',
    color: 'border-violet-400',
    buttonColor: 'bg-violet-600',
    accentBg: 'bg-violet-50',
    accentText: 'text-violet-700',
    catch: '小規模な団体運用向け',
    savingText: '3店舗までを低コストでまとめて管理',
    features: [
      '最大3店舗',
      'DB連携（クラウド保存）',
      'Web版での店舗操作',
      'ログインコードで他端末アクセス',
      '全POS機能',
      '本部ダッシュボード',
      '全店舗の売上集計・CSV一括出力',
      'プレゼンテーションモード',
    ],
    useCases: [
      '模擬店を2〜3店舗まとめて管理したい時',
      '小規模な文化祭で本部画面も使いたい時',
      '費用を抑えつつ店舗横断で集計したい時',
    ],
    limitations: [],
  },
  {
    key: 'org_standard' as const,
    name: '団体スタンダード3か月パス',
    price: 1200,
    period: '/3か月',
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
      'プレゼンテーションモード',
    ],
    useCases: [
      '複数クラス・部活の模擬店をまとめて管理したい時',
      '本部で売上速報を見ながら人員調整したい時',
      '閉会後に全店舗分の報告資料を一気に作る時',
    ],
    limitations: [],
  },
  {
    key: 'org_premium' as const,
    name: '団体プレミアム3か月パス',
    price: 2400,
    period: '/3か月',
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
      'プレゼンテーションモード',
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
  { label: '3か月料金', free: '0円', store: '300円', org: '600円〜2,400円' },
  { label: '店舗数', free: '1店舗', store: '1店舗', org: '3〜30店舗' },
  { label: 'クラウド保存', free: 'なし', store: 'あり', org: 'あり' },
  { label: 'Web版操作', free: 'なし', store: 'あり', org: 'あり' },
  { label: '他端末ログイン', free: 'なし', store: 'あり', org: 'あり' },
  { label: '本部ダッシュボード', free: 'なし', store: 'なし', org: 'あり' },
  { label: '全店舗一括出力', free: 'なし', store: 'なし', org: 'あり' },
];

export const PricingScreen = ({ onBack }: PricingScreenProps) => {
  const { plan: currentPlan, openCheckout, openPortal, isFreePlan } = useSubscription();
  const [loading, setLoading] = useState<string | null>(null);
  const [showOrgPlans, setShowOrgPlans] = useState<boolean>(true);
  const currentPlanKey = normalizePlanKey(currentPlan);
  const isPaidCurrent = currentPlan !== 'free';
  const basePlans = plans.filter((p) => p.key === 'free' || p.key === 'store');
  const orgPlans = plans.filter((p) => p.key !== 'free' && p.key !== 'store');
  const currentIsOrgPlan = currentPlanKey === 'org_light' || currentPlanKey === 'org_standard' || currentPlanKey === 'org_premium';

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
            <Text className="text-emerald-700 text-xs font-semibold">
              無料プランはスマホ / タブレット向け
            </Text>
          </View>
        )}

        {isCurrent && (
          <View className="bg-gray-100 rounded-lg px-3 py-1.5 mb-3 self-start">
            <Text className="text-gray-600 text-xs font-semibold">現在のプラン</Text>
          </View>
        )}

        {!isCurrent && (
          <View className={`${p.accentBg} rounded-lg px-3 py-2 mb-3`}>
            <Text className={`${p.accentText} text-xs font-semibold`}>{p.savingText}</Text>
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
            すべて3か月利用パスです。団体プランは店舗数に応じて選べる段階制なので、運用規模に合わせて無駄なく選べます。
          </Text>
          <Text className="text-amber-700 text-sm mt-2">
            一回払い（買い切り型）なので、サブスクのキャンセル忘れを心配せず使えます。文化祭シーズンだけ使いたい運用に向いています。
          </Text>
        </Card>

        <Card className="bg-white p-4 border border-gray-200">
          <Text className="text-gray-900 font-bold mb-3">ひと目で比較</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View className="flex-row px-2 mb-2">
                <Text className="w-28 text-xs font-semibold text-gray-500">項目</Text>
                <Text className="w-20 text-xs font-semibold text-gray-500 text-center">無料</Text>
                <Text className="w-20 text-xs font-semibold text-gray-500 text-center">店舗</Text>
                <Text className="w-32 text-xs font-semibold text-violet-600 text-center">団体（段階制）</Text>
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
          <Text className="text-[11px] text-gray-500 mt-2 px-2">
            団体プランの詳細（ライト / スタンダード / プレミアム）は下の「団体3か月パス」から選択できます。
          </Text>
        </Card>

        {basePlans.map((p) => renderPlanCard(p))}

        <Card className={`bg-white p-4 border-2 ${currentIsOrgPlan ? 'border-violet-400' : 'border-gray-100'}`}>
          <TouchableOpacity
            onPress={() => setShowOrgPlans((prev) => !prev)}
            activeOpacity={0.8}
            className="flex-row items-center justify-between"
          >
            <View className="flex-1 pr-3">
              <Text className="text-lg font-bold text-gray-900">団体3か月パス</Text>
              <Text className="text-xs text-gray-500 mt-1">
                600円〜 / 3か月（店舗数に応じて 3・10・30店舗から選択）
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

          <View className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Text className="text-amber-800 text-xs font-semibold">団体プラン選択時のご案内</Text>
            <Text className="text-amber-700 text-xs mt-1 leading-5">
              3か月パスは一回払い（買い切り型）のため、アップグレード時の差額精算はありません。途中で店舗数が増える可能性がある場合は、少し多めの店舗数プランを選ぶと安心です。
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
