import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { Button, Card, Header, Modal } from '../../common';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { getMenus, saveMenus, savePendingTransaction, getNextOrderNumber, getStoreSettings, getMenuCategories } from '../../../lib/storage';
import { alertNotify, alertConfirm } from '../../../lib/alertUtils';
import type { Branch, Menu, MenuCategory, CartItem, PendingTransaction, PaymentMethodSettings } from '../../../types/database';

interface RegisterProps {
  branch: Branch;
  onBack: () => void;
  onNavigateToHistory: () => void;
  onNavigateToMenus:()=>void;
}

export const Register = ({ 
  branch, 
  onBack, 
  onNavigateToHistory,
  onNavigateToMenus
 }: RegisterProps) => {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showCart, setShowCart] = useState(false); // For mobile view
  const [cartWidth, setCartWidth] = useState(320);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSettings>({
    cash: false,
    cashless: true,
    voucher: true,
  });
  const [showCashModal, setShowCashModal] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountTargetMenuId, setDiscountTargetMenuId] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState('');
  const [showHint, setShowHint] = useState(false);

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const fetchMenus = useCallback(async () => {
    try {
      const localMenus = await getMenus();
      const branchMenus = localMenus.filter((m) => m.branch_id === branch.id && m.is_active);
      setMenus(branchMenus);

      const localCategories = await getMenuCategories();
      const branchCategories = localCategories.filter((c) => c.branch_id === branch.id);
      setCategories(branchCategories.sort((a, b) => a.sort_order - b.sort_order));
    } catch (error) {
      console.error('Error fetching menus:', error);
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

  useEffect(() => {
    fetchMenus();
    const loadSettings = async () => {
      const settings = await getStoreSettings();
      if (settings.payment_methods) {
        setPaymentMethods(settings.payment_methods);
      }
    };
    loadSettings();
  }, [fetchMenus]);

  const totalAmount = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gestureState) => {
      const newWidth = cartWidth - gestureState.dx;

      // 最小・最大幅を制限（重要）
      if (newWidth >= 240 && newWidth <= 480) {
        setCartWidth(newWidth);
      }
    },
  });

  const addToCart = (menu: Menu) => {
    // Check stock if stock management is enabled
    if (menu.stock_management && menu.stock_quantity <= 0) {
      alertNotify('在庫切れ', `「${menu.menu_name}」は在庫切れです`);
      return;
    }

    // Check if adding would exceed stock
    const existingItem = cart.find((item) => item.menu_id === menu.id);
    const currentQty = existingItem ? existingItem.quantity : 0;

    if (menu.stock_management && currentQty >= menu.stock_quantity) {
      alertNotify('在庫不足', `「${menu.menu_name}」の在庫が足りません（残り${menu.stock_quantity}個）`);
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
                subtotal: (item.quantity + 1) * (item.unit_price - item.discount),
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
          discount: 0,
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
        alertNotify('在庫不足', `「${menu.menu_name}」の在庫が足りません（残り${menu.stock_quantity}個）`);
        return prevCart;
      }

      return prevCart.map((i) =>
        i.menu_id === menuId
          ? { ...i, quantity: newQty, subtotal: newQty * (i.unit_price - i.discount) }
          : i
      );
    });
  };

  const removeFromCart = (menuId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.menu_id !== menuId));
  };

  const clearCart = () => {
    if (cart.length === 0) return;

    alertConfirm('確認', '注文内容をクリアしますか？', () => {
      setCart([]);
      setShowCart(false);
    }, 'クリア');
  };



  const openDiscountModal = (menuId: string) => {
    const item = cart.find((i) => i.menu_id === menuId);
    if (item) {
      setDiscountTargetMenuId(menuId);
      setDiscountAmount(item.discount > 0 ? item.discount.toString() : '');
      setShowDiscountModal(true);
    }
  };

  const applyDiscount = () => {
    if (!discountTargetMenuId) return;
    const amount = parseInt(discountAmount, 10) || 0;

    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.menu_id !== discountTargetMenuId) return item;
        const discountedPrice = Math.max(0, item.unit_price - amount);
        return {
          ...item,
          discount: amount,
          subtotal: item.quantity * discountedPrice,
        };
      })
    );

    setShowDiscountModal(false);
    setDiscountTargetMenuId(null);
    setDiscountAmount('');
  };

  const generateTransactionCode = async (): Promise<string> => {
    const now = new Date();
    const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    const orderNumber = await getNextOrderNumber();
    const orderStr = orderNumber.toString().padStart(2, '0');
    return `${branch.branch_code}-${dateStr}${timeStr}-${orderStr}`;
  };

  const processPayment = async (
    paymentMethod: 'paypay' | 'voucher' | 'cash',
    cashReceived?: number,
  ) => {
    if (cart.length === 0) {
      alertNotify('エラー', '商品を選択してください');
      return;
    }

    setProcessing(true);

    try {
      const transactionId = Crypto.randomUUID();
      const transactionCode = await generateTransactionCode();
      const now = new Date().toISOString();

      // お釣り計算（UI表示用のみ、DBには保存しない）
      const changeAmount =
        paymentMethod === 'cash' && cashReceived != null
          ? cashReceived - totalAmount
          : undefined;

      // Create transaction (received_amount/change_amount はDBに保存しない)
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
          const { error: transError } = await supabase.from('transactions').insert({
            id: transactionId,
            branch_id: branch.id,
            transaction_code: transactionCode,
            total_amount: totalAmount,
            payment_method: paymentMethod,
            status: 'completed',
            fulfillment_status: 'pending',
            created_at: now,
            cancelled_at: null,
            served_at: null,
          });

          if (transError) throw transError;

          const transactionItems = cart.map((item) => ({
            id: Crypto.randomUUID(),
            transaction_id: transactionId,
            menu_id: item.menu_id,
            menu_name: item.menu_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
          }));

          const { error: itemsError } = await supabase.from('transaction_items').insert(transactionItems);
          if (itemsError) throw itemsError;

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
        }
      }

      // Clear cart and show success
      setCart([]);
      setShowCart(false);
      setShowCashModal(false);
      setReceivedAmount('');
      const orderNum = transactionCode.split('-').pop();

      const methodLabel =
        paymentMethod === 'paypay' ? 'PayPay' : paymentMethod === 'voucher' ? '金券' : '現金';
      const cashInfo =
        paymentMethod === 'cash' && cashReceived != null
          ? `\nお預かり: ${cashReceived.toLocaleString()}円\nお釣り: ${changeAmount!.toLocaleString()}円`
          : '';

      alertNotify(
        '-----会計完了-----',
        `注文番号: ${orderNum}\n\n合計: ${totalAmount.toLocaleString()}円\n支払い方法: ${methodLabel}${cashInfo}`,
      );
    } catch (error) {
      console.error('Error processing payment:', error);
      alertNotify('エラー', '会計処理に失敗しました');
    } finally {
      setProcessing(false);
    }
  };

  const handleCashPayment = () => {
    if (cart.length === 0) {
      alertNotify('エラー', '商品を選択してください');
      return;
    }
    setReceivedAmount('');
    setShowCashModal(true);
  };

  const onNumpadPress = (key: string) => {
    if (key === 'clear') {
      setReceivedAmount('');
    } else if (key === 'backspace') {
      setReceivedAmount((prev) => prev.slice(0, -1));
    } else {
      setReceivedAmount((prev) => {
        const next = prev + key;
        // Prevent unreasonably large numbers
        if (next.length > 7) return prev;
        return next;
      });
    }
  };

  const receivedNum = parseInt(receivedAmount, 10) || 0;
  const changeNum = receivedNum - totalAmount >= 0 ? receivedNum - totalAmount : -1 ;

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

  // Helper to render a group of menu cards
  const renderMenuCards = (menuList: Menu[]) => (
    <View className="flex-row flex-wrap">
      {menuList.map((menu) => {
        const stockStatus = getStockStatus(menu);
        const isDisabled = menu.stock_management && menu.stock_quantity === 0;
        const cartItem = cart.find((item) => item.menu_id === menu.id);

        return (
          <View key={menu.id} className={isMobile ? 'w-1/2 p-1' : 'w-1/3 p-1'}>
            <TouchableOpacity
              onPress={() => addToCart(menu)}
              disabled={isDisabled}
              activeOpacity={0.7}
            >
              <Card
                className={`items-center py-4 ${isDisabled ? 'opacity-50 bg-gray-200' : ''} ${cartItem ? 'border-2 border-blue-800' : ''}`}
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
                {cartItem && (
                  <View className="absolute top-1 right-1 bg-blue-500 rounded-full w-6 h-6 items-center justify-center">
                    <Text className="text-white text-xs font-bold">{cartItem.quantity}</Text>
                  </View>
                )}
              </Card>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );

  // Check if any menu has a category assigned
  const hasCategories = categories.length > 0 && menus.some((m) => m.category_id !== null);

  // Menu Grid Component
  const MenuGrid = () => (
    <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
      <View className="p-2">
        {hasCategories ? (
          <>
            {/* Render menus grouped by category */}
            {categories.map((category) => {
              const categoryMenus = menus.filter((m) => m.category_id === category.id);
              if (categoryMenus.length === 0) return null;
              return (
                <View key={category.id} className="mb-3">
                  <View className="bg-purple-100 px-3 py-2 rounded-lg mb-1">
                    <Text className="text-purple-800 font-bold">{category.category_name}</Text>
                  </View>
                  {renderMenuCards(categoryMenus)}
                </View>
              );
            })}
            {/* Render uncategorized menus */}
            {(() => {
              const uncategorized = menus.filter(
                (m) => !m.category_id || !categories.find((c) => c.id === m.category_id)
              );
              if (uncategorized.length === 0) return null;
              return (
                <View className="mb-3">
                  <View className="bg-gray-300 px-3 py-2 rounded-lg mb-1">
                    <Text className="text-gray-700 font-bold">その他</Text>
                  </View>
                  {renderMenuCards(uncategorized)}
                </View>
              );
            })()}
          </>
        ) : (
          renderMenuCards(menus)
        )}
      </View>

      {menus.length === 0 && !loading && (
        <View>
        <View className="items-center py-12">
          <Text className="text-gray-500">メニューが登録されていません</Text>
          <Text className="text-gray-400 text-sm mt-2">
            メニュー登録画面で追加してください
          </Text>
        </View>
        <Card
          className='bg-blue-400  items-center justify-center rounded-xl'
        >
          <TouchableOpacity
            onPress={onNavigateToMenus}
          >
            <Text className='text-white font-bold'> メニュー登録</Text>
          </TouchableOpacity>
        </Card>
      </View>

      )}

      {/* Spacer for floating cart button on mobile */}
      {isMobile && cart.length > 0 && <View className="h-24" />}
    </ScrollView>
  );

  // Cart Component
  const CartPanel = () => (
    <View className={`bg-white ${isMobile ? 'flex-1' : 'flex-1 border-l border-gray-200'}`}>
      <View className="p-3 border-b border-gray-200 flex-row items-center justify-between">
        <Text className="text-lg font-bold text-gray-900">注文内容</Text>
        <TouchableOpacity
          onPress={() => setShowHint(prev => !prev)}
          className="w-6 h-6 items-center justify-center rounded-full bg-gray-200"
          activeOpacity={0.7}
        >
          <Text className="text-xs text-gray-600 font-bold">?</Text>
        </TouchableOpacity>
        <Modal
          visible={showHint}
          onClose={() => setShowHint(false)}
          title="メニューの割引について"
        >
          <Text className="text-gray-700">
            割引を設定したい商品を、カート内で長押ししてください。
          </Text>
      </Modal>

        {isMobile && (
          <TouchableOpacity onPress={() => setShowCart(false)} className="p-2">
            <Text className="text-gray-500 text-2xl">×</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView 
        className="flex-1 p-3"
        contentContainerStyle={{ paddingBottom: 300 }}
      >
        {cart.map((item) => (
          <View
            key={item.menu_id}
            className="py-3 border-b border-gray-100"
          >
            <View className="flex-row items-center justify-between">
              <TouchableOpacity className="flex-1 mr-2" onLongPress={() => openDiscountModal(item.menu_id)}>
                <Text className="text-gray-900 font-medium text-xl" numberOfLines={1}>
                  {item.menu_name}
                </Text>
                <Text className="text-gray-500 text-sm">
                  @{item.unit_price.toLocaleString()}円
                  {item.discount > 0 && (
                    <Text className="text-red-500 "> -{item.discount.toLocaleString()}円</Text>
                  )}
                </Text>
              </TouchableOpacity>

              <View className="flex-row items-center">
                <TouchableOpacity
                  onPress={() => updateCartItemQuantity(item.menu_id, -1)}
                  className="w-9 h-9 bg-gray-200 rounded items-center justify-center"
                >
                  <Text className="text-gray-600 font-bold text-lg">-</Text>
                </TouchableOpacity>
                <Text className="w-10 text-center font-semibold text-lg">{item.quantity}</Text>
                <TouchableOpacity
                  onPress={() => updateCartItemQuantity(item.menu_id, 1)}
                  className="w-9 h-9 bg-gray-200 rounded items-center justify-center"
                >
                  <Text className="text-gray-600 font-bold text-lg">+</Text>
                </TouchableOpacity>
              </View>

              <Text className="w-20 text-right font-semibold text-gray-900">
                {item.subtotal.toLocaleString()}円
              </Text>

              <TouchableOpacity
                onPress={() => removeFromCart(item.menu_id)}
                className="ml-2 p-2"
            >
              <Text className="text-red-500 text-lg">×</Text>
            </TouchableOpacity>
            </View>
          </View>
        ))}

        {cart.length === 0 && (
          <View className="items-center py-8">
            <Text className="text-gray-400">商品を選択してください</Text>
          </View>
        )}
      </ScrollView>

      {/* Total & Payment */}
      
      <View 
        className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-gray-50"
        style={{ paddingBottom: 16 }}        >

              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-semibold text-gray-700">合計</Text>
                <Text className="text-3xl font-bold text-blue-600">
                  {totalAmount.toLocaleString()}円
                </Text>
              </View>

              <View className="gap-3 mx-2 flex-col">
                {/** 各種支払いボタン */}
                <View className='flex flex-row '>
                  {paymentMethods.cash && (
                    <TouchableOpacity
                      onPress={handleCashPayment}
                      disabled={cart.length === 0 || processing}
                      activeOpacity={0.8}
                      className={`py-4 mr-2 rounded-xl items-center flex-1 ${
                        cart.length === 0 || processing ? 'bg-gray-300' : 'bg-green-500'
                      }`}
                    >
                      <Text className="text-white text-lg font-bold">現金</Text>
                    </TouchableOpacity>
                  )}
                  {paymentMethods.cashless && (
                    <TouchableOpacity
                      onPress={() => processPayment('paypay')}
                      disabled={cart.length === 0 || processing}
                      activeOpacity={0.8}
                      className={`py-4 mr-2 rounded-xl items-center flex-1 ${
                        cart.length === 0 || processing ? 'bg-gray-300' : 'bg-blue-500'
                      }`}
                    >
                      <Text className="text-white text-lg font-bold">PayPay</Text>
                    </TouchableOpacity>
                  )}
                  {paymentMethods.voucher && (
                    <TouchableOpacity
                      onPress={() => processPayment('voucher')}
                      disabled={cart.length === 0 || processing}
                      activeOpacity={0.8}
                      className={`py-4 mr-2 rounded-xl items-center flex-1 ${
                        cart.length === 0 || processing ? 'bg-gray-300' : 'bg-orange-500'
                      }`}
                    >
                      <Text className="text-white text-lg font-bold">金券</Text>
                    </TouchableOpacity>
                  )}
                </View>

                  {/**キャンセルボタン */}
                <TouchableOpacity
                  onPress={() => setShowClearConfirm(true)}
                  disabled={cart.length === 0 || processing}
                  activeOpacity={0.8}
                  className={`py-4 mr-2 rounded-xl items-center flex-1 ${
                    cart.length === 0 || processing ? 'bg-gray-300' : 'bg-gray-500'
                  }`}
                >
                  <Text className="text-white text-lg font-bold">キャンセル</Text>
                </TouchableOpacity>

              </View>
      </View>
    </View>
  );

  // Cash Payment Modal (inline JSX variable to avoid remount on state change)
  const numpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['clear', '0', 'backspace'],
  ];

  const cashModal = (
    <Modal
      visible={showCashModal}
      onClose={() => {
        setShowCashModal(false);
        setReceivedAmount('');
      }}
      title="現金支払い"
    >
      <ScrollView>
        <View className="mb-2">
          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-500 ">合計金額</Text>
            <Text className="text-xl font-bold text-blue-600">{totalAmount.toLocaleString()}円</Text>
          </View>

          {/* Received Amount Display */}
          <View className="bg-gray-100 rounded-xl p-4 mb-2">
            <Text className="text-gray-500 text-sm">お預かり金額</Text>
            <Text className="text-2xl font-bold text-gray-900 text-right">
              {receivedNum > 0 ? `${receivedNum.toLocaleString()}円` : '---'}
            </Text>
          </View>

          {/* Change Display */}
          <View className={`rounded-xl p-4 mb-2 ${changeNum >= 0 && receivedNum > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
            <Text className="text-gray-500 text-sm">お釣り</Text>
            <Text
              className={`text-2xl font-bold text-right ${
                changeNum < 0
                  ? 'text-gray-300'
                  : 'text-green-600'
              }`}
            >
              {changeNum < 0
                ? '---'
                : `${changeNum.toLocaleString()}円`
              }
            </Text>
          </View>

          {/* Numpad */}
          <View className="gap-2">
          {numpadKeys.map((row, rowIndex) => (
              <View key={rowIndex} className="flex-row gap-2">
                {row.map((key) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => onNumpadPress(key)}
                    activeOpacity={0.7}
                    className={`flex-1 py-3 rounded-xl items-center justify-center ${
                      key === 'clear'
                        ? 'bg-red-100'
                        : key === 'backspace'
                          ? 'bg-gray-200'
                          : 'bg-gray-100'
                    }`}
                  >
                    <Text
                      className={`text-xl font-bold ${
                        key === 'clear' ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {key === 'clear' ? 'C' : key === 'backspace' ? '←' : key}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>

          {/* Quick Amount Buttons */}
          <View className="flex-row gap-2 mt-3">
            {[1000, 5000].map((amount) => (
              <TouchableOpacity
                key={amount}
                onPress={() => setReceivedAmount(String(amount))}
                activeOpacity={0.7}
                className="flex-1 py-3 bg-blue-500 rounded-xl items-center"
              >
                <Text className="text-white font-bold text-sm">
                  {amount >= 1000 ? `${amount / 1000}千` : `${amount}`}
                </Text>
              </TouchableOpacity>
            ))}
              <TouchableOpacity
                onPress={() => setReceivedAmount(String(totalAmount))}
                activeOpacity={0.7}
                className="flex-1 py-3 bg-blue-500 rounded-xl items-center"
              >
                <Text className="text-white font-bold text-sm">
                  ちょうど
                </Text>
              </TouchableOpacity>

          </View>

        </View>
      </ScrollView>
      {/* Confirm Button */}
      <TouchableOpacity
        onPress={() => processPayment('cash', receivedNum)}
        disabled={receivedNum < totalAmount || processing || totalAmount === 0}
        activeOpacity={0.8}
        className={`py-4 rounded-xl items-center ${
          receivedNum >= totalAmount && !processing && totalAmount > 0
            ? 'bg-green-500'
            : 'bg-gray-300'
        }`}
      >
        <Text className="text-white text-lg font-bold">
          {processing ? '処理中...' : '会計する'}
        </Text>
      </TouchableOpacity>
    </Modal>
  );

  const clearConfirmModal = (
    <Modal
      visible={showClearConfirm}
      onClose={() => setShowClearConfirm(false)}
      title="確認"
    >
      <Text className="mb-4">注文内容をクリアしますか？</Text>

      <View className="flex-row gap-2">
        <TouchableOpacity
          onPress={() => setShowClearConfirm(false)}
          className="flex-1 py-3 bg-gray-300 rounded-xl items-center"
        >
          <Text>キャンセル</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setCart([]);
            setShowCart(false);
            setShowClearConfirm(false);
          }}
          className="flex-1 py-3 bg-red-500 rounded-xl items-center"
        >
          <Text className="text-white font-bold">クリア</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );


  const discountNumpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['clear', '0', 'backspace'],
  ];

  const onDiscountNumpadPress = (key: string) => {
    if (key === 'clear') {
      setDiscountAmount('');
    } else if (key === 'backspace') {
      setDiscountAmount((prev) => prev.slice(0, -1));
    } else {
      setDiscountAmount((prev) => {
        const next = prev + key;
        if (next.length > 5) return prev;
        return next;
      });
    }
  };

  const discountTargetItem = cart.find((i) => i.menu_id === discountTargetMenuId);
  const discountNum = parseInt(discountAmount, 10) || 0;

  const discountModal = (
    <Modal
      visible={showDiscountModal}
      onClose={() => {
        setShowDiscountModal(false);
        setDiscountTargetMenuId(null);
        setDiscountAmount('');
      }}
      title="割引設定"
    >
      {discountTargetItem && (
        <ScrollView>
          <View className="mb-2">
            <Text className="text-gray-700 font-medium mb-1">{discountTargetItem.menu_name}</Text>
            <Text className="text-gray-500 text-sm mb-3">
              定価: {discountTargetItem.unit_price.toLocaleString()}円
            </Text>
          </View>

          <View className="bg-gray-100 rounded-xl p-4 mb-2">
            <Text className="text-gray-500 text-sm">割引額（円）</Text>
            <Text className="text-2xl font-bold text-gray-900 text-right">
              {discountNum > 0 ? `${discountNum.toLocaleString()}円` : '---'}
            </Text>
          </View>

          <View className={`rounded-xl p-4 mb-2 ${discountNum > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
            <Text className="text-gray-500 text-sm">割引後単価</Text>
            <Text className={`text-2xl font-bold text-right ${discountNum > 0 ? 'text-green-600' : 'text-gray-300'}`}>
              {Math.max(0, discountTargetItem.unit_price - discountNum).toLocaleString()}円
            </Text>
          </View>

          <View className="gap-2">
            {discountNumpadKeys.map((row, rowIndex) => (
              <View key={rowIndex} className="flex-row gap-2">
                {row.map((key) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => onDiscountNumpadPress(key)}
                    activeOpacity={0.7}
                    className={`flex-1 py-3 rounded-xl items-center justify-center ${
                      key === 'clear' ? 'bg-red-100' : key === 'backspace' ? 'bg-gray-200' : 'bg-gray-100'
                    }`}
                  >
                    <Text className={`text-xl font-bold ${key === 'clear' ? 'text-red-600' : 'text-gray-900'}`}>
                      {key === 'clear' ? 'C' : key === 'backspace' ? '←' : key}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>

          <View className="flex-row gap-2 mt-3">
            <TouchableOpacity
              onPress={() => {
                setDiscountAmount('');
                applyDiscount();
              }}
              activeOpacity={0.7}
              className="flex-1 py-3 bg-gray-200 rounded-xl items-center"
            >
              <Text className="text-gray-700 font-bold text-sm">割引解除</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={applyDiscount}
              disabled={discountNum <= 0 || discountNum >= discountTargetItem.unit_price}
              activeOpacity={0.8}
              className={`flex-1 py-3 rounded-xl items-center ${
                discountNum > 0 && discountNum < discountTargetItem.unit_price ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <Text className="text-white text-lg font-bold">適用</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </Modal>
  );

  // Mobile Layout
  if (isMobile) {
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

        {showCart ? (
          <CartPanel />
        ) : (
          <>
            <MenuGrid />

            {/* Floating Cart Button */}
            {cart.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowCart(true)}
                className="absolute bottom-6 left-4 right-4 bg-blue-600 rounded-xl p-4 flex-row items-center justify-between shadow-lg"
                activeOpacity={0.9}
              >
                <View className="flex-row items-center">
                  <View className="bg-white rounded-full w-10 h-10 items-center justify-center mr-3">
                    <Text className="text-blue-600 font-bold text-lg">{totalItems}</Text>
                  </View>
                  <Text className="text-white font-semibold text-lg">カートを見る</Text>
                </View>
                <Text className="text-white text-2xl font-bold">
                  {totalAmount.toLocaleString()}円
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {cashModal}
        {clearConfirmModal}
        {discountModal}
      </SafeAreaView>
    );
  }


  // Desktop/Tablet Layout
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
        <View className="flex-1">
          <MenuGrid />
        </View>

        {/* Right: Cart */}
        <View className="flex-1 flex-row">
          <CartPanel />
        </View>
      </View>
      {cashModal}
      {clearConfirmModal}
      {discountModal}
    </SafeAreaView>
  );
};
