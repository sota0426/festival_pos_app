import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { alertNotify, safeVibrate } from 'lib/alertUtils';
import { getPendingVisitorCounts, savePendingVisitorCount } from 'lib/storage';
import { isSupabaseConfigured, supabase } from 'lib/supabase';
import { HalfHourlyVisitors, PendingVisitorCount } from 'types/database';

export const useVisitorCounter = (branchId: string) => {
  const [todayCount, setTodayCount] = useState(0);
  const [lastCountTime, setLastCountTime] = useState<string | null>(null);
  const [pendingCounts, setPendingCounts] = useState<PendingVisitorCount[]>([]);

  const loadTodayCount = useCallback(async () => {
    const all = await getPendingVisitorCounts();
    const today = new Date().toDateString();

    const todayCounts = all.filter(
      (c) =>
        c.branch_id === branchId &&
        new Date(c.timestamp).toDateString() === today
    );

    setPendingCounts(todayCounts);
    setTodayCount(todayCounts.reduce((sum, c) => sum + c.count, 0));

    if (todayCounts.length > 0) {
      setLastCountTime(todayCounts[todayCounts.length - 1].timestamp);
    }
  }, [branchId]);

  useEffect(() => {
    loadTodayCount();
  }, [loadTodayCount]);

  const handleCount = async (count: number) => {
    const now = new Date().toISOString();
    const id = Crypto.randomUUID();

    safeVibrate(40);

    const visitor: PendingVisitorCount = {
      id,
      branch_id: branchId,
      count,
      timestamp: now,
      synced: false,
    };

    try {
      await savePendingVisitorCount(visitor);
      setTodayCount((prev) => prev + count);
      setLastCountTime(now);
      setPendingCounts((prev) => [...prev, visitor]);

      if (isSupabaseConfigured()) {
        await supabase.from('visitor_counts').insert({
          id,
          branch_id: branchId,
          count,
          timestamp: now,
        });
      }
    } catch {
      alertNotify('エラー', 'カウント保存に失敗しました');
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return `${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  };

  const getCurrentTimeSlot = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const slotMinutes = Math.floor(minutes / 15) * 15;

    return `${hours.toString().padStart(2, '0')}:${slotMinutes
      .toString()
      .padStart(2, '0')}`;
  };

  const halfHourlyData = useMemo((): HalfHourlyVisitors[] => {
    const map = new Map<string, number>();

    pendingCounts.forEach((v) => {
      const d = new Date(v.timestamp);
      const h = d.getHours().toString().padStart(2, '0');
      const m = d.getMinutes() < 15 ? '00' : '15';
      const key = `${h}:${m}`;
      map.set(key, (map.get(key) || 0) + v.count);
    });

    return Array.from(map.entries())
      .map(([time_slot, count]) => ({ time_slot, count }))
      .sort((a, b) => a.time_slot.localeCompare(b.time_slot));
  }, [pendingCounts]);

  const maxVisitorSlot = useMemo(() => {
    if (halfHourlyData.length === 0) return 1;
    return Math.max(...halfHourlyData.map((s) => s.count));
  }, [halfHourlyData]);

  return {
    todayCount,
    lastCountTime,
    handleCount,
    formatTime,
    getCurrentTimeSlot,
    halfHourlyData,
    maxVisitorSlot,
  };
};
