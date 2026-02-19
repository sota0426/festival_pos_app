import { useEffect, useRef, useCallback, useState } from 'react';
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
  clearAllPendingTransactions,
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

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** 同期ダイアログの表示種別 */
export type SyncDialogType =
  | 'confirm_sync'       // 「同期しますか？」
  | 'sync_error_clear';  // 「エラー発生。ローカルデータを削除しますか？」

export interface SyncDialogState {
  visible: boolean;
  type: SyncDialogType;
  /** エラー時: 対象 branch_id (ローカル削除に使う) */
  branchId?: string;
  /** エラー詳細メッセージ */
  errorMessage?: string;
  /** 未同期件数 */
  pendingCount?: number;
}

export const useSync = () => {
  const syncInProgress = useRef(false);
  const visitorSyncInProgress = useRef(false);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const visitorSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 前回のオンライン状態を記録（復帰検知用）
  const wasOfflineRef = useRef(false);
  // 起動時の確認ダイアログを一度だけ表示するフラグ
  const startupConfirmShownRef = useRef(false);

  const [syncDialog, setSyncDialog] = useState<SyncDialogState>({
    visible: false,
    type: 'confirm_sync',
  });

  const closeSyncDialog = useCallback(() => {
    setSyncDialog((prev) => ({ ...prev, visible: false }));
  }, []);

  const syncPendingTransactions = useCallback(async (): Promise<'ok' | 'error' | 'none'> => {
    if (!isSupabaseConfigured() || syncInProgress.current) {
      return 'none';
    }

    syncInProgress.current = true;
    let hasError = false;
    let errorBranchId: string | undefined;
    let errorMessage: string | undefined;

    try {
      const pendingTransactions = await getPendingTransactions();
      const unsynced = pendingTransactions.filter((t) => !t.synced);

      if (unsynced.length === 0) {
        console.log('No pending transactions to sync');
        await saveLastSyncTime();
        return 'none';
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
            hasError = true;
            errorBranchId = transaction.branch_id;
            // 23503 = foreign key violation (branch_id not in branches table)
            if (transError.code === '23503') {
              errorMessage = `branch_id が存在しません (${transaction.branch_id.slice(0, 8)}...)。\nDBリセット後にローカルの古いデータが残っている可能性があります。`;
            } else {
              errorMessage = transError.message;
            }
            continue;
          }

          // Insert transaction items
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
            hasError = true;
            errorBranchId = transaction.branch_id;
            errorMessage = itemsError.message;
            continue;
          }

          // Mark as synced
          await markTransactionSynced(transaction.id);
          console.log(`Transaction ${transaction.transaction_code} synced successfully`);
        } catch (err) {
          console.error('Error syncing individual transaction:', err);
          hasError = true;
        }
      }

      // Clean up synced transactions from local storage
      await clearSyncedTransactions();
      await saveLastSyncTime();

      if (hasError && errorBranchId) {
        // エラーが発生した場合、エラーダイアログを表示
        setSyncDialog({
          visible: true,
          type: 'sync_error_clear',
          branchId: errorBranchId,
          errorMessage: errorMessage ?? '同期中にエラーが発生しました',
        });
        return 'error';
      }

      console.log('Sync completed');
      return 'ok';
    } catch (error) {
      console.error('Sync error:', error);
      return 'error';
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

      // 非UUID branch_id の古いローカルデータは DB FK 制約で失敗するため同期対象から除外
      const invalidRows = Array.from(grouped.values()).filter((row) => !isUuid(row.branch_id));
      if (invalidRows.length > 0) {
        const invalidIds = invalidRows.flatMap((row) => row.sourceIds);
        await markVisitorCountsSynced(invalidIds);
        invalidRows.forEach((row) => {
          const key = `${row.branch_id}|${row.group_type}|${row.timestamp}`;
          grouped.delete(key);
        });
      }

      const payload = Array.from(grouped.values()).map((row) => ({
        id: Crypto.randomUUID(),
        branch_id: row.branch_id,
        group_type: row.group_type,
        count: row.count,
        timestamp: row.timestamp,
      }));

      if (payload.length === 0) {
        return;
      }

      const { error } = await supabase.from('visitor_counts').insert(payload);
      if (error) {
        // 開発画面の赤エラーを避ける: 同期失敗時はログのみ
        console.warn('Skip syncing visitor counts:', error);
        return;
      }

      const syncedSourceIds = Array.from(grouped.values()).flatMap((row) => row.sourceIds);
      await markVisitorCountsSynced(syncedSourceIds);
    } catch (error) {
      console.warn('Visitor sync skipped:', error);
    } finally {
      visitorSyncInProgress.current = false;
    }
  }, []);

  /**
   * 未同期件数を確認し、1件以上あれば「同期しますか？」ダイアログを表示。
   * ダイアログの確認後に呼ばれる onConfirm で実際に同期する。
   */
  const promptSyncIfNeeded = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    const pending = await getPendingTransactions();
    const unsynced = pending.filter((t) => !t.synced);
    if (unsynced.length === 0) return;

    setSyncDialog({
      visible: true,
      type: 'confirm_sync',
      pendingCount: unsynced.length,
    });
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
    // 起動時: 未同期データがあれば「同期しますか？」を1回だけ表示
    if (!startupConfirmShownRef.current) {
      startupConfirmShownRef.current = true;
      void promptSyncIfNeeded();
    }

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

    // アプリフォアグラウンド復帰時に同期確認
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        void promptSyncIfNeeded();
        void syncPendingVisitorCounts();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Web: オンライン復帰イベントで確認ダイアログ
    const handleOnline = () => {
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        void promptSyncIfNeeded();
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
  }, [checkAndSync, scheduleRetryIfNeeded, syncPendingVisitorCounts, promptSyncIfNeeded]);

  /** 「同期しますか？」→「はい」を押したとき */
  const handleConfirmSync = useCallback(async () => {
    closeSyncDialog();
    await syncPendingTransactions();
    await scheduleRetryIfNeeded();
  }, [closeSyncDialog, syncPendingTransactions, scheduleRetryIfNeeded]);

  /** 「ローカルデータを削除しますか？」→「はい」を押したとき */
  const handleConfirmClearLocal = useCallback(async (branchId: string) => {
    closeSyncDialog();
    await clearAllPendingTransactions(branchId);
    console.log('Local pending transactions cleared for branch:', branchId);
  }, [closeSyncDialog]);

  return {
    syncNow: syncPendingTransactions,
    syncVisitorNow: syncPendingVisitorCounts,
    checkAndSync,
    scheduleRetryIfNeeded,
    promptSyncIfNeeded,
    // ダイアログ制御
    syncDialog,
    closeSyncDialog,
    handleConfirmSync,
    handleConfirmClearLocal,
  };
};
