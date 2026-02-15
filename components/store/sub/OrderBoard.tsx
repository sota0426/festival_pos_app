import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button } from '../../common';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { getPendingTransactions, addServedTransactionId, getServedTransactionIds } from '../../../lib/storage';
import type { Branch, Transaction, TransactionItem, OrderBoardItem } from '../../../types/database';

interface OrderBoardProps {
  branch: Branch;
  onBack: () => void;
}

export const OrderBoard = ({ branch, onBack }: OrderBoardProps) => {
  const [orders, setOrders] = useState<OrderBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const canRemoteRefresh = isSupabaseConfigured();

    // Fetch active orders
  const fetchActiveOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    }

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Always load local pending transactions
      const pendingTrans = await getPendingTransactions();
      const servedIds = await getServedTransactionIds();
      const localOrders: OrderBoardItem[] = pendingTrans
        .filter(
          (t) =>
            t.branch_id === branch.id &&
            new Date(t.created_at) >= todayStart &&
            !servedIds.includes(t.id)
        )
        .map((t) => ({
          transaction: {
            id: t.id,
            branch_id: t.branch_id,
            transaction_code: t.transaction_code,
            total_amount: t.total_amount,
            payment_method: t.payment_method,
            status: 'completed' as const,
            fulfillment_status: 'pending' as const,
            created_at: t.created_at,
            cancelled_at: null,
            served_at: null,
          },
          items: t.items.map((item, index) => ({
            id: `${t.id}-${index}`,
            transaction_id: t.id,
            ...item,
          })),
        }));

      if (!isSupabaseConfigured()) {
        setOrders(
          localOrders.sort(
            (a, b) => new Date(a.transaction.created_at).getTime() - new Date(b.transaction.created_at).getTime()
          )
        );
        setLastRefreshed(new Date());
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('branch_id', branch.id)
        .eq('status', 'completed')
        .eq('fulfillment_status', 'pending')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      const ordersWithItems: OrderBoardItem[] = await Promise.all(
        (transactions || []).map(async (trans: Transaction) => {
          const { data: items } = await supabase
            .from('transaction_items')
            .select('*')
            .eq('transaction_id', trans.id);
          return { transaction: trans, items: (items as TransactionItem[]) || [] };
        })
      );

      // Merge: add local orders not yet in remote
      const remoteIds = new Set(ordersWithItems.map((o) => o.transaction.id));
      const uniqueLocal = localOrders.filter((o) => !remoteIds.has(o.transaction.id));
      const merged = [...ordersWithItems, ...uniqueLocal].sort(
        (a, b) => new Date(a.transaction.created_at).getTime() - new Date(b.transaction.created_at).getTime()
      );

      setOrders(merged);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error fetching active orders:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branch.id]);
  
  // Auto-refresh orders + update elapsed time every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      fetchActiveOrders(false);
    }, 10000);
    return () => clearInterval(timer);
  }, [fetchActiveOrders]);



  // Initial load
  useEffect(() => {
    fetchActiveOrders();
  }, [fetchActiveOrders]);

  const handleRefresh = () => {
    fetchActiveOrders(true);
  };

  const handleMarkServed = async (transactionId: string) => {
    setCompleting(transactionId);
    try {
      const servedAt = new Date().toISOString();

      // ローカルに提供済みIDを記録（再取得時に除外するため）
      await addServedTransactionId(transactionId);

      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('transactions')
          .update({ fulfillment_status: 'served', served_at: servedAt })
          .eq('id', transactionId);

        if (error) throw error;
      }

      // Remove from local state immediately
      setOrders((prev) => prev.filter((o) => o.transaction.id !== transactionId));
      setCompleting(null);
    } catch (err) {
      console.error('Error marking order as served:', err);
      setCompleting(null);
    }
  };

  const getElapsedMinutes = (createdAt: string) => {
    return Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000));
  };

  const getUrgencyStyle = (minutes: number) => {
    if (minutes >= 10) return { border: 'border-l-red-500', text: 'text-red-600', bg: 'bg-red-50' };
    if (minutes >= 5) return { border: 'border-l-yellow-500', text: 'text-yellow-600', bg: 'bg-yellow-50' };
    return { border: 'border-l-green-500', text: 'text-green-600', bg: 'bg-green-50' };
  };

  const formatTime = (date: Date) => {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-amber-50 items-center justify-center" edges={['top']}>
        <ActivityIndicator size="large" color="#F59E0B" />
        <Text className="text-gray-500 mt-4">読み込み中...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-amber-50" edges={['top']}>
      <Header
        title="注文受付"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
        rightElement={
          canRemoteRefresh ? (
            <Button
              title={refreshing ? '更新中...' : '更新'}
              onPress={handleRefresh}
              variant="primary"
              size="sm"
              disabled={refreshing}
              loading={refreshing}
            />
          ) : null
        }
      />

      {/* Pending count banner + last refreshed */}
      <View className="bg-amber-100 px-4 py-2 flex-row items-center justify-between">
        <Text className="text-amber-800 font-bold">
          未提供: {orders.length}件
        </Text>
        {lastRefreshed && (
          <Text className="text-amber-600 text-xs">
            最終更新: {formatTime(lastRefreshed)}
          </Text>
        )}
      </View>

      {orders.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 text-xl">注文待ち...</Text>
          {canRemoteRefresh && (
            <>
              <Text className="text-gray-300 mt-2">「更新」ボタンで最新の注文を取得できます</Text>
              <TouchableOpacity
                onPress={handleRefresh}
                className="mt-6 bg-amber-400 rounded-xl px-8 py-4"
                activeOpacity={0.7}
              >
                <Text className="text-white font-bold text-lg">更新する</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 8 }}>
          <View className="flex-wrap ">
            {orders.map((order) => {
              const elapsed = getElapsedMinutes(order.transaction.created_at);
              const urgency = getUrgencyStyle(elapsed);
              const orderNumber = order.transaction.transaction_code.split('-').pop();

              return (
                <View key={order.transaction.id} className={isMobile ? 'w-full p-4' : 'w-1/2 p-4'}>
                  <Card className={`border-l-4 ${urgency.border}`}>
                    {/* Header: order number + elapsed time */}
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="font-bold text-gray-900 text-2xl">#{orderNumber}</Text>
                      <View className={`px-2 py-0.5 rounded-full ${urgency.bg}`}>
                        <Text className={`text-sm font-medium ${urgency.text}`}>
                          {elapsed === 0 ? '今' : `${elapsed}分前`}
                        </Text>
                      </View>
                    </View>

                    {/* Items list */}
                    <View className="mb-1">
                      {order.items.map((item) => (
                        <View
                          key={item.id}
                          className="flex-row justify-center items-center py-1.5 border-b border-gray-100"
                        >
                          <Text className="text-gray-800 text-base font-medium ">
                            {item.menu_name}
                          </Text>
                          
                          <View className="bg-blue-100 rounded px-2 py-0.5 ml-2">
                            <Text className="text-blue-800 font-bold text-base">
                              {item.quantity} 個
                            </Text>
                          </View>

                        </View>
                      ))}
                    </View>

                    {/* Served button */}
                    <TouchableOpacity
                      onPress={() => handleMarkServed(order.transaction.id)}
                      disabled={completing === order.transaction.id}
                      className={`rounded-lg py-3 items-center ${
                        completing === order.transaction.id ? 'bg-gray-300' : 'bg-green-600'
                      }`}
                      activeOpacity={0.7}
                    >
                      {completing === order.transaction.id ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text className="text-white font-bold text-lg">提供完了</Text>
                      )}
                    </TouchableOpacity>
                  </Card>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};
