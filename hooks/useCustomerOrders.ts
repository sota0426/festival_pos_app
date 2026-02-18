/**
 * useCustomerOrders
 *
 * スタッフ側 (Register.tsx) で客からの注文をリアルタイム受信するフック。
 *
 * - Web 環境: ポーリング (10秒間隔)
 *   PrepInventory.tsx と同様に Web では WebSocket 接続が不安定なためポーリングを使用。
 * - Native 環境: Supabase Realtime チャンネル + ポーリング併用
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { hasSupabaseEnvConfigured, supabase } from '../lib/supabase';
import type { CustomerOrderItem, CustomerOrderWithItems } from '../types/database';

/** ポーリング間隔 (ms) */
const POLL_INTERVAL = 10_000;

export interface UseCustomerOrdersReturn {
  /** status = 'pending' の注文一覧 (古い順) */
  pendingOrders: CustomerOrderWithItems[];
  /** 初回ロード中フラグ */
  loading: boolean;
  /** 手動リフレッシュ */
  refresh: () => Promise<void>;
  /** 注文を承認してレジに読み込む (status → 'accepted') */
  acceptOrder: (orderId: string) => Promise<void>;
  /** 注文をキャンセルする (status → 'cancelled') */
  cancelOrder: (orderId: string) => Promise<void>;
  /** 注文を完了にする (status → 'completed') ─ 会計完了後に呼ぶ */
  completeOrder: (orderId: string) => Promise<void>;
}

export const useCustomerOrders = (branchId: string | null): UseCustomerOrdersReturn => {
  const [pendingOrders, setPendingOrders] = useState<CustomerOrderWithItems[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef(false);

  // ------------------------------------------------------------------
  // 注文一覧フェッチ (pending のみ)
  // ------------------------------------------------------------------
  const fetchPendingOrders = useCallback(async () => {
    if (!branchId || !hasSupabaseEnvConfigured()) return;

    try {
      const { data: orders, error: ordersError } = await supabase
        .from('customer_orders')
        .select('*')
        .eq('branch_id', branchId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (ordersError) throw ordersError;

      if (!orders || orders.length === 0) {
        setPendingOrders([]);
        return;
      }

      // 明細を一括取得
      const orderIds = orders.map((o) => o.id);
      const { data: items, error: itemsError } = await supabase
        .from('customer_order_items')
        .select('*')
        .in('order_id', orderIds);

      if (itemsError) throw itemsError;

      const allItems: CustomerOrderItem[] = items ?? [];

      const enriched: CustomerOrderWithItems[] = orders.map((order) => ({
        ...order,
        items: allItems.filter((item) => item.order_id === order.id),
      }));

      setPendingOrders(enriched);
    } catch (err) {
      console.error('[useCustomerOrders] fetchPendingOrders error:', err);
    }
  }, [branchId]);

  // ------------------------------------------------------------------
  // ステータス更新ヘルパー (楽観的 UI 更新付き)
  // ------------------------------------------------------------------
  const updateStatus = useCallback(
    async (orderId: string, status: 'accepted' | 'completed' | 'cancelled') => {
      if (!hasSupabaseEnvConfigured()) return;

      // 楽観的更新: 即座に pending 一覧から除外
      setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));

      try {
        const { error } = await supabase
          .from('customer_orders')
          .update({ status })
          .eq('id', orderId);

        if (error) {
          // 失敗した場合は再フェッチして整合性を回復
          console.error('[useCustomerOrders] updateStatus error:', error);
          await fetchPendingOrders();
        }
      } catch (err) {
        console.error('[useCustomerOrders] updateStatus exception:', err);
        await fetchPendingOrders();
      }
    },
    [fetchPendingOrders],
  );

  const acceptOrder = useCallback(
    (orderId: string) => updateStatus(orderId, 'accepted'),
    [updateStatus],
  );

  const cancelOrder = useCallback(
    (orderId: string) => updateStatus(orderId, 'cancelled'),
    [updateStatus],
  );

  const completeOrder = useCallback(
    (orderId: string) => updateStatus(orderId, 'completed'),
    [updateStatus],
  );

  // ------------------------------------------------------------------
  // セットアップ: ポーリング & Realtime
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!branchId || !hasSupabaseEnvConfigured()) return;

    // 初回フェッチ
    if (!initializedRef.current) {
      initializedRef.current = true;
      setLoading(true);
      fetchPendingOrders().finally(() => setLoading(false));
    }

    // ポーリング開始
    pollingRef.current = setInterval(() => {
      void fetchPendingOrders();
    }, POLL_INTERVAL);

    // Native のみ Realtime チャンネル購読
    // Web では WebSocket 接続失敗が出やすいためポーリングのみ使用
    if (Platform.OS !== 'web') {
      const channelName = `customer-orders-${branchId}`;
      channelRef.current = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'customer_orders',
            filter: `branch_id=eq.${branchId}`,
          },
          () => {
            void fetchPendingOrders();
          },
        )
        .subscribe();
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [branchId, fetchPendingOrders]);

  return {
    pendingOrders,
    loading,
    refresh: fetchPendingOrders,
    acceptOrder,
    cancelOrder,
    completeOrder,
  };
};
