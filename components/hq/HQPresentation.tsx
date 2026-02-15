import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Header } from '../common';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

interface HQPresentationProps {
  onBack: () => void;
}

type RankCategory = 'sales' | 'profit' | 'avg_order' | 'visitors';

type RankRow = {
  branch_code: string;
  branch_name: string;
  value: number;
};

const CATEGORY_LABELS: Record<RankCategory, string> = {
  sales: '売上ランキング',
  profit: '利益ランキング',
  avg_order: '客単価ランキング',
  visitors: '来場者ランキング',
};

const CATEGORY_ICONS: Record<RankCategory, string> = {
  sales: '💰',
  profit: '📈',
  avg_order: '🧾',
  visitors: '🎪',
};

const formatValue = (category: RankCategory, value: number): string => {
  if (category === 'visitors') return `${value.toLocaleString()}人`;
  return `¥${value.toLocaleString()}`;
};

// 順位 → 店舗名 → 数値 の3段階表示
type RevealPhase = 'rank_label' | 'branch_reveal' | 'value_reveal';

export const HQPresentation = ({ onBack }: HQPresentationProps) => {
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<RankCategory>('sales');
  const [stage, setStage] = useState<'select' | 'rank3' | 'rank2' | 'rank1'>('select');
  const [revealPhase, setRevealPhase] = useState<RevealPhase>('rank_label');
  const [rows, setRows] = useState<RankRow[]>([]);

  const rankLabelAnim = useRef(new Animated.Value(0)).current;
  const rankLabelScale = useRef(new Animated.Value(0.3)).current;
  const branchAnim = useRef(new Animated.Value(0)).current;
  const branchSlide = useRef(new Animated.Value(60)).current;
  const valueAnim = useRef(new Animated.Value(0)).current;
  const valueScale = useRef(new Animated.Value(0.5)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const crownBounce = useRef(new Animated.Value(0)).current;

  const animateRankLabel = useCallback(() => {
    rankLabelAnim.setValue(0);
    rankLabelScale.setValue(0.3);
    glowAnim.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(rankLabelAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.spring(rankLabelScale, {
          toValue: 1,
          friction: 4,
          tension: 60,
          useNativeDriver: true,
        }),
      ]),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    ]).start();
  }, [rankLabelAnim, rankLabelScale, glowAnim]);

  const animateBranchReveal = useCallback(() => {
    branchAnim.setValue(0);
    branchSlide.setValue(60);

    Animated.parallel([
      Animated.timing(branchAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(branchSlide, {
        toValue: 0,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [branchAnim, branchSlide]);

  const animateValueReveal = useCallback(() => {
    valueAnim.setValue(0);
    valueScale.setValue(0.5);
    crownBounce.setValue(0);

    Animated.parallel([
      Animated.timing(valueAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(valueScale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(crownBounce, {
            toValue: -8,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(crownBounce, {
            toValue: 0,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    ]).start();
  }, [valueAnim, valueScale, crownBounce]);

  const loadRanking = useCallback(async () => {
    setLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        setRows([
          { branch_code: 'S001', branch_name: '焼きそば屋', value: 65000 },
          { branch_code: 'S002', branch_name: 'たこ焼き屋', value: 60000 },
          { branch_code: 'S003', branch_name: 'クレープ屋', value: 42000 },
        ]);
        return;
      }

      const [{ data: branches }, { data: tx }, { data: expenses }, { data: visitors }] = await Promise.all([
        supabase.from('branches').select('id,branch_code,branch_name').order('branch_code', { ascending: true }),
        supabase.from('transactions').select('branch_id,total_amount').eq('status', 'completed'),
        supabase.from('budget_expenses').select('branch_id,amount'),
        supabase.from('visitor_counts').select('branch_id,count'),
      ]);

      const branchList = branches ?? [];
      const txList = tx ?? [];
      const expenseList = expenses ?? [];
      const visitorList = visitors ?? [];

      const ranking = branchList
        .map((branch) => {
          const totalSales = txList.filter((t) => t.branch_id === branch.id).reduce((sum, t) => sum + (t.total_amount ?? 0), 0);
          const txCount = txList.filter((t) => t.branch_id === branch.id).length;
          const totalExpense = expenseList
            .filter((e) => e.branch_id === branch.id)
            .reduce((sum, e) => sum + (e.amount ?? 0), 0);
          const totalVisitors = visitorList
            .filter((v) => v.branch_id === branch.id)
            .reduce((sum, v) => sum + (v.count ?? 0), 0);

          let value = totalSales;
          if (category === 'profit') value = totalSales - totalExpense;
          if (category === 'avg_order') value = txCount > 0 ? Math.round(totalSales / txCount) : 0;
          if (category === 'visitors') value = totalVisitors;

          return {
            branch_code: branch.branch_code,
            branch_name: branch.branch_name,
            value,
          };
        })
        .sort((a, b) => b.value - a.value);

      setRows(ranking);
    } finally {
      setLoading(false);
    }
  }, [category]);

  const podiumRows = useMemo(() => {
    const top = rows.slice(0, 3);
    return {
      third: top[2] ?? null,
      second: top[1] ?? null,
      first: top[0] ?? null,
    };
  }, [rows]);

  const handleStart = async () => {
    await loadRanking();
    setStage('rank3');
    setRevealPhase('rank_label');
    animateRankLabel();
  };

  const handleNext = () => {
    if (revealPhase === 'rank_label') {
      setRevealPhase('branch_reveal');
      animateBranchReveal();
      return;
    }
    if (revealPhase === 'branch_reveal') {
      setRevealPhase('value_reveal');
      animateValueReveal();
      return;
    }
    // value_reveal → 次の順位 or 最初へ
    if (stage === 'rank3') {
      setStage('rank2');
      setRevealPhase('rank_label');
      animateRankLabel();
    } else if (stage === 'rank2') {
      setStage('rank1');
      setRevealPhase('rank_label');
      animateRankLabel();
    } else if (stage === 'rank1') {
      setStage('select');
      setRevealPhase('rank_label');
    }
  };

  const stageLabel =
    stage === 'rank3' ? '第3位' : stage === 'rank2' ? '第2位' : stage === 'rank1' ? '第1位' : '';
  const stageRow =
    stage === 'rank3' ? podiumRows.third : stage === 'rank2' ? podiumRows.second : stage === 'rank1' ? podiumRows.first : null;

  const rankMedal = stage === 'rank1' ? '👑' : stage === 'rank2' ? '🥈' : '🥉';

  const bgGradientColors = stage === 'rank1'
    ? { outer: '#1a1a2e', inner: '#44337a' }
    : stage === 'rank2'
    ? { outer: '#1a1a2e', inner: '#1e3a5f' }
    : { outer: '#1a1a2e', inner: '#2d2d2d' };

  const rankAccentColor = stage === 'rank1' ? '#FFD700' : stage === 'rank2' ? '#C0C0C0' : '#CD7F32';

  const nextButtonLabel = () => {
    if (revealPhase === 'rank_label') return 'この店舗は...？';
    if (revealPhase === 'branch_reveal') return '記録を発表！';
    if (stage === 'rank1') return 'もう一度最初から';
    return '次の順位へ';
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#0f0f23' }} edges={['top']}>
      <Header
        title="プレゼンテーション"
        subtitle="ランキング発表モード"
        showBack
        onBack={onBack}
      />
      <View className="flex-1 px-6 pb-6">
        {stage === 'select' && (
          <View className="flex-1 justify-center">
            <View className="items-center mb-8">
              <Text style={{ fontSize: 48 }}>🏆</Text>
              <Text className="text-3xl font-black text-white mt-2">ランキング発表</Text>
              <Text className="text-base text-gray-400 mt-1">
                会場向けに3位→2位→1位を順に発表します
              </Text>
            </View>

            <View className="gap-3 mb-8">
              {(Object.keys(CATEGORY_LABELS) as RankCategory[]).map((key) => (
                <TouchableOpacity
                  key={key}
                  activeOpacity={0.8}
                  onPress={() => setCategory(key)}
                  style={
                    category === key
                      ? { backgroundColor: '#7c3aed', borderColor: '#a78bfa', borderWidth: 2, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16 }
                      : { backgroundColor: '#1e1e3a', borderColor: '#333366', borderWidth: 1, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16 }
                  }
                >
                  <View className="flex-row items-center justify-center">
                    <Text style={{ fontSize: 20, marginRight: 8 }}>{CATEGORY_ICONS[key]}</Text>
                    <Text
                      className="font-bold text-lg"
                      style={{ color: category === key ? '#ffffff' : '#a0a0c0' }}
                    >
                      {CATEGORY_LABELS[key]}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleStart}
              disabled={loading}
              style={{
                backgroundColor: '#7c3aed',
                borderRadius: 16,
                paddingVertical: 18,
                opacity: loading ? 0.6 : 1,
              }}
            >
              <Text className="text-center text-white text-xl font-black">
                {loading ? '準備中...' : '🎬 発表スタート'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {stage !== 'select' && (
          <View className="flex-1 justify-center items-center">
            {/* カテゴリ表示 */}
            <View className="mb-4">
              <Text className="text-base font-semibold text-center" style={{ color: '#8888bb' }}>
                {CATEGORY_ICONS[category]} {CATEGORY_LABELS[category]}
              </Text>
            </View>

            {/* 順位ラベル（常に表示、phase: rank_label で大きくアニメーション） */}
            <Animated.View
              style={{
                opacity: rankLabelAnim,
                transform: [{ scale: rankLabelScale }],
                marginBottom: 24,
              }}
            >
              <Text style={{ fontSize: 60, textAlign: 'center' }}>{rankMedal}</Text>
              <Animated.Text
                style={{
                  fontSize: stage === 'rank1' ? 72 : 56,
                  fontWeight: '900',
                  textAlign: 'center',
                  color: rankAccentColor,
                  textShadowColor: rankAccentColor,
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 20,
                  opacity: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.85, 1],
                  }),
                }}
              >
                {stageLabel}
              </Animated.Text>
            </Animated.View>

            {/* 店舗名（phase: branch_reveal 以降で表示） */}
            {(revealPhase === 'branch_reveal' || revealPhase === 'value_reveal') && (
              <Animated.View
                style={{
                  opacity: branchAnim,
                  transform: [{ translateY: branchSlide }],
                  width: '100%',
                  marginBottom: 16,
                }}
              >
                <View
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    borderRadius: 20,
                    borderWidth: 2,
                    borderColor: rankAccentColor + '66',
                    paddingVertical: 24,
                    paddingHorizontal: 16,
                  }}
                >
                  <Text
                    className="text-center font-bold"
                    style={{ fontSize: 18, color: '#aaaacc', marginBottom: 4 }}
                  >
                    {stageRow?.branch_code ?? '-'}
                  </Text>
                  <Text
                    className="text-center font-black"
                    style={{ fontSize: 36, color: '#ffffff', lineHeight: 44 }}
                  >
                    {stageRow?.branch_name ?? 'データなし'}
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* 数値（phase: value_reveal で表示） */}
            {revealPhase === 'value_reveal' && (
              <Animated.View
                style={{
                  opacity: valueAnim,
                  transform: [{ scale: valueScale }],
                }}
              >
                <View
                  style={{
                    backgroundColor: rankAccentColor,
                    borderRadius: 16,
                    paddingVertical: 16,
                    paddingHorizontal: 32,
                    minWidth: 200,
                  }}
                >
                  <Text
                    className="text-center font-black"
                    style={{ fontSize: 32, color: '#1a1a2e' }}
                  >
                    {formatValue(category, stageRow?.value ?? 0)}
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* 操作ボタン */}
            <View className="mt-10 w-full" style={{ maxWidth: 320 }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleNext}
                style={{
                  backgroundColor:
                    revealPhase === 'value_reveal' && stage === 'rank1'
                      ? '#16a34a'
                      : revealPhase === 'branch_reveal'
                      ? '#dc2626'
                      : '#7c3aed',
                  borderRadius: 16,
                  paddingVertical: 16,
                }}
              >
                <Text className="text-center text-white text-lg font-black">
                  {nextButtonLabel()}
                </Text>
              </TouchableOpacity>
            </View>

            {/* 進行インジケーター */}
            <View className="flex-row items-center mt-6" style={{ gap: 8 }}>
              {(['rank3', 'rank2', 'rank1'] as const).map((s) => (
                <View
                  key={s}
                  style={{
                    width: stage === s ? 28 : 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: stage === s ? rankAccentColor : '#333355',
                  }}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};
