import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { getPendingTransactions, getPendingVisitorCounts } from '../../lib/storage';
import { getSyncEnabled } from '../../lib/syncMode';
import { hasSupabaseEnvConfigured } from '../../lib/supabase';

interface SyncStatusBannerProps {
  branchId: string | null;
}

export const SyncStatusBanner = ({ branchId }: SyncStatusBannerProps) => {
  const [pendingTx, setPendingTx] = useState(0);
  const [pendingVisitors, setPendingVisitors] = useState(0);
  const [online, setOnline] = useState(true);

  const syncEnabled = getSyncEnabled();
  const hasSupabase = hasSupabaseEnvConfigured();
  const isLocalMode = !syncEnabled || !hasSupabase;

  const pendingTotal = pendingTx + pendingVisitors;

  const refreshPending = useCallback(async () => {
    if (!branchId) return;
    const [transactions, visitors] = await Promise.all([
      getPendingTransactions(),
      getPendingVisitorCounts(),
    ]);
    setPendingTx(transactions.filter((t) => t.branch_id === branchId && !t.synced).length);
    setPendingVisitors(visitors.filter((v) => v.branch_id === branchId && !v.synced).length);
  }, [branchId]);

  const probeNetwork = useCallback(async () => {
    if (isLocalMode) {
      setOnline(false);
      return;
    }

    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      setOnline(navigator.onLine);
      return;
    }

    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const apikey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !apikey) {
      setOnline(false);
      return;
    }

    try {
      const res = await fetch(`${url}/rest/v1/`, {
        method: 'GET',
        headers: { apikey },
      });
      setOnline(!!res);
    } catch {
      setOnline(false);
    }
  }, [isLocalMode]);

  useEffect(() => {
    if (!branchId) return;

    void refreshPending();
    void probeNetwork();

    const timer = setInterval(() => {
      void refreshPending();
      void probeNetwork();
    }, 15000);

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshPending();
        void probeNetwork();
      }
    });

    const webOnlineHandler = () => setOnline(true);
    const webOfflineHandler = () => setOnline(false);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('online', webOnlineHandler);
      window.addEventListener('offline', webOfflineHandler);
    }

    return () => {
      clearInterval(timer);
      appStateSub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('online', webOnlineHandler);
        window.removeEventListener('offline', webOfflineHandler);
      }
    };
  }, [branchId, probeNetwork, refreshPending]);

  const style = useMemo(() => {
    if (isLocalMode) return null; // ローカルモードは表示しない
    if (!online) return { bg: 'bg-red-100', text: 'text-red-700', label: 'オフライン（端末に保存）' };
    if (pendingTotal > 0) return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '未同期データあり' };
    return null; // オンライン・同期済みは表示しない
  }, [isLocalMode, online, pendingTotal]);

  // 表示する必要がない状態（オンライン正常）は何も描画しない
  if (!branchId || style === null) return null;

  return (
    <View className={`${style.bg} px-4 py-2 border-b border-gray-200`}>
      <View className="flex-row items-center justify-between">
        <Text className={`${style.text} text-xs font-semibold`}>{style.label}</Text>
        {pendingTotal > 0 && (
          <Text className={`${style.text} text-xs`}>
            未同期 {pendingTotal}件
            { pendingVisitors > 0  && (
            <Text>（売上{pendingTx} 件/ 来客{pendingVisitors}人）</Text>
            )}
          </Text>
        )}
      </View>
    </View>
  );
};
