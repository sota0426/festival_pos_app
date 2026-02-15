import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, RefreshControl, ActivityIndicator} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Modal, Button } from '../../../common';
import { supabase, isSupabaseConfigured } from '../../../../lib/supabase';
import { getPendingTransactions, getMenus, saveMenus } from '../../../../lib/storage';
import { alertConfirm, alertNotify } from '../../../../lib/alertUtils';
import type { Branch, Transaction, TransactionItem } from '../../../../types/database';
import { MenuSalesSummary } from './MenuSalesSummary';
import { handleExportCSV } from './ExportCSV';
import { CancelModal } from './CancelModal';
import { TransactionCard } from './TransactionCard';

interface SalesHistoryProps {
  branch: Branch;
  onBack: () => void;
}

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

export interface TransactionWithItems extends Transaction {
  items: TransactionItem[];
}

export const SalesHistory = ({ 
  branch, 
  onBack,
}: SalesHistoryProps) => {
  const [transactions, setTransactions] = useState<TransactionWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithItems | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [view, setView] = useState<'history' | 'menuSales'>("history");


  const fetchTransactions = useCallback(async () => {
    try {
      // First get local pending transactions
      const pendingTrans = await getPendingTransactions();
      const localTrans: TransactionWithItems[] = pendingTrans
        .filter((t) => t.branch_id === branch.id)
        .map((t) => ({
          id: t.id,
          branch_id: t.branch_id,
          transaction_code: t.transaction_code,
          total_amount: t.total_amount,
          payment_method: t.payment_method,
          status: 'completed' as const,
          fulfillment_status: 'served', 
          served_at: t.created_at,              
          created_at: t.created_at,
          cancelled_at: null,
          items: t.items.map((item, index) => ({
            id: `${t.id}-${index}`,
            transaction_id: t.id,
            ...item,
          })),
        }));

      if (!isSupabaseConfigured()) {
        // Add some demo data if no local transactions
        if (localTrans.length === 0) {
          const demoTrans: TransactionWithItems[] = [
            {
              id: '1',
              branch_id: branch.id,
              transaction_code: `${branch.branch_code}-0205-1030-001`,
              total_amount: 600,
              payment_method: 'paypay',
              status: 'completed',
              fulfillment_status: 'served', 
              served_at: new Date(Date.now() - 3600000).toISOString(),                  
              created_at: new Date(Date.now() - 3600000).toISOString(),
              cancelled_at: null,
              items: [
                { id: '1-1', transaction_id: '1', menu_id: '1', menu_name: '焼きそば', quantity: 2, unit_price: 300, subtotal: 600 },
              ],
            },
            {
              id: '2',
              branch_id: branch.id,
              transaction_code: `${branch.branch_code}-0205-1045-002`,
              total_amount: 500,
              payment_method: 'voucher',
              status: 'completed',
              fulfillment_status: 'served', 
              served_at: new Date(Date.now() - 3600000).toISOString(),                 
              created_at: new Date(Date.now() - 1800000).toISOString(),
              cancelled_at: null,
              items: [
                { id: '2-1', transaction_id: '2', menu_id: '1', menu_name: '焼きそば', quantity: 1, unit_price: 300, subtotal: 300 },
                { id: '2-2', transaction_id: '2', menu_id: '2', menu_name: 'フランクフルト', quantity: 1, unit_price: 200, subtotal: 200 },
              ],
            },
            {
              id: '3',
              branch_id: branch.id,
              transaction_code: `${branch.branch_code}-0205-1100-003`,
              total_amount: 300,
              payment_method: 'paypay',
              status: 'cancelled',
              fulfillment_status: 'served', 
              served_at: new Date(Date.now() - 3600000).toISOString(),                 
              created_at: new Date(Date.now() - 900000).toISOString(),
              cancelled_at: new Date(Date.now() - 600000).toISOString(),
              items: [
                { id: '3-1', transaction_id: '3', menu_id: '1', menu_name: '焼きそば', quantity: 1, unit_price: 300, subtotal: 300 },
              ],
            },
          ];
          setTransactions([...localTrans, ...demoTrans].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ));
        } else {
          setTransactions(localTrans.sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ));
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Fetch from Supabase
      const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .eq('branch_id', branch.id)
        .order('created_at', { ascending: false });

      if (transError) throw transError;

      // Fetch transaction items
      const transWithItems: TransactionWithItems[] = await Promise.all(
        (transData || []).map(async (trans) => {
          const { data: items } = await supabase
            .from('transaction_items')
            .select('*')
            .eq('transaction_id', trans.id);

          return {
            ...trans,
            items: items || [],
          };
        })
      );

      // Merge with local transactions (avoid duplicates)
      const remoteIds = new Set(transWithItems.map((t) => t.id));
      const uniqueLocalTrans = localTrans.filter((t) => !remoteIds.has(t.id));

      setTransactions([...transWithItems, ...uniqueLocalTrans].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (error) {
      console.error('Error fetching transactions:', error);
      // Use local data as fallback
      const pendingTrans = await getPendingTransactions();
      const localTrans: TransactionWithItems[] = pendingTrans
        .filter((t) => t.branch_id === branch.id)
        .map((t) => ({
          id: t.id,
          branch_id: t.branch_id,
          transaction_code: t.transaction_code,
          total_amount: t.total_amount,
          payment_method: t.payment_method,
          status: 'completed' as const,
          fulfillment_status: 'served', 
          served_at: t.created_at,            
          created_at: t.created_at,
          cancelled_at: null,
          items: t.items.map((item, index) => ({
            id: `${t.id}-${index}`,
            transaction_id: t.id,
            ...item,
          })),
        }));
      setTransactions(localTrans.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branch.id, branch.branch_code]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleCancelTransaction = (transaction: TransactionWithItems) => {
    alertConfirm(
      '取引取消',
      `取引番号: ${transaction.transaction_code}\n合計: ${transaction.total_amount.toLocaleString()}円\n\nこの取引を取消しますか？\n在庫は元に戻されます。`,
      async () => {
        setCancelling(true);
        try {
          const now = new Date().toISOString();

          // Restore stock
          const menus = await getMenus();
          const updatedMenus = menus.map((menu) => {
            const item = transaction.items.find((i) => i.menu_id === menu.id);
            if (item && menu.stock_management) {
              return {
                ...menu,
                stock_quantity: menu.stock_quantity + item.quantity,
                updated_at: now,
              };
            }
            return menu;
          });
          await saveMenus(updatedMenus);

          // Update transaction status
          if (isSupabaseConfigured()) {
            const { error } = await supabase
              .from('transactions')
              .update({ status: 'cancelled', cancelled_at: now })
              .eq('id', transaction.id);

            if (error) throw error;

            // Update stock in Supabase
            for (const item of transaction.items) {
              const menu = updatedMenus.find((m) => m.id === item.menu_id);
              if (menu?.stock_management) {
                await supabase
                  .from('menus')
                  .update({ stock_quantity: menu.stock_quantity, updated_at: now })
                  .eq('id', menu.id);
              }
            }
          }

          // Update local state
          setTransactions((prev) =>
            prev.map((t) =>
              t.id === transaction.id ? { ...t, status: 'cancelled', cancelled_at: now } : t
            )
          );

          setShowDetailModal(false);
          setSelectedTransaction(null);

          alertNotify('完了', '取引を取消しました。在庫は元に戻されました。');
        } catch (error) {
          console.error('Error cancelling transaction:', error);
          alertNotify('エラー', '取引の取消に失敗しました');
        } finally {
          setCancelling(false);
        }
      },
      '取消する',
    );
  };

  // Calculate totals
  const completedTransactions = transactions.filter((t) => t.status === 'completed');
  const totalSales = completedTransactions.reduce((sum, t) => sum + t.total_amount, 0);
  const transactionCount = completedTransactions.length;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>

      <Header
        title={ view === "menuSales" ? "メニュー別売り上げ" :"販売履歴"}
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
        rightElement={
          <View className="flex-row gap-2">
            {view === 'history' ? (
              <Button
                title="メニュー別"
                onPress={() => setView('menuSales')}
                size="sm"
              />
            ) : (
               <Button
                title="販売履歴"
                onPress={() => setView("history")}
                size="sm"
              />
            )}
            <Button
              title="CSV 📄↓"
              onPress={()=>handleExportCSV({transactions,branch})}
              size="sm"
              variant="secondary"
            />

          </View>
        }
      />


      {/* Summary */}
      <View className="flex-row p-4 gap-4">
        <Card className="flex-1 items-center">
          <Text className="text-gray-500 text-sm">売上合計</Text>
          <Text className="text-xl font-bold text-blue-600">{totalSales.toLocaleString()}円</Text>
        </Card>
        <Card className="flex-1 items-center">
          <Text className="text-gray-500 text-sm">取引件数</Text>
          <Text className="text-xl font-bold text-gray-900">{transactionCount}件</Text>
        </Card>
      </View>

      { loading &&(
        <View className='flex-1 items-center justify-center'>
          <ActivityIndicator size="large" />
          <Text className='text-gray-500 mt-2'>読み込み中...</Text>
        </View>
      )}

      {view === 'menuSales' && (
        <MenuSalesSummary
          branch={branch}
          transactions={transactions}
          onBack={() => setView('history')}
        />
      )}

      { !loading && view === "history" && (
      <FlatList
        data={transactions}
        renderItem={(renderTransaction)=>(
            <TransactionCard
              transaction={renderTransaction.item}
              onPress={(t) => {
                setSelectedTransaction(t);
                setShowDetailModal(true);
              }}
              formatDate={formatDate}
            />
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            fetchTransactions();
          }} />
        }
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-gray-500">販売履歴がありません</Text>
          </View>
        }
      />
      )}

      <CancelModal
        visible={showDetailModal}
        transaction={selectedTransaction}
        cancelling={cancelling}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedTransaction(null);
        }}
        onCancelTransaction={handleCancelTransaction}
        formatDate={formatDate}
      />
      
    </SafeAreaView>
  );
};
