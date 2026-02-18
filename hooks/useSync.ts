import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  getPendingTransactions,
  getPendingVisitorCounts,
  markTransactionSynced,
  markVisitorCountsSynced,
  clearSyncedTransactions,
  saveLastSyncTime,
  getLastSyncTime,
} from '../lib/storage';
import * as Crypto from 'expo-crypto';

const SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds
const VISITOR_SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes
// 未同期データがある場合のリトライ間隔（短め）
const RETRY_INTERVAL = 30 * 1000; // 30 seconds
const ALLOWED_VISITOR_GROUP_TYPES = new Set(['group1', 'group2', 'group3', 'group4']);

const normalizeVisitorGroupType = (value?: string | null): string => {
  if (value && ALLOWED_VISITOR_GROUP_TYPES.has(value)) {
    return value;
  }
  // DB constraint visitor_counts_group_check allows only group1..group4.
  // Legacy values like "unassigned" are folded into group1 on sync.
  return 'group1';
};

export const useSync = () => {
  const syncInProgress = useRef(false);
  const visitorSyncInProgress = useRef(false);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const visitorSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 前回のオンライン状態を記録（復帰検知用）
  const wasOfflineRef = useRef(false);

  const syncPendingTransactions = useCallback(async () => {
    if (!isSupabaseConfigured() || syncInProgress.current) {
      return;
    }

    syncInProgress.current = true;

    try {
      const pendingTransactions = await getPendingTransactions();
      const unsynced = pendingTransactions.filter((t) => !t.synced);

      if (unsynced.length === 0) {
        console.log('No pending transactions to sync');
        await saveLastSyncTime();
        return;
      }

      console.log(`Syncing ${unsynced.length} pending transactions...`);

      for (const transaction of unsynced) {
        try {
          // Check if transaction already exists
          const { data: existing } = await supabase
            .from('transactions')
            .select('id')
            .eq('id', transaction.id)
            .single();

          if (existing) {
            // Already synced, mark as synced locally
            await markTransactionSynced(transaction.id);
            continue;
          }

          // Insert transaction
          const { error: transError } = await supabase.from('transactions').insert({
            id: transaction.id,
            branch_id: transaction.branch_id,
            transaction_code: transaction.transaction_code,
            total_amount: transaction.total_amount,
            payment_method: transaction.payment_method,
            status: 'completed',
            fulfillment_status: 'pending',
            created_at: transaction.created_at,
            cancelled_at: null,
            served_at: null,
          });

          if (transError) {
            console.error('Error syncing transaction:', transError);
            continue;
          }

          // Insert transaction items
          // Verify which menu_ids exist in the DB to avoid foreign key violations
          const menuIds = transaction.items
            .map((item) => item.menu_id)
            .filter((id): id is string => !!id);
          const existingMenuIds = new Set<string>();
          if (menuIds.length > 0) {
            const { data: existingMenus } = await supabase
              .from('menus')
              .select('id')
              .in('id', menuIds);
            if (existingMenus) {
              existingMenus.forEach((m) => existingMenuIds.add(m.id));
            }
          }

          const transactionItems = transaction.items.map((item) => ({
            id: Crypto.randomUUID(),
            transaction_id: transaction.id,
            menu_id: item.menu_id && existingMenuIds.has(item.menu_id) ? item.menu_id : null,
            menu_name: item.menu_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
          }));

          const { error: itemsError } = await supabase
            .from('transaction_items')
            .insert(transactionItems);

          if (itemsError) {
            console.error('Error syncing transaction items:', itemsError);
            continue;
          }

          // Mark as synced
          await markTransactionSynced(transaction.id);
          console.log(`Transaction ${transaction.transaction_code} synced successfully`);
        } catch (err) {
          console.error('Error syncing individual transaction:', err);
        }
      }

      // Clean up synced transactions from local storage
      await clearSyncedTransactions();
      await saveLastSyncTime();

      console.log('Sync completed');
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      syncInProgress.current = false;
    }
  }, []);

  const syncPendingVisitorCounts = useCallback(async () => {
    if (!isSupabaseConfigured() || visitorSyncInProgress.current) {
      return;
    }

    visitorSyncInProgress.current = true;

    try {
      const pendingVisitorCounts = await getPendingVisitorCounts();
      const unsynced = pendingVisitorCounts.filter((count) => !count.synced);

      if (unsynced.length === 0) {
        return;
      }

      const grouped = new Map<
        string,
        { branch_id: string; group_type: string; timestamp: string; count: number; sourceIds: string[] }
      >();

      unsynced.forEach((item) => {
        const time = new Date(item.timestamp).getTime();
        const floored = Math.floor(time / VISITOR_SYNC_INTERVAL) * VISITOR_SYNC_INTERVAL;
        const slotTimestamp = new Date(floored).toISOString();
        const groupType = normalizeVisitorGroupType(item.group);
        const key = `${item.branch_id}|${groupType}|${slotTimestamp}`;
        const current = grouped.get(key);

        if (current) {
          current.count += item.count;
          current.sourceIds.push(item.id);
          return;
        }

        grouped.set(key, {
          branch_id: item.branch_id,
          group_type: groupType,
          timestamp: slotTimestamp,
          count: item.count,
          sourceIds: [item.id],
        });
      });

      const payload = Array.from(grouped.values()).map((row) => ({
        id: Crypto.randomUUID(),
        branch_id: row.branch_id,
        group_type: row.group_type,
        count: row.count,
        timestamp: row.timestamp,
      }));

      const { error } = await supabase.from('visitor_counts').insert(payload);
      if (error) {
        console.error('Error syncing visitor counts:', error);
        return;
      }

      const syncedSourceIds = Array.from(grouped.values()).flatMap((row) => row.sourceIds);
      await markVisitorCountsSynced(syncedSourceIds);
    } catch (error) {
      console.error('Visitor sync error:', error);
    } finally {
      visitorSyncInProgress.current = false;
    }
  }, []);

  const checkAndSync = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    // 未同期データがあれば間隔に関わらず即時同期
    const pending = await getPendingTransactions();
    const hasUnsynced = pending.some((t) => !t.synced);
    if (hasUnsynced) {
      await syncPendingTransactions();
      return;
    }

    // 未同期なし: 最終同期から1時間以上経過していれば同期
    const lastSync = await getLastSyncTime();
    if (!lastSync) {
      await syncPendingTransactions();
      return;
    }
    const lastSyncTime = new Date(lastSync).getTime();
    if (Date.now() - lastSyncTime >= SYNC_INTERVAL) {
      await syncPendingTransactions();
    }
  }, [syncPendingTransactions]);

  // 未同期データが残っている間、短い間隔でリトライタイマーを張る
  const scheduleRetryIfNeeded = useCallback(async () => {
    if (retryTimerRef.current) return; // すでにスケジュール済み
    const pending = await getPendingTransactions();
    const hasUnsynced = pending.some((t) => !t.synced);
    if (!hasUnsynced) return;
    retryTimerRef.current = setInterval(async () => {
      const stillPending = await getPendingTransactions();
      const stillUnsynced = stillPending.some((t) => !t.synced);
      if (!stillUnsynced) {
        // 全件同期済みになったらリトライタイマーを解除
        if (retryTimerRef.current) {
          clearInterval(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        return;
      }
      await syncPendingTransactions();
    }, RETRY_INTERVAL);
  }, [syncPendingTransactions]);

  // Set up periodic sync
  useEffect(() => {
    // 初回: 未同期データがあれば即時同期、その後リトライタイマーをセット
    void checkAndSync().then(() => scheduleRetryIfNeeded());

    // 定期同期（1時間ごと、フォールバック用）
    syncTimerRef.current = setInterval(() => {
      void checkAndSync().then(() => scheduleRetryIfNeeded());
    }, SYNC_INTERVAL);

    // 来客カウント: 15分ごと（15分境界に合わせる）
    void syncPendingVisitorCounts();
    const now = Date.now();
    const nextBoundaryDelay = VISITOR_SYNC_INTERVAL - (now % VISITOR_SYNC_INTERVAL);
    const boundaryTimeout = setTimeout(() => {
      void syncPendingVisitorCounts();
      visitorSyncTimerRef.current = setInterval(() => {
        void syncPendingVisitorCounts();
      }, VISITOR_SYNC_INTERVAL);
    }, nextBoundaryDelay);

    // アプリフォアグラウンド復帰時に同期
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        void checkAndSync().then(() => scheduleRetryIfNeeded());
        void syncPendingVisitorCounts();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Web: オンライン復帰イベントで即座に同期
    const handleOnline = () => {
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        void checkAndSync().then(() => scheduleRetryIfNeeded());
        void syncPendingVisitorCounts();
      }
    };
    const handleOffline = () => {
      wasOfflineRef.current = true;
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
      if (visitorSyncTimerRef.current) clearInterval(visitorSyncTimerRef.current);
      clearTimeout(boundaryTimeout);
      subscription.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, [checkAndSync, scheduleRetryIfNeeded, syncPendingVisitorCounts]);

  return {
    syncNow: syncPendingTransactions,
    syncVisitorNow: syncPendingVisitorCounts,
    checkAndSync,
    scheduleRetryIfNeeded,
  };
};
