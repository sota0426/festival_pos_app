import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPendingTransactions } from '../../lib/storage';
import { getSyncEnabled } from '../../lib/syncMode';
import { hasSupabaseEnvConfigured } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';

interface SyncStatusBannerProps {
  branchId: string | null;
  onSyncNow?: () => Promise<void> | void;
}

const bannerStateCache: {
  branchId: string | null;
  pendingTx: number;
  online: boolean;
} = {
  branchId: null,
  pendingTx: 0,
  online: true,
};

export const SyncStatusBanner = ({ branchId, onSyncNow }: SyncStatusBannerProps) => {
  const { authState } = useAuth();
  const { canSync, isFreePlan } = useSubscription();
  const insets = useSafeAreaInsets();
  const [pendingTx, setPendingTx] = useState(() =>
    bannerStateCache.branchId === branchId ? bannerStateCache.pendingTx : 0,
  );
  const [online, setOnline] = useState(() => bannerStateCache.online);
  const [syncingNow, setSyncingNow] = useState(false);

  const syncEnabled = getSyncEnabled();
  const hasSupabase = hasSupabaseEnvConfigured();
  const isLocalMode = !syncEnabled || !hasSupabase;

  const pendingTotal = pendingTx;

  const refreshPending = useCallback(async () => {
    if (!branchId) return;
    const transactions = await getPendingTransactions();
    const nextPendingTx = transactions.filter((t) => t.branch_id === branchId && !t.synced).length;
    bannerStateCache.branchId = branchId;
    bannerStateCache.pendingTx = nextPendingTx;
    setPendingTx(nextPendingTx);
  }, [branchId]);

  const probeNetwork = useCallback(async () => {
    if (isLocalMode) {
      bannerStateCache.online = false;
      setOnline(false);
      return;
    }

    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const apikey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !apikey) {
      bannerStateCache.online = false;
      setOnline(false);
      return;
    }

    try {
      const res = await fetch(`${url}/rest/v1/`, {
        method: 'GET',
        headers: { apikey },
        cache: 'no-store',
      });
      const nextOnline = res.status < 500;
      bannerStateCache.online = nextOnline;
      setOnline(nextOnline);
    } catch {
      bannerStateCache.online = false;
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
    return null; // クレジット
  }, [isLocalMode, online, pendingTotal]);

  // デモ時は未同期表示を出さない
  if (authState.status === 'demo') return null;
  // 未ログイン利用では同期バー自体を表示しない
  if (authState.status === 'guest') return null;
  // ログインしていない状態では同期バーを表示しない
  if (authState.status === 'unauthenticated' || authState.status === 'loading') return null;
  // 無料プランは同期対象外のため、未同期表示を出さない
  if (authState.status === 'authenticated' && isFreePlan) return null;
  // 有料プランまたはログインコードで同期可能な場合のみ表示対象
  if (authState.status !== 'login_code' && !canSync) return null;

  // 表示する必要がない状態（オンライン正常）は何も描画しない
  if (!branchId || style === null) return null;

  const handlePressSync = async () => {
    if (!onSyncNow || syncingNow) return;
    setSyncingNow(true);
    try {
      await onSyncNow();
      await refreshPending();
      await probeNetwork();
    } finally {
      setSyncingNow(false);
    }
  };

  return (
    <View
      className={`${style.bg} px-4 pb-2 border-b border-gray-200`}
      style={{ paddingTop: Math.max(insets.top, 8) }}
    >
      <View className="flex-row items-center justify-between">
        <Text className={`${style.text} text-xs font-semibold`}>{style.label}</Text>
        <View className="flex-row items-center gap-2">
          {pendingTotal > 0 && (
            <Text className={`${style.text} text-xs`}>
              未同期 {pendingTotal}件
            </Text>
          )}
          {!!onSyncNow && pendingTotal > 0 && online && !isLocalMode && (
            <TouchableOpacity
              onPress={() => { void handlePressSync(); }}
              activeOpacity={0.8}
              className="px-2 py-1 rounded-md border border-yellow-300 bg-white/70"
              disabled={syncingNow}
            >
              <Text className={`${style.text} text-xs font-semibold`}>
                {syncingNow ? '同期中...' : '同期'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};
