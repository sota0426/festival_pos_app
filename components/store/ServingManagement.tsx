import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button } from '../common';
import { getPendingTransactions, markTransactionServed } from '../../lib/storage';
import { alertConfirm, alertNotify } from '../../lib/alertUtils';
import type { Branch, PendingTransaction } from '../../types/database';

interface ServingManagementProps {
  branch: Branch;
  onBack: () => void;
}

export const ServingManagement = ({ branch, onBack }: ServingManagementProps) => {
  const [orders, setOrders] = useState<PendingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const pendingTrans = await getPendingTransactions();

      // Filter: same branch, today only, completed
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayOrders = pendingTrans
        .filter((t) => {
          const transDate = new Date(t.created_at);
          transDate.setHours(0, 0, 0, 0);
          return (
            t.branch_id === branch.id &&
            transDate.getTime() === today.getTime()
          );
        })
        .sort((a, b) => {
          // Unserved first, then by time (newest first)
          if (a.served && !b.served) return 1;
          if (!a.served && b.served) return -1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

      setOrders(todayOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branch.id]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleMarkServed = (order: PendingTransaction) => {
    alertConfirm(
      '提供完了',
      `注文番号: ${order.transaction_code}\n\nこの注文を提供済みにしますか？`,
      async () => {
        try {
          await markTransactionServed(order.id);
          // Update local state
          setOrders((prev) =>
            prev.map((o) =>
              o.id === order.id ? { ...o, served: true } : o
            ).sort((a, b) => {
              if (a.served && !b.served) return 1;
              if (!a.served && b.served) return -1;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            })
          );
          alertNotify('完了', '提供済みにしました');
        } catch (error) {
          console.error('Error marking served:', error);
          alertNotify('エラー', '提供済みへの変更に失敗しました');
        }
      },
      '提供完了'
    );
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const unservedCount = orders.filter((o) => !o.served).length;
  const servedCount = orders.filter((o) => o.served).length;

  const renderOrder = ({ item }: { item: PendingTransaction }) => {
    const isServed = item.served === true;

    return (
      <Card className={`mb-3 ${isServed ? 'opacity-60' : ''}`}>
        <View className="flex-row items-start justify-between mb-2">
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-gray-500 text-sm">{formatTime(item.created_at)}</Text>
              {isServed ? (
                <View className="bg-green-100 px-2 py-0.5 rounded">
                  <Text className="text-green-600 text-xs font-medium">提供済</Text>
                </View>
              ) : (
                <View className="bg-orange-100 px-2 py-0.5 rounded">
                  <Text className="text-orange-600 text-xs font-medium">未提供</Text>
                </View>
              )}
            </View>
            <Text className="text-gray-700 text-xs mt-0.5">{item.transaction_code}</Text>
          </View>
          <Text className={`text-lg font-bold ${isServed ? 'text-gray-400' : 'text-blue-600'}`}>
            {item.total_amount.toLocaleString()}円
          </Text>
        </View>

        {/* Order items */}
        <View className="bg-gray-50 rounded-lg p-2 mb-2">
          {item.items.map((orderItem, index) => (
            <View key={index} className="flex-row justify-between py-0.5">
              <Text className="text-gray-800">
                {orderItem.menu_name} x {orderItem.quantity}
              </Text>
              <Text className="text-gray-600">{orderItem.subtotal.toLocaleString()}円</Text>
            </View>
          ))}
        </View>

        {/* Serve button */}
        {!isServed && (
          <Button
            title="提供完了"
            onPress={() => handleMarkServed(item)}
            variant="primary"
            size="sm"
          />
        )}
      </Card>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="提供管理"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
      />

      {/* Status summary */}
      <View className="flex-row p-4 gap-4">
        <Card className="flex-1 items-center">
          <Text className="text-gray-500 text-sm">未提供</Text>
          <Text className="text-xl font-bold text-orange-600">{unservedCount}件</Text>
        </Card>
        <Card className="flex-1 items-center">
          <Text className="text-gray-500 text-sm">提供済</Text>
          <Text className="text-xl font-bold text-green-600">{servedCount}件</Text>
        </Card>
      </View>

      <FlatList
        data={orders}
        renderItem={renderOrder}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchOrders();
            }}
          />
        }
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-gray-500">
              {loading ? '読み込み中...' : '本日の注文がありません'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};
