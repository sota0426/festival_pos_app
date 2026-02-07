import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header } from '../common';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import type { Branch, Transaction, TransactionItem, OrderBoardItem } from '../../types/database';

interface OrderBoardProps {
  branch: Branch;
  onBack: () => void;
}

export const OrderBoard = ({ branch, onBack }: OrderBoardProps) => {
  const [orders, setOrders] = useState<OrderBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [connected, setConnected] = useState(false);

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Update elapsed time every 30s
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Fetch active orders on mount
  const fetchActiveOrders = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    try {
      // Only show today's orders
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

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

      setOrders(ordersWithItems);
    } catch (err) {
      console.error('Error fetching active orders:', err);
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

  useEffect(() => {
    fetchActiveOrders();
  }, [fetchActiveOrders]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const channel = supabase
      .channel(`order-board-${branch.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
          filter: `branch_id=eq.${branch.id}`,
        },
        async (payload) => {
          const newTransaction = payload.new as Transaction;

          if (newTransaction.status !== 'completed') return;
          if (newTransaction.fulfillment_status === 'served') return;

          // Fetch transaction items
          const { data: items } = await supabase
            .from('transaction_items')
            .select('*')
            .eq('transaction_id', newTransaction.id);

          const newOrder: OrderBoardItem = {
            transaction: newTransaction,
            items: (items as TransactionItem[]) || [],
          };

          setOrders((prev) => [...prev, newOrder]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transactions',
          filter: `branch_id=eq.${branch.id}`,
        },
        (payload) => {
          const updated = payload.new as Transaction;

          if (updated.fulfillment_status === 'served' || updated.status === 'cancelled') {
            setOrders((prev) => prev.filter((o) => o.transaction.id !== updated.id));
          }
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branch.id]);

  const handleMarkServed = async (transactionId: string) => {
    setCompleting(transactionId);
    try {
      const servedAt = new Date().toISOString();
      const { error } = await supabase
        .from('transactions')
        .update({ fulfillment_status: 'served', served_at: servedAt })
        .eq('id', transactionId);

      if (error) throw error;

      // Remove immediately for responsiveness
      setOrders((prev) => prev.filter((o) => o.transaction.id !== transactionId));
    } catch (err) {
      console.error('Error marking order as served:', err);
    } finally {
      setCompleting(null);
    }
  };

  const getElapsedMinutes = (createdAt: string) => {
    return Math.floor((now - new Date(createdAt).getTime()) / 60000);
  };

  const getUrgencyStyle = (minutes: number) => {
    if (minutes >= 10) return { border: 'border-l-red-500', text: 'text-red-600', bg: 'bg-red-50' };
    if (minutes >= 5) return { border: 'border-l-yellow-500', text: 'text-yellow-600', bg: 'bg-yellow-50' };
    return { border: 'border-l-green-500', text: 'text-green-600', bg: 'bg-green-50' };
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
          <View className="flex-row items-center">
            <View className={`w-2.5 h-2.5 rounded-full mr-1.5 ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
            <Text className={`text-xs font-medium ${connected ? 'text-green-700' : 'text-gray-500'}`}>
              {connected ? '接続中' : '未接続'}
            </Text>
          </View>
        }
      />

      {/* Pending count banner */}
      <View className="bg-amber-100 px-4 py-2">
        <Text className="text-amber-800 font-bold text-center">
          未提供: {orders.length}件
        </Text>
      </View>

      {orders.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 text-xl">注文待ち...</Text>
          <Text className="text-gray-300 mt-2">新しい注文が入ると自動的に表示されます</Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 8 }}>
          <View className="flex-row flex-wrap">
            {orders.map((order) => {
              const elapsed = getElapsedMinutes(order.transaction.created_at);
              const urgency = getUrgencyStyle(elapsed);
              const orderNumber = order.transaction.transaction_code.split('-').pop();

              return (
                <View key={order.transaction.id} className={isMobile ? 'w-full p-1' : 'w-1/2 p-1'}>
                  <Card className={`border-l-4 ${urgency.border}`}>
                    {/* Header: order number + elapsed time */}
                    <View className="flex-row justify-between items-center mb-3">
                      <Text className="font-bold text-gray-900 text-lg">#{orderNumber}</Text>
                      <View className={`px-2 py-0.5 rounded-full ${urgency.bg}`}>
                        <Text className={`text-sm font-medium ${urgency.text}`}>
                          {elapsed}分前
                        </Text>
                      </View>
                    </View>

                    {/* Items list */}
                    <View className="mb-3">
                      {order.items.map((item) => (
                        <View
                          key={item.id}
                          className="flex-row justify-between items-center py-1.5 border-b border-gray-100"
                        >
                          <Text className="text-gray-800 text-base font-medium flex-1">
                            {item.menu_name}
                          </Text>
                          <View className="bg-blue-100 rounded px-2 py-0.5 ml-2">
                            <Text className="text-blue-800 font-bold text-base">
                              x{item.quantity}
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
