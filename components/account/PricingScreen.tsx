import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSubscription } from '../../contexts/SubscriptionContext';
import type { PlanType } from '../../types/database';

interface PricingScreenProps {
  onBack: () => void;
}

type PaidPlanKey = 'store' | 'org_standard' | 'org_premium';
type PlanCardKey = 'free' | PaidPlanKey;

type PlanCard = {
  key: PlanCardKey;
  name: string;
  shortName: string;
  priceLabel: string;
  tone: {
    shell: string;
    border: string;
    accent: string;
    accentSoft: string;
    accentText: string;
    button: string;
    buttonText: string;
  };
  headline: string;
  convenienceBody: string[];
  canDo: string[];
  cannotDo: string[];
};

const normalizePlanKey = (plan: PlanType): PlanCardKey => {
  if (plan === 'organization' || plan === 'org_light') return 'org_standard';
  return plan as PlanCardKey;
};

const PLANS: PlanCard[] = [
  {
    key: 'free',
    name: '無料プラン',
    shortName: '無料',
    priceLabel: '0円',
    tone: {
      shell: 'bg-white',
      border: 'border-emerald-200',
      accent: 'bg-emerald-500',
      accentSoft: 'bg-emerald-50',
      accentText: 'text-emerald-800',
      button: 'bg-emerald-500',
      buttonText: 'text-white',
    },
    headline: 'まずは1台で、すぐ始めたい方向け',
    convenienceBody: [
      '1台だけで手早く始めたい',
      '費用をかけず当日運用したい',
    ],
    canDo: [
      '1店舗を1デバイスで運用',
      'レジ・メニュー管理・販売履歴・CSV出力',
      '会計管理・在庫管理',
      'ローカル保存でオフライン利用',
    ],
    cannotDo: [
      'クラウド保存',
      '複数デバイス運用',
      '本部ダッシュボード',
    ],
  },
  {
    key: 'store',
    name: '店舗プラン',
    shortName: '店舗',
    priceLabel: '200円 / 6か月',
    tone: {
      shell: 'bg-white',
      border: 'border-sky-200',
      accent: 'bg-sky-600',
      accentSoft: 'bg-sky-50',
      accentText: 'text-sky-800',
      button: 'bg-sky-600',
      buttonText: 'text-white',
    },
    headline: '1店舗を複数人・複数端末で運用したい方向け',
    convenienceBody: [
      '複数の端末で使用したい',
      'スマホだけでなく、PCでも操作したい',
    ],
    canDo: [
      'クラウド保存（自動同期）',
      '複数端末で同時運用',
      'Web版での店舗操作',
      'モバイルオーダーなど共有機能',
    ],
    cannotDo: [
      '本部ダッシュボード',
      '全店舗一括集計',
      '複数店舗の同時管理',
    ],
  },
  {
    key: 'org_standard',
    name: '団体スタンダード10店舗',
    shortName: '団体10',
    priceLabel: '500円 / 6か月',
    tone: {
      shell: 'bg-white',
      border: 'border-amber-200',
      accent: 'bg-amber-500',
      accentSoft: 'bg-amber-50',
      accentText: 'text-amber-900',
      button: 'bg-amber-500',
      buttonText: 'text-white',
    },
    headline: '複数店舗をまとめて見たい、小規模イベント向け',
    convenienceBody: [
      '本部で全店舗をまとめて見たい',
      '売上速報を見て動きを調整したい',
    ],
    canDo: [
      '最大10店舗の運用',
      '本部ダッシュボード',
      '全店舗の売上集計と一括CSV出力',
      '各店舗のクラウド保存・複数端末運用',
    ],
    cannotDo: [
      '10店舗を超える大規模運用',
    ],
  },
  {
    key: 'org_premium',
    name: '団体プレミアム30店舗',
    shortName: '団体30',
    priceLabel: '1,000円 / 6か月',
    tone: {
      shell: 'bg-white',
      border: 'border-rose-200',
      accent: 'bg-rose-500',
      accentSoft: 'bg-rose-50',
      accentText: 'text-rose-900',
      button: 'bg-rose-500',
      buttonText: 'text-white',
    },
    headline: '店舗数の多い大規模イベントで運用したい方向け',
    convenienceBody: [
      '店舗追加が起きそう',
      '本部も各店舗も端末数が多い',
    ],
    canDo: [
      '最大30店舗の運用',
      '本部ダッシュボード',
      '全店舗の売上集計と一括CSV出力',
      '各店舗のクラウド保存・複数端末運用',
    ],
    cannotDo: [],
  },
];

export const PricingScreen = ({ onBack }: PricingScreenProps) => {
  const { plan: currentPlan, openCheckout } = useSubscription();
  const [loading, setLoading] = useState<PaidPlanKey | null>(null);
  const currentPlanKey = normalizePlanKey(currentPlan);
  const initialIndex = Math.max(PLANS.findIndex((plan) => plan.key === currentPlanKey), 0);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<PlanCard> | null>(null);
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(width - 40, 280);

  useEffect(() => {
    const nextIndex = Math.max(PLANS.findIndex((plan) => plan.key === currentPlanKey), 0);
    setSelectedIndex(nextIndex);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: nextIndex, animated: false });
    });
  }, [currentPlanKey]);

  const selectedPlan = PLANS[selectedIndex] ?? PLANS[0];
  const isCurrent = selectedPlan.key === currentPlanKey;

  const actionLabel = useMemo(() => {
    if (selectedPlan.key === 'free') {
      return currentPlanKey === 'free' ? '現在のプランです' : '無料プランを利用中';
    }
    if (isCurrent) return '現在のプランです';
    if (currentPlanKey === 'free') return 'このプランに変更';
    return 'このプランを購入';
  }, [currentPlanKey, isCurrent, selectedPlan.key]);

  const handleSelectPlan = async () => {
    if (selectedPlan.key === 'free' || isCurrent) return;
    try {
      setLoading(selectedPlan.key);
      await openCheckout(selectedPlan.key);
    } finally {
      setLoading(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-100">
      <View className="px-5 pt-3 pb-3 border-b border-stone-200 bg-stone-100">
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} className="self-start px-1 py-2">
          <Text className="text-sky-700 text-sm font-semibold">戻る</Text>
        </TouchableOpacity>
        <Text className="text-3xl font-black text-stone-900 mt-1">料金プラン</Text>
      </View>

      <View className="flex-1 justify-center">
        <FlatList
          ref={listRef}
          data={PLANS}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          snapToInterval={cardWidth}
          snapToAlignment="center"
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: cardWidth, offset: cardWidth * index, index })}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / cardWidth);
            setSelectedIndex(Math.max(0, Math.min(nextIndex, PLANS.length - 1)));
          }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 8 }}
          renderItem={({ item }) => {
            const planIsCurrent = item.key === currentPlanKey;

            return (
              <View style={{ width: cardWidth }}>
                <View className={`rounded-[28px] border-2 ${item.tone.border} ${item.tone.shell} overflow-hidden`}>
                  <View className={`${item.tone.accent} px-5 pt-4 pb-3`}>
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-3">
                        <Text className="text-white/80 text-xs font-bold tracking-wide">{item.shortName}</Text>
                        <Text className="text-white text-[28px] font-black mt-1">{item.name}</Text>
                      </View>
                      {planIsCurrent ? (
                        <View className="rounded-full bg-white/20 px-3 py-1">
                          <Text className="text-white text-[11px] font-bold">利用中</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-white text-[34px] font-black mt-3">{item.priceLabel}</Text>
                  </View>

                  <View className="px-4 pt-4 pb-4">
                    <View className={`rounded-2xl ${item.tone.accentSoft} px-4 py-3 mb-3`}>
                      <Text className={`text-[11px] font-bold tracking-wide ${item.tone.accentText}`}>向いている使い方</Text>
                      <Text className={`mt-1 text-[15px] leading-5 font-bold ${item.tone.accentText}`}>{item.headline}</Text>
                      <View className="mt-2">
                        {item.convenienceBody.map((line) => (
                          <View key={line} className="flex-row items-start mt-1.5">
                            <View className={`mt-1 mr-2 h-2 w-2 rounded-full ${item.tone.accent}`} />
                            <Text className={`flex-1 text-[12px] leading-4 ${item.tone.accentText}`}>{line}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    <View className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 mb-3">
                      <Text className="text-sm font-bold text-stone-900">できること</Text>
                      {item.canDo.map((line) => (
                        <View key={line} className="flex-row items-start mt-2">
                          <View className={`mt-1 mr-2 h-2.5 w-2.5 rounded-full ${item.tone.accent}`} />
                          <Text className="flex-1 text-[13px] leading-5 text-stone-700">{line}</Text>
                        </View>
                      ))}
                    </View>

                    <View className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                      <Text className="text-sm font-bold text-stone-900">できないこと</Text>
                      {item.cannotDo.length === 0 ? (
                        <Text className="mt-2 text-[13px] leading-5 text-stone-500">
                          大きな制限はありません。店舗数の上限だけ確認すれば運用しやすいプランです。
                        </Text>
                      ) : (
                        item.cannotDo.map((line) => (
                          <View key={line} className="flex-row items-start mt-2">
                            <View className="mt-1 mr-2 h-2.5 w-2.5 rounded-full bg-stone-300" />
                            <Text className="flex-1 text-[13px] leading-5 text-stone-500">{line}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                </View>
              </View>
            );
          }}
        />

        <View className="px-5 pt-1 pb-2">
          <View className="flex-row items-center justify-center gap-2">
            {PLANS.map((plan, index) => (
              <View
                key={plan.key}
                className={`rounded-full ${
                  index === selectedIndex ? 'bg-stone-900 w-6 h-2.5' : 'bg-stone-300 w-2.5 h-2.5'
                }`}
              />
            ))}
          </View>
        </View>
      </View>

      <View className="border-t border-stone-200 bg-white px-5 pt-3 pb-4">
        <Text className="text-xs font-bold text-stone-500">選択中</Text>
        <Text className="text-base font-bold text-stone-900 mt-1">{selectedPlan.name}</Text>
        <TouchableOpacity
          onPress={handleSelectPlan}
          disabled={selectedPlan.key === 'free' || isCurrent || loading !== null}
          activeOpacity={0.85}
          className={`mt-3 rounded-2xl py-3.5 items-center ${
            selectedPlan.key === 'free' || isCurrent || loading !== null ? 'bg-stone-200' : selectedPlan.tone.button
          }`}
        >
          <Text
            className={`font-bold text-base ${
              selectedPlan.key === 'free' || isCurrent || loading !== null ? 'text-stone-500' : selectedPlan.tone.buttonText
            }`}
          >
            {loading === selectedPlan.key ? '処理中...' : actionLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
