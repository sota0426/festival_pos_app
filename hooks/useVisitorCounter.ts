import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearPendingVisitorCountsByBranch,
  clearPendingVisitorCountsByBranchAndDate,
  getPendingVisitorCounts,
  savePendingVisitorCount,
} from "lib/storage";
import { alertNotify, safeVibrate } from "lib/alertUtils";
import type {
  DailyVisitorTrend,
  PendingVisitorCount,
  QuarterHourlyGroupVisitors,
  VisitorGroup,
} from "types/database";

export const useVisitorCounter = (branchId: string) => {
  const [branchCounts, setBranchCounts] = useState<PendingVisitorCount[]>([]);
  const [lastCountTime, setLastCountTime] = useState<string | null>(null);

  const toLocalDateKey = (date: Date): string => {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, "0");
    const d = date.getDate().toString().padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const buildQuarterHourlyGroupData = (
    counts: PendingVisitorCount[],
  ): QuarterHourlyGroupVisitors[] => {
    const map = new Map<string, QuarterHourlyGroupVisitors>();

    counts.forEach((count) => {
      const d = new Date(count.timestamp);
      const slotMinutes = Math.floor(d.getMinutes() / 15) * 15;
      const key = `${d.getHours().toString().padStart(2, "0")}:${slotMinutes
        .toString()
        .padStart(2, "0")}`;

      const current = map.get(key) ?? {
        time_slot: key,
        count: 0,
        group_counts: {},
      };

      current.count += count.count;
      current.group_counts[count.group] =
        (current.group_counts[count.group] ?? 0) + count.count;
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.time_slot.localeCompare(b.time_slot),
    );
  };

  const formatDateLabel = (dateKey: string): string => {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    return `${m}/${d} (${weekdays[date.getDay()]})`;
  };

  const loadBranchCounts = useCallback(async () => {
    const all = await getPendingVisitorCounts();
    const currentBranchCounts = all
      .filter((count) => count.branch_id === branchId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    setBranchCounts(currentBranchCounts);

    const todayKey = toLocalDateKey(new Date());
    const todayCounts = currentBranchCounts.filter(
      (count) => toLocalDateKey(new Date(count.timestamp)) === todayKey,
    );
    setLastCountTime(
      todayCounts.length > 0 ? todayCounts[todayCounts.length - 1].timestamp : null,
    );
  }, [branchId]);

  useEffect(() => {
    loadBranchCounts();
  }, [loadBranchCounts]);

  const todayKey = toLocalDateKey(new Date());
  const todayCounts = useMemo(
    () =>
      branchCounts.filter(
        (count) => toLocalDateKey(new Date(count.timestamp)) === todayKey,
      ),
    [branchCounts, todayKey],
  );

  const groupCounts = useMemo(() => {
    const map: Record<VisitorGroup, number> = {};
    todayCounts.forEach((count) => {
      map[count.group] = (map[count.group] ?? 0) + count.count;
    });
    return map;
  }, [todayCounts]);

  const todayTotal = useMemo(
    () => Object.values(groupCounts).reduce((sum, value) => sum + value, 0),
    [groupCounts],
  );

  const handleCount = async (group: VisitorGroup, count: number) => {
    if (count === 0) return;

    const now = new Date().toISOString();
    const visitor: PendingVisitorCount = {
      id: Crypto.randomUUID(),
      branch_id: branchId,
      group,
      count,
      timestamp: now,
      synced: false,
    };

    safeVibrate(40);

    try {
      await savePendingVisitorCount(visitor);
      setBranchCounts((prev) => [...prev, visitor]);
      setLastCountTime(now);
    } catch {
      alertNotify("Error", "カウント保存に失敗しました");
    }
  };

  const quarterHourlyGroupData = useMemo((): QuarterHourlyGroupVisitors[] => {
    return buildQuarterHourlyGroupData(todayCounts);
  }, [todayCounts]);

  const maxVisitorSlot = useMemo(() => {
    if (quarterHourlyGroupData.length === 0) return 1;
    return Math.max(...quarterHourlyGroupData.map((slot) => slot.count), 1);
  }, [quarterHourlyGroupData]);

  const pastDailyTrends = useMemo((): DailyVisitorTrend[] => {
    const byDate = new Map<string, PendingVisitorCount[]>();

    branchCounts.forEach((count) => {
      const dateKey = toLocalDateKey(new Date(count.timestamp));
      if (dateKey === todayKey) return;
      const current = byDate.get(dateKey) ?? [];
      current.push(count);
      byDate.set(dateKey, current);
    });

    return Array.from(byDate.entries())
      .map(([dateKey, counts]) => {
        const slots = buildQuarterHourlyGroupData(counts);
        const total = counts.reduce((sum, count) => sum + count.count, 0);
        const maxSlot = Math.max(...slots.map((slot) => slot.count), 1);

        return {
          date_key: dateKey,
          date_label: formatDateLabel(dateKey),
          total,
          max_slot: maxSlot,
          slots,
        };
      })
      .sort((a, b) => b.date_key.localeCompare(a.date_key));
  }, [branchCounts, todayKey]);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "--:--";
    const date = new Date(isoString);
    return `${date.getHours().toString().padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  };

  const resetTodayCounts = async () => {
    try {
      await clearPendingVisitorCountsByBranchAndDate(branchId, todayKey);
      setBranchCounts((prev) =>
        prev.filter(
          (count) => toLocalDateKey(new Date(count.timestamp)) !== todayKey,
        ),
      );
      setLastCountTime(null);
    } catch {
      alertNotify("Error", "本日の来客数リセットに失敗しました");
    }
  };

  const resetAllCounts = async () => {
    try {
      await clearPendingVisitorCountsByBranch(branchId);
      setBranchCounts([]);
      setLastCountTime(null);
    } catch {
      alertNotify("Error", "来客数の全削除に失敗しました");
    }
  };

  return {
    groupCounts,
    todayTotal,
    lastCountTime,
    handleCount,
    formatTime,
    quarterHourlyGroupData,
    maxVisitorSlot,
    pastDailyTrends,
    resetTodayCounts,
    resetAllCounts,
  };
};
