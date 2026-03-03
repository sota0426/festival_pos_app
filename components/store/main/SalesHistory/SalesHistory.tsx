import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Modal, Button } from '../../../common';
import { supabase, isSupabaseConfigured } from '../../../../lib/supabase';
import { getPendingTransactions, getMenus, saveMenus, getRestrictions, savePendingTransactions, verifyAdminPassword } from '../../../../lib/storage';
import { alertConfirm, alertNotify } from '../../../../lib/alertUtils';
import type { Branch, Transaction, TransactionItem, RestrictionSettings } from '../../../../types/database';
import { MenuSalesSummary } from './MenuSalesSummary';
import { handleExportCSV } from './ExportCSV';
import { CancelModal } from './CancelModal';
import { TransactionCard } from './TransactionCard';
import { useAuth } from '../../../../contexts/AuthContext';
import { DEMO_TRANSACTIONS, resolveDemoBranchId } from '../../../../data/demoData';

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
  const { authState } = useAuth();
  const isDemo = authState.status === 'demo';
  const demoBranchId = resolveDemoBranchId(branch);
  const canSyncToSupabase = isSupabaseConfigured() && !isDemo;

  const [transactions, setTransactions] = useState<TransactionWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithItems | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [view, setView] = useState<'history' | 'menuSales'>("history");

  // Restriction & admin guard state
  const [restrictions, setRestrictions] = useState<RestrictionSettings | null>(null);
  const [showAdminGuardModal, setShowAdminGuardModal] = useState(false);
  const [adminGuardPwInput, setAdminGuardPwInput] = useState('');
  const [adminGuardError, setAdminGuardError] = useState('');
  const [adminGuardCallback, setAdminGuardCallback] = useState<(() => void) | null>(null);
  const [salesGuardPurpose, setSalesGuardPurpose] = useState<'cancel' | 'reset'>('cancel');

  const fetchTransactions = useCallback(async () => {
    try {
      if (isDemo && demoBranchId) {
        const demoTrans: TransactionWithItems[] = (DEMO_TRANSACTIONS[demoBranchId] ?? []).map((t) => ({
          id: t.id,
          branch_id: branch.id,
          transaction_code: t.transaction_code,
          total_amount: t.total_amount,
          payment_method: t.payment_method,
          status: 'completed',
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
        setTransactions(demoTrans.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ));
        setLoading(false);
        setRefreshing(false);
        return;
      }

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

      if (!canSyncToSupabase) {
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
  }, [branch.id, branch.branch_code, isDemo, demoBranchId, canSyncToSupabase]);

  useEffect(() => {
    fetchTransactions();
    getRestrictions().then(setRestrictions);
  }, [fetchTransactions]);

  // --- Admin guard helpers ---
  const openSalesGuard = (onSuccess: () => void) => {
    setAdminGuardPwInput('');
    setAdminGuardError('');
    setAdminGuardCallback(() => onSuccess);
    setShowAdminGuardModal(true);
  };

  const closeSalesGuard = () => {
    setShowAdminGuardModal(false);
    setAdminGuardPwInput('');
    setAdminGuardError('');
    setAdminGuardCallback(null);
  };

  const handleSalesGuardSubmit = async () => {
    if (!adminGuardPwInput.trim()) {
      setAdminGuardError('管理者パスワードを入力してください');
      return;
    }
    const isValid = await verifyAdminPassword(adminGuardPwInput);
    if (!isValid) {
      setAdminGuardError('パスワードが正しくありません');
      return;
    }
    const cb = adminGuardCallback;
    closeSalesGuard();
    cb?.();
  };

  const executeCancelTransaction = (transaction: TransactionWithItems) => {
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
          if (!isDemo) {
            await saveMenus(updatedMenus);
          }

          // Update transaction status
          if (canSyncToSupabase) {
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

  const handleCancelTransaction = (transaction: TransactionWithItems) => {
    if (restrictions?.sales_cancel) {
      setSalesGuardPurpose('cancel');
      openSalesGuard(() => executeCancelTransaction(transaction));
    } else {
      executeCancelTransaction(transaction);
    }
  };

  const executeClearAllSales = async () => {
    setClearingAll(true);
    try {
      if (canSyncToSupabase) {
        const { data: transRows, error: transFetchError } = await supabase
          .from('transactions')
          .select('id')
          .eq('branch_id', branch.id);
        if (transFetchError) throw transFetchError;

        const transIds = (transRows ?? []).map((row) => row.id);
        if (transIds.length > 0) {
          const { error: itemDeleteError } = await supabase
            .from('transaction_items')
            .delete()
            .in('transaction_id', transIds);
          if (itemDeleteError) throw itemDeleteError;
        }

        const { error: txDeleteError } = await supabase
          .from('transactions')
          .delete()
          .eq('branch_id', branch.id);
        if (txDeleteError) throw txDeleteError;
      }

      if (!isDemo) {
        const pending = await getPendingTransactions();
        const remained = pending.filter((t) => t.branch_id !== branch.id);
        await savePendingTransactions(remained);
      }

      setTransactions([]);
      setShowDetailModal(false);
      setSelectedTransaction(null);
      alertNotify('完了', '販売履歴を全消去しました');
    } catch (error) {
      console.error('Error clearing all sales history:', error);
      alertNotify('エラー', '販売履歴の全消去に失敗しました');
    } finally {
      setClearingAll(false);
    }
  };

  const handleClearAllSales = () => {
    if (transactionCount === 0) return;
    alertConfirm(
      '全消去の確認',
      '販売履歴をすべて削除しますか？\nこの操作は取り消せません。',
      () => {
        setSalesGuardPurpose('reset');
        openSalesGuard(() => {
          void executeClearAllSales();
        });
      },
      '削除する',
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
                title="メニュー別売上"
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
            <TouchableOpacity
              onPress={() => setShowActionsModal(true)}
              className="w-9 h-9 bg-gray-100 rounded-lg items-center justify-center"
              activeOpacity={0.7}
            >
              <Text className="text-gray-700 text-lg font-bold leading-none">☰</Text>
            </TouchableOpacity>

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

      <Modal
        visible={showActionsModal}
        onClose={() => setShowActionsModal(false)}
        title="販売履歴操作"
      >
        <View className="gap-3">
          <TouchableOpacity
            onPress={() => {
              setShowActionsModal(false);
              handleExportCSV({ transactions, branch });
            }}
            className="flex-row items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3"
            activeOpacity={0.7}
          >
            <Text className="text-lg">📤</Text>
            <View className="flex-1">
              <Text className="text-blue-800 font-semibold text-sm">CSV出力</Text>
              <Text className="text-blue-600 text-xs">販売履歴データをCSVで出力</Text>
            </View>
          </TouchableOpacity>

          {view === 'history' ? (
            <TouchableOpacity
              onPress={() => {
                setShowActionsModal(false);
                handleClearAllSales();
              }}
              disabled={transactionCount === 0 || clearingAll}
              className={`flex-row items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 ${
                transactionCount === 0 || clearingAll ? 'opacity-50' : ''
              }`}
              activeOpacity={0.7}
            >
              <Text className="text-lg">🗑️</Text>
              <View className="flex-1">
                <Text className="text-red-800 font-semibold text-sm">全消去</Text>
                <Text className="text-red-600 text-xs">販売履歴をすべて削除</Text>
              </View>
            </TouchableOpacity>
          ) : null}
        </View>
      </Modal>

      {/* Admin Guard Modal for sales_cancel restriction */}
      <Modal
        visible={showAdminGuardModal}
        onClose={closeSalesGuard}
        title="管理者パスワード"
      >
          {salesGuardPurpose === 'reset'
            ? (
            <Text className="text-gray-600 text-sm mb-3">
              販売履歴の全消去には管理者パスワードが必要です。{'\n'}初期パスワードは[0000]です。
            </Text>
            ): (
          <Text className="text-gray-600 text-sm mb-3">
            売上の取消には管理者パスワードが必要です
            </Text>
            )
            }
        <TextInput
          value={adminGuardPwInput}
          onChangeText={(text) => {
            setAdminGuardPwInput(text);
            setAdminGuardError('');
          }}
          secureTextEntry
          placeholder="管理者パスワードを入力"
          className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
          placeholderTextColor="#9CA3AF"
        />
        {adminGuardError ? <Text className="text-red-500 text-sm mt-1">{adminGuardError}</Text> : null}
        <View className="flex-row gap-3 mt-3">
          <View className="flex-1">
            <Button title="キャンセル" onPress={closeSalesGuard} variant="secondary" />
          </View>
          <View className="flex-1">
            <Button
              title="確認"
              onPress={handleSalesGuardSubmit}
              disabled={!adminGuardPwInput.trim()}
            />
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};
