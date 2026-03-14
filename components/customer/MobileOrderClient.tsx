import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { Modal } from '../common';
import type { Branch, CartItem, Menu, MenuCategory } from '../../types/database';

interface MobileOrderClientProps {
  branchId: string;
}

type LocalMobileOrderHistoryItem = {
  requestId: string;
  orderNumber: string;
  createdAt: string;
  status: 'requested' | 'accepted' | 'completed' | 'cancelled';
  items: Array<{ menuName: string; quantity: number; subtotal: number }>;
  totalAmount: number;
};

const MOBILE_ORDER_HISTORY_KEY_PREFIX = '@festival_pos/mobile_order_history';

const sortMenus = (list: Menu[]): Menu[] =>
  [...list].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.menu_name.localeCompare(b.menu_name);
  });

const statusLabel = (status: LocalMobileOrderHistoryItem['status']): string => {
  if (status === 'requested') return '申請中';
  if (status === 'accepted') return '会計中';
  if (status === 'completed') return '注文完了';
  if (status === 'cancelled') return 'キャンセル済み';
  return status;
};

const formatOrderNumber2Digits = (value: string | number): string => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return '00';
  const normalized = ((parsed - 1) % 99) + 1;
  return String(normalized).padStart(2, '0');
};

export const MobileOrderClient = ({ branchId }: MobileOrderClientProps) => {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedOrder, setSubmittedOrder] = useState<LocalMobileOrderHistoryItem | null>(null);
  const [orderHistory, setOrderHistory] = useState<LocalMobileOrderHistoryItem[]>([]);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<LocalMobileOrderHistoryItem | null>(null);

  const historyStorageKey = `${MOBILE_ORDER_HISTORY_KEY_PREFIX}/${branchId}`;

  const saveOrderHistory = useCallback(async (next: LocalMobileOrderHistoryItem[]) => {
    setOrderHistory(next);
    await AsyncStorage.setItem(historyStorageKey, JSON.stringify(next));
  }, [historyStorageKey]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [
          { data: branchData, error: branchError },
          { data: menuData, error: menuError },
          { data: categoryData, error: categoryError },
        ] = await Promise.all([
          supabase.from('branches').select('*').eq('id', branchId).maybeSingle(),
          supabase
            .from('menus')
            .select('*')
            .eq('branch_id', branchId)
            .eq('is_active', true)
            .eq('is_show', true),
          supabase
            .from('menu_categories')
            .select('*')
            .eq('branch_id', branchId)
            .order('sort_order', { ascending: true }),
        ]);

        if (branchError) throw branchError;
        if (menuError) throw menuError;
        if (categoryError) throw categoryError;
        if (!branchData) throw new Error('店舗が見つかりませんでした');

        setBranch(branchData as Branch);
        setMenus(sortMenus((menuData ?? []) as Menu[]));
        setCategories((categoryData ?? []) as MenuCategory[]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'モバイルオーダー画面の読み込みに失敗しました';
        setErrorMessage(message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [branchId]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const raw = await AsyncStorage.getItem(historyStorageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw) as LocalMobileOrderHistoryItem[];
        setOrderHistory(Array.isArray(parsed) ? parsed : []);
      } catch (error) {
        console.error('Failed to load mobile order history:', error);
      }
    };
    void loadHistory();
  }, [historyStorageKey]);

  useEffect(() => {
    if (orderHistory.length === 0) return;
    const refreshStatuses = async () => {
      try {
        const requestIds = orderHistory.map((item) => item.requestId);
        const { data, error } = await supabase
          .from('mobile_order_requests')
          .select('id,status')
          .in('id', requestIds);
        if (error) throw error;

        const statusById = new Map<string, LocalMobileOrderHistoryItem['status']>();
        (data ?? []).forEach((row) => {
          const value = String(row.status ?? '');
          if (value === 'requested' || value === 'accepted' || value === 'completed' || value === 'cancelled') {
            statusById.set(String(row.id), value);
          }
        });

        const nextHistory: LocalMobileOrderHistoryItem[] = orderHistory.map((item) => ({
          ...item,
          status: statusById.get(item.requestId) ?? item.status,
        }));

        const changed = nextHistory.some((item, index) => item.status !== orderHistory[index]?.status);
        if (changed) {
          await saveOrderHistory(nextHistory);
          setSubmittedOrder((prev) =>
            prev ? { ...prev, status: statusById.get(prev.requestId) ?? prev.status } : prev,
          );
        }
      } catch (error) {
        console.error('Failed to refresh mobile order statuses:', error);
      }
    };

    void refreshStatuses();
    const timer = setInterval(() => {
      void refreshStatuses();
    }, 10000);
    return () => clearInterval(timer);
  }, [orderHistory, saveOrderHistory]);

  const totalAmount = useMemo(() => cart.reduce((sum, item) => sum + item.subtotal, 0), [cart]);

  const confirmAction = async (title: string, message: string): Promise<boolean> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.confirm(`${title}\n\n${message}`);
    }
    return await new Promise<boolean>((resolve) => {
      Alert.alert(title, message, [
        { text: 'いいえ', style: 'cancel', onPress: () => resolve(false) },
        { text: 'はい', onPress: () => resolve(true) },
      ]);
    });
  };

  const categoryMap = useMemo(() => {
    const grouped = new Map<string, Menu[]>();
    const uncategorized: Menu[] = [];
    menus.forEach((menu) => {
      if (!menu.category_id) {
        uncategorized.push(menu);
        return;
      }
      const exists = categories.some((c) => c.id === menu.category_id);
      if (!exists) {
        uncategorized.push(menu);
        return;
      }
      const current = grouped.get(menu.category_id) ?? [];
      current.push(menu);
      grouped.set(menu.category_id, current);
    });
    return { grouped, uncategorized };
  }, [menus, categories]);

  const getStockBadge = (menu: Menu): { text: string; className: string } | null => {
    if (!menu.stock_management) return null;
    if (menu.stock_quantity <= 0) {
      return { text: '売り切れ', className: 'text-red-600' };
    }
    if (menu.stock_quantity <= 10) {
      return { text: `残りわずか（残り${menu.stock_quantity}）`, className: 'text-orange-600' };
    }
    return null;
  };

  const addToCart = (menu: Menu) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.menu_id === menu.id);
      if (!existing) {
        return [
          ...prev,
          {
            menu_id: menu.id,
            menu_name: menu.menu_name,
            unit_price: menu.price,
            discount: 0,
            quantity: 1,
            subtotal: menu.price,
          },
        ];
      }
      return prev.map((item) =>
        item.menu_id === menu.id
          ? {
              ...item,
              quantity: item.quantity + 1,
              subtotal: (item.quantity + 1) * item.unit_price,
            }
          : item,
      );
    });
  };

  const updateCart = (menuId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.menu_id === menuId
            ? {
                ...item,
                quantity: item.quantity + delta,
                subtotal: (item.quantity + delta) * item.unit_price,
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const submitOrderRequest = async () => {
    if (!branch || cart.length === 0) return;
    const orderLines = cart.map((item) => `・${item.menu_name} x${item.quantity}`);
    const confirmMessage = `${orderLines.join('\n')}\n\n合計（参考）: ${totalAmount.toLocaleString()}円\n\nこの内容で注文申請を行います。よろしいですか？`;
    const confirmed = await confirmAction(
      '注文申請の確認',
      confirmMessage,
    );
    if (!confirmed) return;
    setSubmitting(true);
    try {
      const nowDate = new Date();
      const todayStart = new Date(nowDate);
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);

      const { data: todayOrders, error: fetchOrderNumberError } = await supabase
        .from('mobile_order_requests')
        .select('order_number')
        .eq('branch_id', branch.id)
        .gte('created_at', todayStart.toISOString())
        .lt('created_at', tomorrowStart.toISOString());
      if (fetchOrderNumberError) throw fetchOrderNumberError;

      const maxOrderNumber = (todayOrders ?? []).reduce((max, row) => {
        const parsed = Number.parseInt(String(row.order_number ?? ''), 10);
        return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
      }, 0);
      const nextOrderNumber = maxOrderNumber >= 99 ? 1 : maxOrderNumber + 1;
      const orderNumber = String(nextOrderNumber).padStart(2, '0');
      const requestId = Crypto.randomUUID();
      const now = nowDate.toISOString();

      const { error: requestError } = await supabase.from('mobile_order_requests').insert({
        id: requestId,
        branch_id: branch.id,
        order_number: orderNumber,
        status: 'requested',
        created_at: now,
        updated_at: now,
      });
      if (requestError) throw requestError;

      const items = cart.map((item) => ({
        id: Crypto.randomUUID(),
        request_id: requestId,
        menu_id: item.menu_id,
        menu_name: item.menu_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        created_at: now,
      }));
      const { error: itemError } = await supabase.from('mobile_order_request_items').insert(items);
      if (itemError) throw itemError;

      const historyEntry: LocalMobileOrderHistoryItem = {
        requestId,
        orderNumber,
        createdAt: now,
        status: 'requested',
        items: cart.map((item) => ({
          menuName: item.menu_name,
          quantity: item.quantity,
          subtotal: item.subtotal,
        })),
        totalAmount: cart.reduce((sum, item) => sum + item.subtotal, 0),
      };
      const nextHistory = [historyEntry, ...orderHistory].slice(0, 50);
      await saveOrderHistory(nextHistory);
      setSubmittedOrder(historyEntry);
      setCart([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '注文申請に失敗しました';
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelOrderRequest = async (requestId: string) => {
    const confirmed = await confirmAction(
      '注文キャンセルの確認',
      'この注文申請をキャンセルします。よろしいですか？',
    );
    if (!confirmed) return;
    setCancellingOrderId(requestId);
    try {
      const { error } = await supabase
        .from('mobile_order_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)
        .eq('status', 'requested');
      if (error) throw error;

      const nextHistory: LocalMobileOrderHistoryItem[] = orderHistory.map((item) =>
        item.requestId === requestId ? { ...item, status: 'cancelled' } : item,
      );
      await saveOrderHistory(nextHistory);
      setSubmittedOrder((prev) =>
        prev && prev.requestId === requestId ? { ...prev, status: 'cancelled' } : prev,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '注文キャンセルに失敗しました';
      setErrorMessage(message);
    } finally {
      setCancellingOrderId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-gray-500">読み込み中...</Text>
      </SafeAreaView>
    );
  }

  if (errorMessage || !branch) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-red-600 text-base font-semibold text-center">モバイルオーダーを表示できません</Text>
        <Text className="text-gray-500 text-sm mt-2 text-center">{errorMessage ?? '無効なQRコードです'}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white border-b border-gray-200 px-4 py-3">
        <Text className="text-lg font-bold text-gray-900">{branch.branch_name}</Text>
        <Text className="text-xs text-gray-500 mt-0.5">商品を選んで「注文申請を行う」を押してください</Text>
        <Text className="text-[11px] text-amber-700 mt-1">
          ※ 在庫は変動するため、会計時に売り切れの場合があります。
        </Text>
      </View>

      {submittedOrder ? (
        <View className="mx-4 mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <Text className="text-emerald-800 text-sm font-semibold">注文申請完了</Text>
          <Text className="text-emerald-900 text-2xl font-bold mt-1">注文番号: {formatOrderNumber2Digits(submittedOrder.orderNumber)}</Text>
          <Text className="text-emerald-700 text-xs mt-2">この番号をスタッフへお伝えください。</Text>
          <View className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2">
            {submittedOrder.items.map((item, index) => (
              <Text key={`${submittedOrder.requestId}-${index}`} className="text-gray-700 text-sm">
                ・{item.menuName} x{item.quantity}
              </Text>
            ))}
            <Text className="text-gray-900 font-semibold mt-1">合計（参考）: {submittedOrder.totalAmount.toLocaleString()}円</Text>
          </View>
          {submittedOrder.status === 'requested' ? (
            <View className="mt-3">
              <Text className="text-xs text-gray-600">注文を間違えた場合は、こちらを押してください。</Text>
              <TouchableOpacity
                onPress={() => cancelOrderRequest(submittedOrder.requestId)}
                disabled={cancellingOrderId !== null}
                className="mt-1"
                activeOpacity={0.8}
              >
                <Text className="text-xs text-red-600 underline">
                  {cancellingOrderId === submittedOrder.requestId ? 'キャンセル中...' : '注文をキャンセルする'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text className="text-xs text-gray-600 mt-3">
              状態: {statusLabel(submittedOrder.status)}
            </Text>
          )}
        </View>
      ) : null}

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 180 }}>
        {orderHistory.length > 0 ? (
          <View className="mb-5 bg-gray-100 border border-gray-200 rounded-2xl p-3">
            <TouchableOpacity
              onPress={() => setShowHistory((prev) => !prev)}
              activeOpacity={0.8}
              className="flex-row items-center justify-between"
            >
              <Text className="text-sm font-semibold text-gray-700">この端末の注文履歴（直近5件）</Text>
              <Text className="text-xs text-gray-500">{showHistory ? '閉じる' : '表示'}</Text>
            </TouchableOpacity>
            {showHistory ? (
              <View className="gap-2 mt-2">
                {orderHistory.slice(0, 5).map((history) => (
                  <TouchableOpacity
                    key={history.requestId}
                    onPress={() => setSelectedHistoryOrder(history)}
                    activeOpacity={0.8}
                    className="bg-white border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-gray-800 text-sm font-semibold">#{formatOrderNumber2Digits(history.orderNumber)}</Text>
                      <Text className="text-[11px] text-gray-500">{statusLabel(history.status)}</Text>
                    </View>
                    <Text className="text-[11px] text-gray-500 mt-0.5">{new Date(history.createdAt).toLocaleString()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View className="mb-4">
          <Text className="text-lg font-bold text-gray-900">注文メニュー</Text>
          <Text className="text-xs text-gray-500 mt-0.5">商品をタップして追加してください</Text>
        </View>

        {categories.length > 0
          ? categories.map((category) => {
              const list = categoryMap.grouped.get(category.id) ?? [];
              if (list.length === 0) return null;
              return (
                <View key={category.id} className="mb-5">
                  <View className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mb-2">
                    <Text className="text-base font-bold text-blue-900">{category.category_name}</Text>
                  </View>
                  <View className="gap-2">
                    {list.map((menu) => {
                      const stockBadge = getStockBadge(menu);
                      const isSoldOut = menu.stock_management && menu.stock_quantity <= 0;
                      return (
                        <TouchableOpacity
                          key={menu.id}
                          onPress={() => addToCart(menu)}
                          disabled={isSoldOut}
                          className={`bg-white border border-gray-200 rounded-xl px-4 py-3 ${isSoldOut ? 'opacity-50' : ''}`}
                          activeOpacity={0.8}
                        >
                          <View className="flex-row items-center justify-between">
                            <View className="flex-1 pr-3">
                              <Text className="text-gray-900 font-semibold text-base">{menu.menu_name}</Text>
                              <Text className="text-blue-700 font-bold mt-0.5">{menu.price.toLocaleString()}円</Text>
                              {stockBadge ? (
                                <Text className={`text-xs mt-1 font-semibold ${stockBadge.className}`}>
                                  {stockBadge.text}
                                </Text>
                              ) : null}
                            </View>
                            <View className="w-8 h-8 rounded-full bg-blue-600 items-center justify-center">
                              <Text className="text-white text-lg font-bold">+</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })
          : null}

        <View className="gap-2">
          {(categories.length === 0 ? menus : categoryMap.uncategorized).map((menu) => {
            const stockBadge = getStockBadge(menu);
            const isSoldOut = menu.stock_management && menu.stock_quantity <= 0;
            return (
              <TouchableOpacity
                key={menu.id}
                onPress={() => addToCart(menu)}
                disabled={isSoldOut}
                className={`bg-white border border-gray-200 rounded-xl px-4 py-3 ${isSoldOut ? 'opacity-50' : ''}`}
                activeOpacity={0.8}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-gray-900 font-semibold text-base">{menu.menu_name}</Text>
                    <Text className="text-blue-700 font-bold mt-0.5">{menu.price.toLocaleString()}円</Text>
                    {stockBadge ? (
                      <Text className={`text-xs mt-1 font-semibold ${stockBadge.className}`}>
                        {stockBadge.text}
                      </Text>
                    ) : null}
                  </View>
                  <View className="w-8 h-8 rounded-full bg-blue-600 items-center justify-center">
                    <Text className="text-white text-lg font-bold">+</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3">
        <Text className="text-gray-800 font-semibold mb-2">選択中 {cart.reduce((sum, item) => sum + item.quantity, 0)}点</Text>
        <View className="max-h-32">
          <ScrollView>
            {cart.map((item) => (
              <View key={item.menu_id} className="flex-row items-center justify-between py-1.5">
                <Text className="text-gray-700 flex-1 mr-2" numberOfLines={1}>
                  {item.menu_name}
                </Text>
                <View className="flex-row items-center">
                  <TouchableOpacity onPress={() => updateCart(item.menu_id, -1)} className="w-7 h-7 rounded bg-gray-200 items-center justify-center">
                    <Text className="text-gray-800 font-bold">-</Text>
                  </TouchableOpacity>
                  <Text className="mx-2 w-6 text-center text-gray-800 font-semibold">{item.quantity}</Text>
                  <TouchableOpacity onPress={() => updateCart(item.menu_id, 1)} className="w-7 h-7 rounded bg-gray-200 items-center justify-center">
                    <Text className="text-gray-800 font-bold">+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
        <View className="flex-row items-center justify-between mt-2">
          <Text className="text-gray-900 font-bold">合計（参考）</Text>
          <Text className="text-gray-900 text-lg font-bold">{totalAmount.toLocaleString()}円</Text>
        </View>
        <Text className="text-[11px] text-amber-700 mt-2">
          ※ 在庫は変動するため、会計時に売り切れの場合があります。
        </Text>
        <TouchableOpacity
          onPress={submitOrderRequest}
          disabled={cart.length === 0 || submitting}
          className={`mt-3 rounded-xl py-3 ${cart.length === 0 || submitting ? 'bg-gray-300' : 'bg-blue-600'}`}
          activeOpacity={0.85}
        >
          <Text className="text-white text-center font-bold">
            {submitting ? '送信中...' : '注文申請を行う'}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={!!selectedHistoryOrder}
        onClose={() => setSelectedHistoryOrder(null)}
        title="注文詳細"
      >
        {selectedHistoryOrder ? (
          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            <View className="mb-2">
              <Text className="text-sm text-gray-500">注文番号</Text>
              <Text className="text-lg font-bold text-gray-900">
                #{formatOrderNumber2Digits(selectedHistoryOrder.orderNumber)}
              </Text>
            </View>
            <View className="mb-2">
              <Text className="text-sm text-gray-500">状態</Text>
              <Text className="text-base font-semibold text-gray-900">{statusLabel(selectedHistoryOrder.status)}</Text>
            </View>
            <View className="mb-3">
              <Text className="text-sm text-gray-500">申請時刻</Text>
              <Text className="text-sm text-gray-800">{new Date(selectedHistoryOrder.createdAt).toLocaleString()}</Text>
            </View>
            <View className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 mb-3">
              {selectedHistoryOrder.items.map((item, index) => (
                <Text key={`${selectedHistoryOrder.requestId}-detail-${index}`} className="text-sm text-gray-800 mb-1">
                  ・{item.menuName} x{item.quantity}（{item.subtotal.toLocaleString()}円）
                </Text>
              ))}
            </View>
            <Text className="text-base font-bold text-gray-900">
              合計（参考）: {selectedHistoryOrder.totalAmount.toLocaleString()}円
            </Text>
            <TouchableOpacity
              onPress={() => setSelectedHistoryOrder(null)}
              activeOpacity={0.8}
              className="mt-4 rounded-lg bg-gray-200 py-2.5"
            >
              <Text className="text-center text-gray-800 font-semibold">閉じる</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
};
