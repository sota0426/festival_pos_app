import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions, PanResponder, TextInput, Keyboard, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { Button, Card, Header, Modal } from '../../common';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import {
  getMenus,
  saveMenus,
  savePendingTransaction,
  getNextOrderNumber,
  getStoreSettings,
  getMenuCategories,
  saveMenuCategories,
  markTransactionSynced,
  clearSyncedTransactions,
} from '../../../lib/storage';
import { alertNotify, alertConfirm } from '../../../lib/alertUtils';
import type {
  Branch,
  Menu,
  MenuCategory,
  CartItem,
  PendingTransaction,
  PaymentMethodSettings,
  MobileOrderRequest,
  MobileOrderRequestItem,
} from '../../../types/database';
import { buildMenuCodeMap, getCategoryMetaMap, sortMenusByDisplay, UNCATEGORIZED_VISUAL } from './menuVisuals';
import { useAuth } from '../../../contexts/AuthContext';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import { DEMO_MENU_CATEGORIES, DEMO_MENUS, resolveDemoBranchId } from '../../../data/demoData';

const formatOrderNumber2Digits = (value: string | number): string => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return '00';
  const normalized = ((parsed - 1) % 99) + 1;
  return String(normalized).padStart(2, '0');
};

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
  const { authState } = useAuth();
  const { canSync } = useSubscription();
  const isDemo = authState.status === 'demo';
  const demoBranchId = useMemo(() => resolveDemoBranchId(branch), [branch]);
  const canSyncToSupabase =
    isSupabaseConfigured() && !isDemo && (authState.status === 'login_code' || canSync);

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
  const [cashlessLabel, setCashlessLabel] = useState('PayPay');
  const [showCashModal, setShowCashModal] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountTargetMenuId, setDiscountTargetMenuId] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [quickOrderInput, setQuickOrderInput] = useState('');
  const [showQuickOrder, setShowQuickOrder] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [mobileOrderRequests, setMobileOrderRequests] = useState<
    Array<MobileOrderRequest & { items: MobileOrderRequestItem[] }>
  >([]);
  const [showMobileOrderModal, setShowMobileOrderModal] = useState(false);
  const [importingRequestId, setImportingRequestId] = useState<string | null>(null);
  const [importedMobileOrderRequestIds, setImportedMobileOrderRequestIds] = useState<string[]>([]);

const sortMenus = useCallback((list: Menu[]) => sortMenusByDisplay(list), []);

  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;
  const discountModalContentMaxHeight = Math.max(260, Math.floor(height *  0.9));

  const scrollRef = useRef<ScrollView>(null)
  const scrollY = useRef(0);
  const quickOrderInputRef = useRef<TextInput>(null);

  const fetchMenus = useCallback(async () => {
    try {
      if (isDemo && demoBranchId) {
        const seededMenus = (DEMO_MENUS[demoBranchId] ?? [])
          .map((m) => ({ ...m, branch_id: branch.id }))
          .filter((m) => m.is_active && m.is_show !== false);
        const seededCategories = (DEMO_MENU_CATEGORIES[demoBranchId] ?? [])
          .map((c) => ({ ...c, branch_id: branch.id }))
          .sort((a, b) => a.sort_order - b.sort_order);
        setMenus(sortMenus(seededMenus));
        setCategories(seededCategories);
        setLoading(false);
        return;
      }

      const localMenus = await getMenus();
      const localCategories = await getMenuCategories();

      if (canSyncToSupabase) {
        try {
          const [
            { data: remoteMenus, error: menuError },
            { data: remoteCategories, error: categoryError },
          ] = await Promise.all([
            supabase
              .from('menus')
              .select('*')
              .eq('branch_id', branch.id)
              .eq('is_active', true)
              .order('sort_order', { ascending: true, nullsFirst: false })
              .order('created_at', { ascending: true }),
            supabase
              .from('menu_categories')
              .select('*')
              .eq('branch_id', branch.id)
              .order('sort_order', { ascending: true }),
          ]);

          if (menuError) throw menuError;
          if (categoryError) throw categoryError;

          const branchMenus = (remoteMenus ?? []).filter((m) => m.is_show !== false);
          const branchCategories = (remoteCategories ?? []).sort((a, b) => a.sort_order - b.sort_order);

          // 同期有効時はDB結果をローカルにも反映して次回起動を高速化
          const otherMenus = localMenus.filter((m) => m.branch_id !== branch.id);
          const otherCategories = localCategories.filter((c) => c.branch_id !== branch.id);
          await saveMenus([...otherMenus, ...(remoteMenus ?? [])]);
          await saveMenuCategories([...otherCategories, ...(remoteCategories ?? [])]);

          setMenus(sortMenus(branchMenus));
          setCategories(branchCategories);
          return;
        } catch (remoteError) {
          console.error('Error fetching menus from Supabase, fallback to local:', remoteError);
        }
      }

      const branchMenus = localMenus.filter(
        (m) => m.branch_id === branch.id && m.is_active && m.is_show !== false,
      );
      const branchCategories = localCategories
        .filter((c) => c.branch_id === branch.id)
        .sort((a, b) => a.sort_order - b.sort_order);

      setMenus(sortMenus(branchMenus));
      setCategories(branchCategories);
    } catch (error) {
      console.error('Error fetching menus:', error);
    } finally {
      setLoading(false);
    }
  }, [branch.id, sortMenus, isDemo, demoBranchId, canSyncToSupabase]);

  const fetchMobileOrderRequests = useCallback(async () => {
    if (!canSyncToSupabase) {
      setMobileOrderRequests([]);
      return;
    }
    try {
      const { data: requests, error: requestError } = await supabase
        .from('mobile_order_requests')
        .select('*')
        .eq('branch_id', branch.id)
        .eq('status', 'requested')
        .order('created_at', { ascending: true })
        .limit(50);
      if (requestError) throw requestError;

      const requestRows = (requests ?? []) as MobileOrderRequest[];
      if (requestRows.length === 0) {
        setMobileOrderRequests([]);
        return;
      }

      const requestIds = requestRows.map((row) => row.id);
      const { data: itemRows, error: itemError } = await supabase
        .from('mobile_order_request_items')
        .select('*')
        .in('request_id', requestIds);
      if (itemError) throw itemError;

      const items = (itemRows ?? []) as MobileOrderRequestItem[];
      const merged = requestRows.map((row) => ({
        ...row,
        items: items.filter((item) => item.request_id === row.id),
      }));
      setMobileOrderRequests(merged);
    } catch (error) {
      console.error('Failed to fetch mobile order requests:', error);
    }
  }, [branch.id, canSyncToSupabase]);

  useEffect(() => {
    fetchMenus();
    fetchMobileOrderRequests();
    const loadSettings = async () => {
      const settings = await getStoreSettings();
      if (settings.payment_methods) {
        setPaymentMethods(settings.payment_methods);
      }
      setCashlessLabel(settings.cashless_label || 'PayPay');
    };
    loadSettings();
  }, [fetchMenus, fetchMobileOrderRequests]);

  useEffect(() => {
    if (!canSyncToSupabase) return;
    const timer = setInterval(() => {
      fetchMobileOrderRequests();
    }, 10000);
    return () => clearInterval(timer);
  }, [canSyncToSupabase, fetchMobileOrderRequests]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const { orderedCategories, categoryMetaMap } = useMemo(() => getCategoryMetaMap(categories), [categories]);
  const menuCodeMap = useMemo(() => buildMenuCodeMap(menus, categories), [menus, categories]);
  const menuNumberMap = useMemo(() => {
    const map = new Map<number, Menu>();
    menus.forEach((menu) => {
      if (typeof menu.menu_number === 'number') {
        map.set(menu.menu_number, menu);
      }
    });
    return map;
  }, [menus]);

  const totalAmount = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const cartAccentPalette = [
    { bg: '#F8FAFC', border: '#BFDBFE' },
    { bg: '#F0FDF4', border: '#86EFAC' },
    { bg: '#FFF7ED', border: '#FDBA74' },
    { bg: '#FAF5FF', border: '#D8B4FE' },
    { bg: '#F5F3FF', border: '#C4B5FD' },
    { bg: '#ECFEFF', border: '#67E8F9' },
  ] as const;

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

    requestAnimationFrame(()=>{
      scrollRef.current?.scrollTo({
        y:scrollY.current,
        animated:false,
      })
    })
  };

  const addToCartByNumber = () => {
    const numberPart = parseInt(quickOrderInput.replace(/\D/g, ''), 10);
    if (Number.isNaN(numberPart)) {
      alertNotify('入力エラー', 'メニュー番号を入力してください');
      requestAnimationFrame(() => {
        quickOrderInputRef.current?.focus();
      });
      return;
    }

    const targetMenu = menuNumberMap.get(numberPart);
    if (!targetMenu) {
      alertNotify('未登録', `メニュー番号 ${numberPart} は見つかりません`);
      requestAnimationFrame(() => {
        quickOrderInputRef.current?.focus();
      });
      return;
    }

    addToCart(targetMenu);
    setQuickOrderInput('');
    requestAnimationFrame(() => {
      quickOrderInputRef.current?.focus();
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

  const importMobileOrderToCart = async (requestId: string) => {
    const request = mobileOrderRequests.find((row) => row.id === requestId);
    if (!request || request.items.length === 0) {
      alertNotify('取り込み不可', '注文内容が見つかりません');
      return;
    }

    setImportingRequestId(requestId);
    try {
      setCart((prevCart) => {
        const next = [...prevCart];
        request.items.forEach((item) => {
          const existingIndex = next.findIndex((cartItem) => cartItem.menu_id === item.menu_id);
          if (existingIndex >= 0) {
            const existing = next[existingIndex];
            next[existingIndex] = {
              ...existing,
              quantity: existing.quantity + item.quantity,
              subtotal: (existing.quantity + item.quantity) * existing.unit_price,
            };
          } else {
            next.push({
              menu_id: item.menu_id,
              menu_name: item.menu_name,
              unit_price: item.unit_price,
              discount: 0,
              quantity: item.quantity,
              subtotal: item.unit_price * item.quantity,
            });
          }
        });
        return next;
      });

      const { error } = await supabase
        .from('mobile_order_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);
      if (error) throw error;

      setShowMobileOrderModal(false);
      setImportedMobileOrderRequestIds((prev) => (prev.includes(requestId) ? prev : [...prev, requestId]));
      setMobileOrderRequests((prev) => prev.filter((row) => row.id !== requestId));
      if (isMobile) {
        setShowCart(true);
      }
    } catch (error) {
      console.error('Failed to import mobile order request:', error);
      alertNotify('エラー', 'モバイル注文の取り込みに失敗しました');
    } finally {
      setImportingRequestId(null);
    }
  };

  const generateTransactionCode = async (): Promise<string> => {
    const now = new Date();
    const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    const orderNumber = await getNextOrderNumber(branch.id);
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
      if (!isDemo) {
        await savePendingTransaction(transaction);
        await saveMenus(updatedMenus);
      }
      setMenus(updatedMenus);

      // Try to sync with Supabase
      if (canSyncToSupabase) {
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

          if (importedMobileOrderRequestIds.length > 0) {
            const { error: mobileOrderCompleteError } = await supabase
              .from('mobile_order_requests')
              .update({ status: 'completed' })
              .in('id', importedMobileOrderRequestIds);
            if (mobileOrderCompleteError) {
              console.error('Failed to mark mobile orders completed:', mobileOrderCompleteError);
            } else {
              setImportedMobileOrderRequestIds([]);
            }
          }

          // 即時同期に成功したら、その場でローカル未同期キューも解消してバナー表示を残さない
          await markTransactionSynced(transactionId);
          await clearSyncedTransactions();
        } catch (syncError) {
          console.log('Sync failed, will retry later:', syncError);
        }
      }

      // Clear cart and show success
      setCart([]);
      setImportedMobileOrderRequestIds([]);
      setShowCart(false);
      setShowCashModal(false);
      setReceivedAmount('');
      const orderNum = transactionCode.split('-').pop();

      const methodLabel =
        paymentMethod === 'paypay' ? (cashlessLabel || 'PayPay') : paymentMethod === 'voucher' ? '金券' : '現金';
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

  const clearDiscount = () => {
    if (!discountTargetMenuId) return;

    setCart((prev) =>
      prev.map((item) =>
        item.menu_id === discountTargetMenuId
          ? {
              ...item,
              discount: 0,
              subtotal: item.quantity * item.unit_price,
            }
          : item,
      ),
    );

    setDiscountAmount('');
    setShowDiscountModal(false);
    setDiscountTargetMenuId(null);
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
  const renderMenuCards = (
    menuList: Menu[],
    categoryVisual: {
      cardBgClass: string;
      cardBorderClass: string;
      chipBgClass: string;
      chipTextClass: string;
    }
  ) => (
    <View className="flex-row flex-wrap">
      {menuList.map((menu) => {
        const stockStatus = getStockStatus(menu);
        const isDisabled = menu.stock_management && menu.stock_quantity === 0;
        const cartItem = cart.find((item) => item.menu_id === menu.id);
        const menuCode = menuCodeMap.get(menu.id) ?? '000';

        return (
          <View key={menu.id} className={isMobile ? 'w-1/2 p-1' : 'w-1/3 p-1'}>
            <TouchableOpacity
              onPress={() => addToCart(menu)}
              disabled={isDisabled}
              activeOpacity={0.7}
            >
              <Card
                className={`items-center py-4 border border-stone-300 ${categoryVisual.cardBgClass} ${categoryVisual.cardBorderClass} ${isDisabled ? 'opacity-50 bg-gray-200' : ''} ${cartItem ? 'border-2 border-blue-800' : ''}`}
              >
                <View className="absolute top-1 left-1 flex-row gap-1">
                  <View className={`px-1.5 py-0.5 rounded ${categoryVisual.chipBgClass}`}>
                    <Text className={`text-[10px] font-bold ${categoryVisual.chipTextClass}`}>{menuCode}</Text>
                  </View>
                </View>
                <Text
                  className={`text-lg pt-2 font-semibold text-center ${isDisabled ? 'text-gray-400' : 'text-gray-900'}`}
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
                  <>
                    <Text className={`text-sm mt-1 ${stockStatus.color}`}>
                      {stockStatus.text}
                    </Text>
                  </>
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

  // MenuManagement と同じロジックでカテゴリ別セクションを構築
  const defaultCategoryId = useMemo(() => {
    if (orderedCategories.length === 0) return null;
    const defaultCategory = orderedCategories.find((c) => c.category_name.trim() === 'なし');
    return defaultCategory?.id ?? orderedCategories[0]?.id ?? null;
  }, [orderedCategories]);

  const menuSections = useMemo(() => {
    if (orderedCategories.length === 0) return null; // カテゴリなし → フラット表示

    let sections = orderedCategories
      .map((category) => {
        const categoryMeta = categoryMetaMap.get(category.id);
        return {
          id: category.id,
          title: category.category_name,
          code: categoryMeta?.code ?? '1',
          visual: categoryMeta?.visual ?? UNCATEGORIZED_VISUAL,
          menus: sortMenus(menus.filter((m) => m.category_id === category.id)),
        };
      })
      .filter((s) => s.menus.length > 0);

    const uncategorized = sortMenus(
      menus.filter((m) => !m.category_id || !categories.find((c) => c.id === m.category_id)),
    );

    if (uncategorized.length > 0) {
      const fallback = sections.find((s) => s.id === defaultCategoryId);
      if (fallback) {
        sections = sections.map((s) =>
          s.id === fallback.id ? { ...s, menus: sortMenus([...s.menus, ...uncategorized]) } : s,
        );
      } else {
        sections.push({
          id: 'uncategorized',
          title: 'なし',
          code: '1',
          visual: UNCATEGORIZED_VISUAL,
          menus: uncategorized,
        });
      }
    }

    return sections.filter((s) => s.menus.length > 0);
  }, [orderedCategories, categoryMetaMap, categories, menus, sortMenus, defaultCategoryId]);
  const shouldShowCategoryHeaders = (menuSections?.length ?? 0) > 1;

  // Menu Grid Component
  const MenuGrid = React.memo(() => {
    return(
      <ScrollView 
        ref={scrollRef}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        className="flex-1"
        keyboardShouldPersistTaps="always"
      >
        {menuSections ? (
          menuSections.map((section) => (
            <View key={section.id} className="mb-4">
              {shouldShowCategoryHeaders ? (
                <View className={`mx-1 mb-2 px-3 py-2 rounded-lg ${section.visual.headerBgClass}`}>
                  <Text className={`font-bold ${section.visual.headerTextClass}`}>
                    {section.code} {section.title}
                  </Text>
                </View>
              ) : null}
              {renderMenuCards(section.menus, section.visual)}
            </View>
          ))
        ) : (
          renderMenuCards(sortMenus(menus), UNCATEGORIZED_VISUAL)
        )}

        {menus.length === 0 && !loading && (
          <View className="flex-1 items-center justify-center p-8">
            <Text className="text-gray-400 text-center mb-4">
              メニューが登録されていません{'\n'}メニュー登録画面で追加してください
            </Text>
            <TouchableOpacity
              onPress={onNavigateToMenus}
              className="bg-blue-500 px-6 py-3 rounded-xl"
              activeOpacity={0.8}
            >
              <Text className="text-white font-bold">メニュー登録</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Spacer for floating cart button on mobile */}
        {isMobile && cart.length > 0 && <View style={{ height: 100 }} />}
      </ScrollView>
    );
  });

  const toggleQuickOrder = () => {
    setShowQuickOrder((prev) => {
      const next = !prev;
      if (next) {
        requestAnimationFrame(() => {
          quickOrderInputRef.current?.focus();
        });
      }
      return next;
    });
  };

  const quickOrderSection = (
  <View className="px-4 pt-2 pb-1 bg-gray-100">
      <Card className="px-3 py-2">
        <View className="mb-1">
          <Text className="text-xs text-gray-500">番号で注文追加（例: 101, 203, 007）</Text>
        </View>
          <View className="flex-row items-center gap-2">
            <TextInput
              ref={quickOrderInputRef}
              value={quickOrderInput}
              onChangeText={setQuickOrderInput}
              keyboardType="numeric"
              returnKeyType="done"
              blurOnSubmit={false}
              onSubmitEditing={addToCartByNumber}
              placeholder="メニュー番号"
              placeholderTextColor="#9CA3AF"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900"
            />
            <TouchableOpacity
              onPress={addToCartByNumber}
              className="px-4 py-2 rounded-lg bg-blue-500"
              activeOpacity={0.8}
            >
              <Text className="text-white font-semibold">追加</Text>
            </TouchableOpacity>
          </View>
      </Card>
    </View>
  );

  const registerHeaderRight = (
    <TouchableOpacity
      onPress={() => setShowActionsModal(true)}
      className="w-9 h-9 bg-gray-100 rounded-lg items-center justify-center"
      activeOpacity={0.7}
    >
      <Text className="text-gray-700 text-lg font-bold leading-none">☰</Text>
    </TouchableOpacity>
  );

  // Cart Component
  const CartPanel = () => (
    <View className={`bg-white ${isMobile ? 'flex-1' : 'flex-1 border-l border-gray-200'}`}>
      <View className="p-3 border-b border-gray-200 flex-row items-center justify-between">
        <View className='flex-row justify-center items-center gap-1'>
          <Text className="text-lg font-bold text-gray-900">注文内容</Text>
          <TouchableOpacity
            onPress={() => setShowHint(prev => !prev)}
            className="w-8 h-6 items-center justify-center rounded-full bg-yellow-200"
            activeOpacity={0.7}
          >
            <Text className="text-xs text-yellow-600 font-bold">？</Text>
          </TouchableOpacity>
        </View>
        <Modal
          visible={showHint}
          onClose={() => setShowHint(false)}
          title="メニューの割引について"
        >
          <Text className="text-gray-700">
            カート内のメニューを長押しすると、割引設定画面が現れます。
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
        {cart.map((item, index) => (
          <View
            key={item.menu_id}
            className="mb-2 rounded-xl border px-3 py-3"
            style={{
              backgroundColor: cartAccentPalette[index % cartAccentPalette.length].bg,
              borderColor: cartAccentPalette[index % cartAccentPalette.length].border,
              borderLeftWidth: 6,
            }}
          >
            <View className="flex-row items-start">
              <View className="flex-1 min-w-0 pr-2">
                <TouchableOpacity onLongPress={() => openDiscountModal(item.menu_id)} activeOpacity={0.8}>
                  <Text
                    className={`text-gray-900 font-semibold text-xl leading-5 ${isMobile ? 'text-base' : 'text-lg'}`}
                    numberOfLines={2}
                  >
                    {item.menu_name}
                  </Text>
                </TouchableOpacity>

                <Text className="text-gray-500 mt-1">
                  @{item.unit_price.toLocaleString()}円
                  {item.discount > 0 && (
                    <Text className="text-red-500"> -{item.discount.toLocaleString()}円</Text>
                  )}
                </Text>

                <View className="flex-row items-center mt-2">
                  <TouchableOpacity
                    onPress={() => updateCartItemQuantity(item.menu_id, -1)}
                    className={`bg-gray-200 rounded items-center justify-center ${isMobile ? 'w-7 h-7' : 'w-8 h-8'}`}
                  >
                    <Text className={`text-gray-600 font-bold ${isMobile ? 'text-sm' : 'text-base'}`}>-</Text>
                  </TouchableOpacity>
                  <Text className={`text-center font-semibold ${isMobile ? 'w-8 text-sm' : 'w-9 text-base'}`}>
                    {item.quantity}
                  </Text>
                  <TouchableOpacity
                    onPress={() => updateCartItemQuantity(item.menu_id, 1)}
                    className={`bg-gray-200 rounded items-center justify-center w-8 h-8`}
                  >
                    <Text className={`text-gray-600 font-bold text-base`}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View className="items-end justify-start pl-1">
                <Text className={`font-semibold text-gray-900 text-xl`}>
                  {item.subtotal.toLocaleString()}円
                </Text>
                <TouchableOpacity
                  onPress={() => removeFromCart(item.menu_id)}
                  className={`items-center justify-center ${isMobile ? 'w-7 h-7 mt-1' : 'w-8 h-8 mt-1'}`}
                >
                  <Text className={`text-red-500 ${isMobile ? 'text-base' : 'text-lg'}`}>×</Text>
                </TouchableOpacity>
              </View>
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
                      <Text className="text-white text-lg font-bold">{cashlessLabel || 'PayPay'}</Text>
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

  // ハンバーガー（アクション）モーダル
  const actionsModal = (
    <Modal
      visible={showActionsModal}
      onClose={() => setShowActionsModal(false)}
      title="メニュー操作"
    >
      <View className="gap-3">
        {/* 番号入力 ON/OFF */}
        <TouchableOpacity
          onPress={() => {
            setShowQuickOrder((prev) => {
              const next = !prev;
              if (next) {
                requestAnimationFrame(() => {
                  quickOrderInputRef.current?.focus();
                });
              }
              return next;
            });
          }}
          className={`flex-row items-center gap-3 rounded-lg px-4 py-3 border ${
            showQuickOrder
              ? 'bg-blue-50 border-blue-300'
              : 'bg-gray-50 border-gray-200'
          }`}
          activeOpacity={0.7}
        >
          <Text className="text-lg">🔢</Text>
          <View className="flex-1">
            <Text className={`font-semibold text-sm ${showQuickOrder ? 'text-blue-800' : 'text-gray-800'}`}>
              番号入力: {showQuickOrder ? 'ON' : 'OFF'}
            </Text>
            <Text className={`text-xs ${showQuickOrder ? 'text-blue-600' : 'text-gray-500'}`}>
              メニュー番号で素早く注文追加
            </Text>
          </View>
          <View
            className={`w-10 h-6 rounded-full items-center justify-center ${
              showQuickOrder ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          >
            <View
              className={`w-4 h-4 rounded-full bg-white ${
                showQuickOrder ? 'ml-auto mr-0.5' : '-ml-4'
              }`}
            />
          </View>
        </TouchableOpacity>

        {/* 販売履歴 */}
        <TouchableOpacity
          onPress={() => {
            setShowActionsModal(false);
            onNavigateToHistory();
          }}
          className="flex-row items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
          activeOpacity={0.7}
        >
          <Text className="text-lg">📋</Text>
          <View className="flex-1">
            <Text className="text-gray-800 font-semibold text-sm">販売履歴</Text>
            <Text className="text-gray-500 text-xs">売上確認・取消</Text>
          </View>
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

  const onDiscountNumpadPress = (key: string, itemPrice: number) => {
    if (key === 'clear') {
      setDiscountAmount('');
    } else if (key === 'backspace') {
      setDiscountAmount((prev) => prev.slice(0, -1));
    } else {
      setDiscountAmount((prev) => {
        const next = prev + key;
        const nextNumber = Number(next);
        if(isNaN(nextNumber)) return prev;
        if(nextNumber > itemPrice ) return String(itemPrice);
        if (next.length > 5) return prev;
        return next;
      });
    }
  };

  const discountTargetItem = cart.find((i) => i.menu_id === discountTargetMenuId);
  const discountNum = parseInt(discountAmount, 10) || 0;
  const isCompactDiscountModal = isMobile;

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
        <ScrollView
          style={{ maxHeight: discountModalContentMaxHeight }}
          contentContainerStyle={{ paddingBottom: 8 }}
          showsVerticalScrollIndicator
        >
          <View className={isCompactDiscountModal ? 'mb-1' : 'mb-2'}>
            <Text
              className={`text-gray-700 font-medium ${isCompactDiscountModal ? 'text-sm mb-1' : 'mb-1'}`}
              numberOfLines={1}
            >
              {discountTargetItem.menu_name}
            </Text>
            <Text className={`text-gray-500 ${isCompactDiscountModal ? 'text-xs mb-2' : 'text-sm mb-3'}`}>
              定価: {discountTargetItem.unit_price.toLocaleString()}円
            </Text>
          </View>

          <View className="flex-row gap-2 mb-2">
            <View className={`flex-1 bg-gray-100 rounded-xl ${isCompactDiscountModal ? 'p-3' : 'p-4'}`}>
              <Text className={`text-gray-500 ${isCompactDiscountModal ? 'text-xs' : 'text-sm'}`}>割引額</Text>
              <Text className={`font-bold text-gray-900 text-right ${isCompactDiscountModal ? 'text-xl' : 'text-2xl'}`}>
                {discountNum > 0 ? `${discountNum.toLocaleString()}円` : '---'}
              </Text>
            </View>

            <View className={`flex-1 rounded-xl ${isCompactDiscountModal ? 'p-3' : 'p-4'} ${discountNum > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
              <Text className={`text-gray-500 ${isCompactDiscountModal ? 'text-xs' : 'text-sm'}`}>割引後単価</Text>
              <Text className={`font-bold text-right ${isCompactDiscountModal ? 'text-xl' : 'text-2xl'} ${discountNum > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                {Math.max(0, discountTargetItem.unit_price - discountNum).toLocaleString()}円
              </Text>
            </View>
          </View>

          <View className={isCompactDiscountModal ? 'gap-1.5' : 'gap-2'}>
            {discountNumpadKeys.map((row, rowIndex) => (
              <View key={rowIndex} className={isCompactDiscountModal ? 'flex-row gap-1.5' : 'flex-row gap-2'}>
                {row.map((key) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => onDiscountNumpadPress(key,discountTargetItem.unit_price)}
                    activeOpacity={0.7}
                    className={`flex-1 rounded-xl items-center justify-center ${
                      isCompactDiscountModal ? 'py-2.5' : 'py-3'
                    } ${
                      key === 'clear' ? 'bg-red-100' : key === 'backspace' ? 'bg-gray-200' : 'bg-gray-100'
                    }`}
                  >
                    <Text className={`${isCompactDiscountModal ? 'text-lg' : 'text-xl'} font-bold ${key === 'clear' ? 'text-red-600' : 'text-gray-900'}`}>
                      {key === 'clear' ? 'C' : key === 'backspace' ? '←' : key}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>

          <View className={`flex-row gap-2 ${isCompactDiscountModal ? 'mt-2' : 'mt-3'}`}>
            <TouchableOpacity
              onPress={clearDiscount}
              activeOpacity={0.7}
              className={`flex-1 bg-gray-200 rounded-xl items-center ${isCompactDiscountModal ? 'py-2.5' : 'py-3'}`}
            >
              <Text className={`text-gray-700 font-bold ${isCompactDiscountModal ? 'text-xs' : 'text-sm'}`}>割引解除</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={applyDiscount}
              disabled={discountNum <= 0 || discountNum > discountTargetItem.unit_price}
              activeOpacity={0.8}
              className={`flex-1 rounded-xl items-center ${isCompactDiscountModal ? 'py-2.5' : 'py-3'} ${
                discountNum > 0 && discountNum <= discountTargetItem.unit_price ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <Text className={`text-white font-bold ${isCompactDiscountModal ? 'text-base' : 'text-lg'}`}>適用</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </Modal>
  );

  const mobileOrderBanner =
    canSyncToSupabase && mobileOrderRequests.length > 0 && !showCart ? (
      <View className="mx-4 mt-3 mb-2">
        <TouchableOpacity
          onPress={() => setShowMobileOrderModal(true)}
          className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3"
          activeOpacity={0.8}
        >
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-violet-700 font-bold">モバイルオーダー注文件数</Text>
              <Text className="text-violet-900 text-xl font-bold mt-0.5">{mobileOrderRequests.length}件</Text>
            </View>
            <View className="bg-violet-600 rounded-lg px-3 py-2">
              <Text className="text-white font-semibold text-sm">注文を開く</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    ) : null;

  const mobileOrderModal = (
    <Modal visible={showMobileOrderModal} onClose={() => setShowMobileOrderModal(false)} title="モバイルオーダー注文">
      <ScrollView style={{ maxHeight: 440 }}>
        {mobileOrderRequests.length === 0 ? (
          <Text className="text-gray-500 text-center py-8">現在、注文申請はありません</Text>
        ) : (
          mobileOrderRequests.map((request) => (
            <View key={request.id} className="mb-3 border border-violet-200 rounded-xl px-3 py-3 bg-white">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-violet-800 font-bold">注文番号: {formatOrderNumber2Digits(request.order_number)}</Text>
                <Text className="text-xs text-gray-500">{new Date(request.created_at).toLocaleTimeString()}</Text>
              </View>
              <View className="mb-2">
                {request.items.map((item) => (
                  <Text key={item.id} className="text-gray-700 text-sm">
                    ・{item.menu_name} x{item.quantity}
                  </Text>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => importMobileOrderToCart(request.id)}
                disabled={importingRequestId !== null}
                className={`rounded-lg py-2 ${importingRequestId !== null ? 'bg-gray-300' : 'bg-violet-600'}`}
                activeOpacity={0.8}
              >
                <Text className="text-white text-center font-semibold">
                  {importingRequestId === request.id ? '取り込み中...' : 'この注文をカートに取り込む'}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
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
          rightElement={registerHeaderRight}
        />
        {mobileOrderBanner}

        {showCart ? (
          <CartPanel />
        ) : (
          <>
          {showQuickOrder && quickOrderSection}
            <MenuGrid />

            {/* Floating Cart Button */}
            {cart.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowCart(true)}
                className="absolute left-4 right-4 bg-blue-600 rounded-xl p-4 flex-row items-center justify-between shadow-lg"
                style={{ bottom: keyboardHeight > 0 ? keyboardHeight + 8 : 24 }}
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
        {actionsModal}
        {mobileOrderModal}
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
        rightElement={registerHeaderRight}
      />
      {mobileOrderBanner}

      <View className="flex-1 flex-row">
        {/* Left: Menu List */}
        <View className="flex-1">
          {quickOrderSection}
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
      {actionsModal}
      {mobileOrderModal}
    </SafeAreaView>
  );
};
