import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Alert, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';
import { Button, Header, Card } from '../common';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { savePendingVisitorCount, getPendingVisitorCounts } from '../../lib/storage';
import type { Branch, PendingVisitorCount } from '../../types/database';

interface VisitorCounterProps {
  branch: Branch;
  onBack: () => void;
}

export const VisitorCounter = ({ branch, onBack }: VisitorCounterProps) => {
  const [todayCount, setTodayCount] = useState(0);
  const [lastCountTime, setLastCountTime] = useState<string | null>(null);

  // Load today's count from local storage
  const loadTodayCount = useCallback(async () => {
    try {
      const pendingCounts = await getPendingVisitorCounts();
      const today = new Date().toDateString();

      const todayCounts = pendingCounts.filter((c) => {
        const countDate = new Date(c.timestamp).toDateString();
        return c.branch_id === branch.id && countDate === today;
      });

      const total = todayCounts.reduce((sum, c) => sum + c.count, 0);
      setTodayCount(total);

      if (todayCounts.length > 0) {
        const lastCount = todayCounts[todayCounts.length - 1];
        setLastCountTime(lastCount.timestamp);
      }
    } catch (error) {
      console.error('Error loading today count:', error);
    }
  }, [branch.id]);

  useEffect(() => {
    loadTodayCount();
  }, [loadTodayCount]);

  const handleCount = async (count: number = 1) => {
    const now = new Date().toISOString();
    const countId = uuidv4();

    // Vibration feedback
    Vibration.vibrate(50);

    // Create pending visitor count
    const visitorCount: PendingVisitorCount = {
      id: countId,
      branch_id: branch.id,
      count: count,
      timestamp: now,
      synced: false,
    };

    try {
      // Save locally first
      await savePendingVisitorCount(visitorCount);
      setTodayCount((prev) => prev + count);
      setLastCountTime(now);

      // Try to sync with Supabase
      if (isSupabaseConfigured()) {
        try {
          const { error } = await supabase.from('visitor_counts').insert({
            id: countId,
            branch_id: branch.id,
            count: count,
            timestamp: now,
          });

          if (error) throw error;
        } catch (syncError) {
          console.log('Visitor count sync failed, will retry later:', syncError);
        }
      }
    } catch (error) {
      console.error('Error saving visitor count:', error);
      Alert.alert('エラー', 'カウントの保存に失敗しました');
    }
  };

  const handleUndo = async () => {
    if (todayCount <= 0) return;

    Alert.alert('確認', '1人分取り消しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '取消',
        style: 'destructive',
        onPress: () => handleCount(-1),
      },
    ]);
  };

  const formatTime = (isoString: string | null): string => {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const getCurrentTimeSlot = (): string => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const slot = minutes < 30 ? '00' : '30';
    return `${hours.toString().padStart(2, '0')}:${slot}`;
  };

  return (
    <SafeAreaView className="flex-1 bg-purple-50" edges={['top']}>
      <Header
        title="来客カウンター"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
      />

      <View className="flex-1 p-4">
        {/* Stats */}
        <View className="flex-row gap-4 mb-6">
          <Card className="flex-1 items-center py-4">
            <Text className="text-gray-500 text-sm">本日の来客数</Text>
            <Text className="text-4xl font-bold text-purple-600">{todayCount}</Text>
            <Text className="text-gray-400 text-xs">人</Text>
          </Card>
          <Card className="flex-1 items-center py-4">
            <Text className="text-gray-500 text-sm">現在の時間帯</Text>
            <Text className="text-2xl font-bold text-gray-700">{getCurrentTimeSlot()}</Text>
            <Text className="text-gray-400 text-xs">最終: {formatTime(lastCountTime)}</Text>
          </Card>
        </View>

        {/* Main Counter Button */}
        <View className="flex-1 justify-center items-center">
          <TouchableOpacity
            onPress={() => handleCount(1)}
            activeOpacity={0.8}
            className="w-64 h-64 bg-purple-600 rounded-full items-center justify-center shadow-lg"
            style={{
              shadowColor: '#7c3aed',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4,
              shadowRadius: 16,
              elevation: 12,
            }}
          >
            <Text className="text-white text-8xl font-bold">+1</Text>
            <Text className="text-purple-200 text-xl mt-2">タップでカウント</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Add Buttons */}
        <View className="flex-row gap-3 mb-4">
          <TouchableOpacity
            onPress={() => handleCount(5)}
            className="flex-1 bg-purple-500 py-4 rounded-xl items-center"
            activeOpacity={0.8}
          >
            <Text className="text-white text-2xl font-bold">+5</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleCount(10)}
            className="flex-1 bg-purple-500 py-4 rounded-xl items-center"
            activeOpacity={0.8}
          >
            <Text className="text-white text-2xl font-bold">+10</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleUndo}
            className="flex-1 bg-gray-400 py-4 rounded-xl items-center"
            activeOpacity={0.8}
            disabled={todayCount <= 0}
          >
            <Text className="text-white text-2xl font-bold">-1</Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <Card className="bg-purple-100">
          <Text className="text-purple-700 text-center text-sm">
            カウントは自動的に本部へ送信されます。{'\n'}
            30分毎の来場者数として集計されます。
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  );
};
