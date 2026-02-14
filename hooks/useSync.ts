import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
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

export const useSync = () => {
  const syncInProgress = useRef(false);
  const visitorSyncInProgress = useRef(false);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const visitorSyncTimerRef = useRef<NodeJS.Timeout | null>(null);

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
          const transactionItems = transaction.items.map((item) => ({
            id: Crypto.randomUUID(),
            transaction_id: transaction.id,
            menu_id: item.menu_id,
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
        const groupType = item.group || 'unassigned';
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
    const lastSync = await getLastSyncTime();

    if (!lastSync) {
      // Never synced, sync now
      await syncPendingTransactions();
      return;
    }

    const lastSyncTime = new Date(lastSync).getTime();
    const now = Date.now();

    if (now - lastSyncTime >= SYNC_INTERVAL) {
      // More than 1 hour since last sync
      await syncPendingTransactions();
    }
  }, [syncPendingTransactions]);

  // Set up periodic sync
  useEffect(() => {
    // Initial sync check
    checkAndSync();

    // Set up interval for periodic sync
    syncTimerRef.current = setInterval(() => {
      checkAndSync();
    }, SYNC_INTERVAL);

    // Visitor counts sync every 15 minutes (aligned to quarter-hour boundary)
    syncPendingVisitorCounts();
    const now = Date.now();
    const nextBoundaryDelay =
      VISITOR_SYNC_INTERVAL - (now % VISITOR_SYNC_INTERVAL);
    const boundaryTimeout = setTimeout(() => {
      syncPendingVisitorCounts();
      visitorSyncTimerRef.current = setInterval(() => {
        syncPendingVisitorCounts();
      }, VISITOR_SYNC_INTERVAL);
    }, nextBoundaryDelay);

    // Sync when app comes to foreground
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkAndSync();
        syncPendingVisitorCounts();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
      if (visitorSyncTimerRef.current) {
        clearInterval(visitorSyncTimerRef.current);
      }
      clearTimeout(boundaryTimeout);
      subscription.remove();
    };
  }, [checkAndSync, syncPendingVisitorCounts]);

  return {
    syncNow: syncPendingTransactions,
    syncVisitorNow: syncPendingVisitorCounts,
    checkAndSync,
  };
};
