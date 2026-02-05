import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';
import { Button, Card, Header } from '../common';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getMenus, saveMenus, savePendingTransaction } from '../../lib/storage';
import type { Branch, Menu, CartItem, PendingTransaction } from '../../types/database';

interface RegisterProps {
  branch: Branch;
  onBack: () => void;
  onNavigateToHistory: () => void;
}

export const Register = ({ branch, onBack, onNavigateToHistory }: RegisterProps) => {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const fetchMenus = useCallback(async () => {
    try {
      const localMenus = await getMenus();
      const branchMenus = localMenus.filter((m) => m.branch_id === branch.id && m.is_active);
      setMenus(branchMenus);
    } catch (error) {
      console.error('Error fetching menus:', error);
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  const totalAmount = cart.reduce((sum, item) => sum + item.subtotal, 0);

  const addToCart = (menu: Menu) => {
    // Check stock if stock management is enabled
    if (menu.stock_management && menu.stock_quantity <= 0) {
      Alert.alert('在庫切れ', `「${menu.menu_name}」は在庫切れです`);
      return;
    }

    // Check if adding would exceed stock
    const existingItem = cart.find((item) => item.menu_id === menu.id);
    const currentQty = existingItem ? existingItem.quantity : 0;

    if (menu.stock_management && currentQty >= menu.stock_quantity) {
      Alert.alert('在庫不足', `「${menu.menu_name}」の在庫が足りません（残り${menu.stock_quantity}個）`);
      return;
    }

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.menu_id === menu.id);
      if (existing) {
        return prevCart.map((item) =>
          item.menu_id === menu.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * item.unit_price,
              }
            : item
        );
      }
      return [
        ...prevCart,
        {
          menu_id: menu.id,
          menu_name: menu.menu_name,
          unit_price: menu.price,
          quantity: 1,
          subtotal: menu.price,
        },
      ];
    });
  };

  const updateCartItemQuantity = (menuId: string, change: number) => {
    setCart((prevCart) => {
      const item = prevCart.find((i) => i.menu_id === menuId);
      if (!item) return prevCart;

      const menu = menus.find((m) => m.id === menuId);
      const newQty = item.quantity + change;

      if (newQty <= 0) {
        return prevCart.filter((i) => i.menu_id !== menuId);
      }

      // Check stock
      if (menu?.stock_management && newQty > menu.stock_quantity) {
        Alert.alert('在庫不足', `「${menu.menu_name}」の在庫が足りません（残り${menu.stock_quantity}個）`);
        return prevCart;
      }

      return prevCart.map((i) =>
        i.menu_id === menuId
          ? { ...i, quantity: newQty, subtotal: newQty * i.unit_price }
          : i
      );
    });
  };

  const removeFromCart = (menuId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.menu_id !== menuId));
  };

  const clearCart = () => {
    if (cart.length === 0) return;

    Alert.alert('確認', '注文内容をクリアしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'クリア', style: 'destructive', onPress: () => setCart([]) },
    ]);
  };

  const generateTransactionCode = (): string => {
    const now = new Date();
    const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${branch.branch_code}-${dateStr}${timeStr}-${random}`;
  };

  const processPayment = async (paymentMethod: 'paypay' | 'voucher') => {
    if (cart.length === 0) {
      Alert.alert('エラー', '商品を選択してください');
      return;
    }

    setProcessing(true);

    try {
      const transactionId = uuidv4();
      const transactionCode = generateTransactionCode();
      const now = new Date().toISOString();

      // Create transaction
      const transaction: PendingTransaction = {
        id: transactionId,
        branch_id: branch.id,
        transaction_code: transactionCode,
        total_amount: totalAmount,
        payment_method: paymentMethod,
        items: cart.map((item) => ({
          menu_id: item.menu_id,
          menu_name: item.menu_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
        })),
        created_at: now,
        synced: false,
      };

      // Update stock
      const updatedMenus = menus.map((menu) => {
        const cartItem = cart.find((item) => item.menu_id === menu.id);
        if (cartItem && menu.stock_management) {
          return {
            ...menu,
            stock_quantity: menu.stock_quantity - cartItem.quantity,
            updated_at: now,
          };
        }
        return menu;
      });

      // Save to local storage first
      await savePendingTransaction(transaction);
      await saveMenus(updatedMenus);
      setMenus(updatedMenus);

      // Try to sync with Supabase
      if (isSupabaseConfigured()) {
        try {
          // Insert transaction
          const { error: transError } = await supabase.from('transactions').insert({
            id: transactionId,
            branch_id: branch.id,
            transaction_code: transactionCode,
            total_amount: totalAmount,
            payment_method: paymentMethod,
            status: 'completed',
            created_at: now,
            cancelled_at: null,
          });

          if (transError) throw transError;

          // Insert transaction items
          const transactionItems = cart.map((item) => ({
            id: uuidv4(),
            transaction_id: transactionId,
            menu_id: item.menu_id,
            menu_name: item.menu_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
          }));

          const { error: itemsError } = await supabase.from('transaction_items').insert(transactionItems);
          if (itemsError) throw itemsError;

          // Update stock in Supabase
          for (const menu of updatedMenus) {
            const cartItem = cart.find((item) => item.menu_id === menu.id);
            if (cartItem && menu.stock_management) {
              await supabase
                .from('menus')
                .update({ stock_quantity: menu.stock_quantity, updated_at: now })
                .eq('id', menu.id);
            }
          }
        } catch (syncError) {
          console.log('Sync failed, will retry later:', syncError);
          // Data is already saved locally, sync will happen later
        }
      }

      // Clear cart and show success
      setCart([]);
      Alert.alert(
        '会計完了',
        `合計: ${totalAmount.toLocaleString()}円\n支払い方法: ${paymentMethod === 'paypay' ? 'PayPay' : '金券'}\n取引番号: ${transactionCode}`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error processing payment:', error);
      Alert.alert('エラー', '会計処理に失敗しました');
    } finally {
      setProcessing(false);
    }
  };

  const getStockStatus = (menu: Menu): { color: string; text: string } => {
    if (!menu.stock_management) {
      return { color: 'text-green-600', text: '' };
    }
    if (menu.stock_quantity === 0) {
      return { color: 'text-red-500', text: '売切' };
    }
    if (menu.stock_quantity <= 5) {
      return { color: 'text-orange-500', text: `残${menu.stock_quantity}` };
    }
    return { color: 'text-gray-500', text: `残${menu.stock_quantity}` };
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100" edges={['top']}>
      <Header
        title="レジ"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
        rightElement={
          <Button title="履歴" onPress={onNavigateToHistory} size="sm" variant="secondary" />
        }
      />

      <View className="flex-1 flex-row">
        {/* Left: Menu List */}
        <View className="flex-1 p-2">
          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="flex-row flex-wrap">
              {menus.map((menu) => {
                const stockStatus = getStockStatus(menu);
                const isDisabled = menu.stock_management && menu.stock_quantity === 0;

                return (
                  <View key={menu.id} className="w-1/2 p-1">
                    <TouchableOpacity
                      onPress={() => addToCart(menu)}
                      disabled={isDisabled}
                      activeOpacity={0.7}
                    >
                      <Card
                        className={`items-center py-4 ${isDisabled ? 'opacity-50 bg-gray-200' : ''}`}
                      >
                        <Text
                          className={`text-lg font-semibold text-center ${isDisabled ? 'text-gray-400' : 'text-gray-900'}`}
                          numberOfLines={2}
                        >
                          {menu.menu_name}
                        </Text>
                        <Text
                          className={`text-xl font-bold mt-1 ${isDisabled ? 'text-gray-400' : 'text-blue-600'}`}
                        >
                          {menu.price.toLocaleString()}円
                        </Text>
                        {menu.stock_management && (
                          <Text className={`text-sm mt-1 ${stockStatus.color}`}>
                            {stockStatus.text}
                          </Text>
                        )}
                      </Card>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {menus.length === 0 && !loading && (
              <View className="items-center py-12">
                <Text className="text-gray-500">メニューが登録されていません</Text>
                <Text className="text-gray-400 text-sm mt-2">
                  メニュー登録画面で追加してください
                </Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Right: Cart */}
        <View className="w-72 bg-white border-l border-gray-200">
          <View className="p-3 border-b border-gray-200">
            <Text className="text-lg font-bold text-gray-900">注文内容</Text>
          </View>

          <ScrollView className="flex-1 p-3">
            {cart.map((item) => (
              <View
                key={item.menu_id}
                className="flex-row items-center justify-between py-2 border-b border-gray-100"
              >
                <View className="flex-1">
                  <Text className="text-gray-900 font-medium" numberOfLines={1}>
                    {item.menu_name}
                  </Text>
                  <Text className="text-gray-500 text-sm">
                    @{item.unit_price.toLocaleString()}円
                  </Text>
                </View>

                <View className="flex-row items-center">
                  <TouchableOpacity
                    onPress={() => updateCartItemQuantity(item.menu_id, -1)}
                    className="w-7 h-7 bg-gray-200 rounded items-center justify-center"
                  >
                    <Text className="text-gray-600 font-bold">-</Text>
                  </TouchableOpacity>
                  <Text className="w-8 text-center font-semibold">{item.quantity}</Text>
                  <TouchableOpacity
                    onPress={() => updateCartItemQuantity(item.menu_id, 1)}
                    className="w-7 h-7 bg-gray-200 rounded items-center justify-center"
                  >
                    <Text className="text-gray-600 font-bold">+</Text>
                  </TouchableOpacity>
                </View>

                <Text className="w-20 text-right font-semibold text-gray-900">
                  {item.subtotal.toLocaleString()}円
                </Text>

                <TouchableOpacity
                  onPress={() => removeFromCart(item.menu_id)}
                  className="ml-2 p-1"
                >
                  <Text className="text-red-500">x</Text>
                </TouchableOpacity>
              </View>
            ))}

            {cart.length === 0 && (
              <View className="items-center py-8">
                <Text className="text-gray-400">商品を選択してください</Text>
              </View>
            )}
          </ScrollView>

          {/* Total & Payment */}
          <View className="p-3 border-t border-gray-200 bg-gray-50">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-semibold text-gray-700">合計</Text>
              <Text className="text-2xl font-bold text-blue-600">
                {totalAmount.toLocaleString()}円
              </Text>
            </View>

            <View className="gap-2">
              <Button
                title="PayPay"
                onPress={() => processPayment('paypay')}
                disabled={cart.length === 0 || processing}
                loading={processing}
              />
              <Button
                title="金券"
                onPress={() => processPayment('voucher')}
                variant="success"
                disabled={cart.length === 0 || processing}
                loading={processing}
              />
              <Button
                title="キャンセル"
                onPress={clearCart}
                variant="secondary"
                disabled={cart.length === 0 || processing}
              />
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};
