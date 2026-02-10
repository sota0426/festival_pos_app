import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { Header, Card } from '../common';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { savePendingVisitorCount, getPendingVisitorCounts } from '../../lib/storage';
import { alertNotify, alertConfirm, safeVibrate } from '../../lib/alertUtils';
import type { Branch, PendingVisitorCount, HalfHourlyVisitors } from '../../types/database';

interface VisitorCounterProps {
  branch: Branch;
  onBack: () => void;
}

export const VisitorCounter = ({ branch, onBack }: VisitorCounterProps) => {
  const [todayCount, setTodayCount] = useState(0);
  const [lastCountTime, setLastCountTime] = useState<string | null>(null);
  const [pendingCounts, setPendingCounts] = useState<PendingVisitorCount[]>([]);
  const [showTrend, setShowTrend] = useState(true);

  // Load today's count from local storage
  const loadTodayCount = useCallback(async () => {
    try {
      const allPendingCounts = await getPendingVisitorCounts();
      const today = new Date().toDateString();

      const todayCounts = allPendingCounts.filter((c) => {
        const countDate = new Date(c.timestamp).toDateString();
        return c.branch_id === branch.id && countDate === today;
      });

      setPendingCounts(todayCounts);

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

  // Compute half-hourly trend data
  const halfHourlyData = useMemo((): HalfHourlyVisitors[] => {
    const halfHourlyMap = new Map<string, number>();

    pendingCounts.forEach((v) => {
      const date = new Date(v.timestamp);
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const slot = minutes < 15 ? '00' : '15';
      const timeSlot = `${hours.toString().padStart(2, '0')}:${slot}`;
      const existing = halfHourlyMap.get(timeSlot) || 0;
      halfHourlyMap.set(timeSlot, existing + v.count);
    });

    return Array.from(halfHourlyMap.entries())
      .map(([time_slot, count]) => ({ time_slot, count }))
      .sort((a, b) => a.time_slot.localeCompare(b.time_slot));
  }, [pendingCounts]);

  const maxVisitorSlot = useMemo(() => {
    return halfHourlyData.length > 0
      ? Math.max(...halfHourlyData.map((h) => h.count))
      : 1;
  }, [halfHourlyData]);

  const handleCount = async (count: number = 1) => {
    const now = new Date().toISOString();
    const countId = Crypto.randomUUID();

    // Vibration feedback
    safeVibrate(50);

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
      setPendingCounts((prev) => [...prev, visitorCount]);

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
      alertNotify('エラー', 'カウントの保存に失敗しました');
    }
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

    // 15分単位に切り捨て
    const slotMinutes = Math.floor(minutes / 15) * 15;

    return `${hours.toString().padStart(2, '0')}:${slotMinutes
      .toString()
      .padStart(2, '0')}`;
  };


  return (
    <SafeAreaView className="flex-1 bg-purple-50" edges={['top']}>
      <Header
        title="来客カウンター"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
      />

      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
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
        <View className="items-center mb-6" style={{ minHeight: 280 }}>
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
            onPress={() => handleCount(-1)}
            className="flex-1 bg-gray-400 py-4 rounded-xl items-center"
            activeOpacity={0.8}
            disabled={todayCount <= 0}
          >
            <Text className="text-white text-2xl font-bold">-1</Text>
          </TouchableOpacity>
        </View>

        {/* Visitor Trend Toggle */}
        <TouchableOpacity
          onPress={() => setShowTrend(!showTrend)}
          className="bg-white rounded-xl p-3 mb-4 flex-row items-center justify-between"
        >
          <Text className="text-gray-700 font-semibold">本日の推移</Text>
          <Text className="text-gray-400">{showTrend ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showTrend && (
          <Card className="mb-4">
            {halfHourlyData.length > 0 ? (
              halfHourlyData.map((slot) => (
                <View
                  key={slot.time_slot}
                  className="flex-row items-center py-1.5 border-b border-gray-100"
                >
                  <Text className="w-14 text-gray-600 text-sm font-medium">
                    {slot.time_slot}
                  </Text>
                  <View className="flex-1 mx-2 h-5 bg-gray-100 rounded overflow-hidden">
                    <View
                      className="h-full bg-purple-500 rounded"
                      style={{
                        width: `${Math.min((slot.count / maxVisitorSlot) * 100, 100)}%`,
                      }}
                    />
                  </View>
                  <Text className="w-12 text-right text-gray-900 font-semibold">
                    {slot.count}人
                  </Text>
                </View>
              ))
            ) : (
              <Text className="text-gray-500 text-center py-4">
                まだデータがありません
              </Text>
            )}
          </Card>
        )}

        {/* Info */}
        <Card className="bg-purple-100">
          <Text className="text-purple-700 text-center text-sm">
            カウントは自動的に本部へ送信されます。{'\n'}
            15分毎の来場者数として集計されます。
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};
