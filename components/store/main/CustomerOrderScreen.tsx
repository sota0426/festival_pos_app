/**
 * CustomerOrderScreen
 *
 * 客向けモバイルオーダー画面。認証不要・公開アクセス。
 *
 * アクセス方法:
 *   QRコード: ?branch=S001&table=3  → display_label = "テーブル3番"
 *   タブレット: branchCode + deviceName props → display_label = "タブレットA"
 *
 * フロー:
 *   1. branch_code から branches_public ビューで branch_id を解決
 *   2. menus / menu_categories を未ログインで取得
 *   3. 在庫切れ・非表示メニューは除外
 *   4. カートに追加 → 「注文申請する」→ customer_orders INSERT
 *   5. 完了画面で注文番号・テーブル番号を表示
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import { hasSupabaseEnvConfigured, supabase } from '../../../lib/supabase';
import { getCategoryMetaMap, sortMenusByDisplay, UNCATEGORIZED_VISUAL } from './menuVisuals';
import { saveKioskMode, verifyAdminPassword } from '../../../lib/storage';
import type {
  BranchPublic,
  CustomerIdentifierType,
  CustomerOrder,
  CustomerOrderItem,
  Menu,
  MenuCategory,
} from '../../../types/database';

// ------------------------------------------------------------------
// Props
// ------------------------------------------------------------------
export interface CustomerOrderScreenProps {
  /** URL の ?branch= または StoreHome から渡す branch_code */
  branchCode: string;
  /** QRモード: URL の ?table=3 → "テーブル3番" */
  tableNumber: string | null;
  /** タブレットモード: 端末名 */
  deviceName: string | null;
  /**
   * キオスクモード (タブレット固定) かどうか。
   * true の場合は「戻る」ボタンを非表示にし、🔒ボタンで PIN 認証後のみ戻れる。
   */
  isKioskMode: boolean;
  /**
   * PIN 認証成功後にキオスクモードを解除して管理画面へ戻るコールバック。
   * キオスクモード時のみ使用。
   */
  onExitKiosk: () => Promise<void>;
}

// ------------------------------------------------------------------
// 内部型
// ------------------------------------------------------------------
interface CustomerCartItem {
  menu_id: string;
  menu_name: string;
  unit_price: number;
  quantity: number;
}

interface MenuSection {
  id: string;
  title: string;
  visual: {
    headerBgClass: string;
    headerTextClass: string;
    cardBgClass: string;
    cardBorderClass: string;
  };
  menus: Menu[];
}

// ------------------------------------------------------------------
// ユーティリティ
// ------------------------------------------------------------------

/**
 * 表示用注文番号を生成する。
 * フォーマット: {branch_code の先頭 3 文字}-{4 桁乱数}  例: "S00-0421"
 * ※ DB の PRIMARY KEY は UUID。これはスタッフ向け短縮表示用。
 */
const generateOrderNumber = (branchCode: string): string => {
  const prefix = branchCode.slice(0, 4).toUpperCase();
  const num = Math.floor(Math.random() * 9000 + 1000); // 1000–9999
  return `${prefix}-${num}`;
};

/**
 * セッション ID を取得または生成する。
 * Web では sessionStorage に保存 (タブを閉じるまで維持)。
 * Native では起動ごとに新規生成。
 */
const getOrCreateSessionId = (): string => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const key = 'customer_session_id';
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const newId = crypto.randomUUID();
    sessionStorage.setItem(key, newId);
    return newId;
  }
  // Native: expo-crypto で生成 (同期的に使いたいのでランダム文字列で代替)
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------
export const CustomerOrderScreen: React.FC<CustomerOrderScreenProps> = ({
  branchCode,
  tableNumber,
  deviceName,
  isKioskMode,
  onExitKiosk,
}) => {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  // ---- 識別情報 ----
  const identifierType: CustomerIdentifierType = tableNumber ? 'table' : 'device';
  const tableIdentifier: string = tableNumber ?? deviceName ?? 'タブレット';
  const displayLabel: string = tableNumber
    ? `テーブル${tableNumber}番`
    : (deviceName ?? 'タブレット端末');

  // ---- セッション ID (1回だけ生成) ----
  const sessionId = useRef<string>(getOrCreateSessionId());

  // ---- ブランチ解決 ----
  const [branch, setBranch] = useState<BranchPublic | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [branchLoading, setBranchLoading] = useState(true);

  // ---- メニュー ----
  const [menus, setMenus] = useState<Menu[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);

  // ---- キオスクモード: PIN認証モーダル ----
  const [showLockModal, setShowLockModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinVerifying, setPinVerifying] = useState(false);

  // ---- カート ----
  const [cart, setCart] = useState<CustomerCartItem[]>([]);
  const [showCartSheet, setShowCartSheet] = useState(false);

  // ---- 注文送信 ----
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedOrder, setSubmittedOrder] = useState<{
    order: CustomerOrder;
    items: CustomerOrderItem[];
  } | null>(null);

  // ---- タブレットモード: 端末名入力 ----
  const [deviceNameInput, setDeviceNameInput] = useState(deviceName ?? '');
  const [deviceNameConfirmed, setDeviceNameConfirmed] = useState(!!deviceName || !!tableNumber);

  // ------------------------------------------------------------------
  // 1. ブランチ解決
  // ------------------------------------------------------------------
  useEffect(() => {
    const resolveBranch = async () => {
      if (!hasSupabaseEnvConfigured()) {
        setBranchError('サービスに接続できません。しばらく後でもう一度お試しください。');
        setBranchLoading(false);
        return;
      }
      try {
        // branches_public ビュー: 認証不要で branch_code → id, branch_name を取得
        const { data, error } = await supabase
          .from('branches_public')
          .select('id, branch_code, branch_name')
          .eq('branch_code', branchCode)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          setBranchError('店舗が見つかりません。QRコードをもう一度確認してください。');
        } else {
          setBranch(data as BranchPublic);
        }
      } catch (err) {
        console.error('[CustomerOrderScreen] resolveBranch error:', err);
        setBranchError('店舗情報の取得に失敗しました。');
      } finally {
        setBranchLoading(false);
      }
    };
    void resolveBranch();
  }, [branchCode]);

  // ------------------------------------------------------------------
  // 2. メニュー取得 (ブランチ確定後)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!branch) return;

    const fetchMenus = async () => {
      setMenuLoading(true);
      try {
        const [{ data: remoteMenus, error: menuError }, { data: remoteCategories, error: catError }] =
          await Promise.all([
            supabase
              .from('menus')
              .select('*')
              .eq('branch_id', branch.id)
              .eq('is_active', true)
              .eq('is_show', true)
              .order('sort_order', { ascending: true, nullsFirst: false })
              .order('created_at', { ascending: true }),
            supabase
              .from('menu_categories')
              .select('*')
              .eq('branch_id', branch.id)
              .order('sort_order', { ascending: true }),
          ]);

        if (menuError) throw menuError;
        if (catError) throw catError;

        // 在庫切れメニューを非表示
        const visibleMenus = (remoteMenus ?? []).filter(
          (m) => !(m.stock_management && m.stock_quantity <= 0),
        );

        setMenus(visibleMenus);
        setCategories(remoteCategories ?? []);
      } catch (err) {
        console.error('[CustomerOrderScreen] fetchMenus error:', err);
      } finally {
        setMenuLoading(false);
      }
    };

    void fetchMenus();
  }, [branch]);

  // ------------------------------------------------------------------
  // メニューセクション構築 (menuVisuals と同じロジック)
  // ------------------------------------------------------------------
  const sortMenus = useCallback((list: Menu[]) => sortMenusByDisplay(list), []);

  const { orderedCategories, categoryMetaMap } = useMemo(
    () => getCategoryMetaMap(categories),
    [categories],
  );

  const defaultCategoryId = useMemo(() => {
    if (categories.length === 0) return null;
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
    const food = sorted.find((c) => c.category_name === 'フード');
    return food ? food.id : (sorted[0]?.id ?? null);
  }, [categories]);

  const menuSections = useMemo((): MenuSection[] => {
    if (orderedCategories.length === 0) {
      // カテゴリなし: 全メニューを1セクションに
      if (menus.length === 0) return [];
      return [
        {
          id: 'uncategorized',
          title: 'メニュー',
          visual: UNCATEGORIZED_VISUAL,
          menus: sortMenus(menus),
        },
      ];
    }

    let sections: MenuSection[] = orderedCategories
      .map((category) => ({
        id: category.id,
        title: category.category_name,
        visual: categoryMetaMap.get(category.id)?.visual ?? UNCATEGORIZED_VISUAL,
        menus: sortMenus(menus.filter((m) => m.category_id === category.id)),
      }))
      .filter((s) => s.menus.length > 0);

    const uncategorized = sortMenus(
      menus.filter((m) => !m.category_id || !categories.find((c) => c.id === m.category_id)),
    );

    if (uncategorized.length > 0) {
      const fallbackCategory = orderedCategories.find((c) => c.id === defaultCategoryId);
      const fallbackInSections = sections.find((s) => s.id === defaultCategoryId);

      if (fallbackCategory && fallbackInSections) {
        sections = sections.map((s) =>
          s.id === fallbackCategory.id
            ? { ...s, menus: sortMenus([...s.menus, ...uncategorized]) }
            : s,
        );
      } else if (fallbackCategory && !fallbackInSections) {
        const meta = categoryMetaMap.get(fallbackCategory.id);
        sections.push({
          id: fallbackCategory.id,
          title: fallbackCategory.category_name,
          visual: meta?.visual ?? UNCATEGORIZED_VISUAL,
          menus: uncategorized,
        });
      } else {
        sections.push({
          id: 'uncategorized',
          title: 'フード',
          visual: UNCATEGORIZED_VISUAL,
          menus: uncategorized,
        });
      }
    }

    return sections.filter((s) => s.menus.length > 0);
  }, [orderedCategories, categoryMetaMap, categories, menus, sortMenus, defaultCategoryId]);

  // ------------------------------------------------------------------
  // カート操作
  // ------------------------------------------------------------------
  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
    [cart],
  );
  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  const addToCart = useCallback((menu: Menu) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.menu_id === menu.id);
      if (existing) {
        return prev.map((item) =>
          item.menu_id === menu.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          menu_id: menu.id,
          menu_name: menu.menu_name,
          unit_price: menu.price,
          quantity: 1,
        },
      ];
    });
  }, []);

  const changeQuantity = useCallback((menuId: string, delta: number) => {
    setCart((prev) => {
      const updated = prev
        .map((item) =>
          item.menu_id === menuId ? { ...item, quantity: item.quantity + delta } : item,
        )
        .filter((item) => item.quantity > 0);
      return updated;
    });
  }, []);

  // ------------------------------------------------------------------
  // 注文送信
  // ------------------------------------------------------------------
  const handleSubmit = useCallback(async () => {
    if (cart.length === 0 || submitting || !branch) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const orderId =
        Platform.OS === 'web'
          ? crypto.randomUUID()
          : await Crypto.randomUUID();

      const orderNumber = generateOrderNumber(branch.branch_code);
      const now = new Date().toISOString();

      // 1. 注文ヘッダー INSERT
      const { error: orderError } = await supabase.from('customer_orders').insert({
        id: orderId,
        branch_id: branch.id,
        session_id: sessionId.current,
        identifier_type: identifierType,
        table_identifier: tableIdentifier,
        display_label: displayLabel,
        status: 'pending',
        order_number: orderNumber,
        note: '',
        created_at: now,
        updated_at: now,
      });
      if (orderError) throw orderError;

      // 2. 注文明細 INSERT
      const itemsToInsert = cart.map((item) => ({
        id:
          Platform.OS === 'web'
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2), // Native fallback (UUID は非同期のためここでは簡略化)
        order_id: orderId,
        menu_id: item.menu_id,
        menu_name: item.menu_name,
        unit_price: item.unit_price,
        quantity: item.quantity,
        subtotal: item.unit_price * item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('customer_order_items')
        .insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // 3. 送信完了 → 確認画面へ
      const orderForDisplay: CustomerOrder = {
        id: orderId,
        branch_id: branch.id,
        session_id: sessionId.current,
        identifier_type: identifierType,
        table_identifier: tableIdentifier,
        display_label: displayLabel,
        status: 'pending',
        order_number: orderNumber,
        note: '',
        created_at: now,
        updated_at: now,
      };

      const itemsForDisplay: CustomerOrderItem[] = itemsToInsert.map((item) => ({
        ...item,
        menu_id: item.menu_id,
      }));

      setSubmittedOrder({ order: orderForDisplay, items: itemsForDisplay });
      setCart([]);
      setShowCartSheet(false);
    } catch (err) {
      console.error('[CustomerOrderScreen] handleSubmit error:', err);
      setSubmitError('注文の送信に失敗しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  }, [cart, submitting, branch, identifierType, tableIdentifier, displayLabel]);

  // ------------------------------------------------------------------
  // タブレットモード: 端末名入力画面
  // ------------------------------------------------------------------
  if (!deviceNameConfirmed) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center px-8">
        <View className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-sm">
          <Text className="text-2xl font-bold text-gray-900 mb-2 text-center">端末設定</Text>
          <Text className="text-gray-500 text-sm mb-6 text-center">
            この端末の識別名を入力してください。{'\n'}
            例: 「タブレットA」「カウンター1」
          </Text>
          <TextInput
            value={deviceNameInput}
            onChangeText={setDeviceNameInput}
            placeholder="端末名を入力"
            className="border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-base mb-4"
            autoFocus
            maxLength={20}
          />
          <TouchableOpacity
            onPress={async () => {
              const name = deviceNameInput.trim();
              if (name.length === 0) return;
              // キオスクモードを localStorage に保存 (リロード後も復元できるように)
              if (isKioskMode) {
                await saveKioskMode({
                  enabled: true,
                  branchCode,
                  deviceName: name,
                });
              }
              setDeviceNameConfirmed(true);
            }}
            disabled={deviceNameInput.trim().length === 0}
            className="bg-blue-600 rounded-xl py-3.5 items-center"
            activeOpacity={0.8}
          >
            <Text className="text-white font-bold text-base">確定してキオスクモードを開始</Text>
          </TouchableOpacity>
          <Text className="text-gray-400 text-xs text-center mt-3">
            確定後は管理者PINを入力するまでこの画面から出られません
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------------
  // ブランチ読み込み中
  // ------------------------------------------------------------------
  if (branchLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <Text className="text-gray-500 text-base">読み込み中...</Text>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------------
  // ブランチエラー
  // ------------------------------------------------------------------
  if (branchError || !branch) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center px-8">
        <View className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-sm items-center">
          <Text className="text-4xl mb-4">⚠️</Text>
          <Text className="text-lg font-bold text-gray-900 mb-2 text-center">
            店舗が見つかりません
          </Text>
          <Text className="text-gray-500 text-sm text-center">
            {branchError ?? 'このQRコードは無効です。'}
          </Text>
          {/* キオスクモード中は戻れない。QRモードもそもそも戻り先なし */}
        </View>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------------
  // 注文完了画面
  // ------------------------------------------------------------------
  if (submittedOrder) {
    const { order, items } = submittedOrder;
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

    return (
      <SafeAreaView className="flex-1 bg-green-50 items-center justify-center px-6">
        <View className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-sm">
          <Text className="text-4xl text-center mb-3">✅</Text>
          <Text className="text-xl font-bold text-gray-900 text-center mb-1">
            ご注文ありがとうございます
          </Text>
          <Text className="text-gray-500 text-sm text-center mb-6">
            スタッフが確認次第、対応いたします。
          </Text>

          {/* 識別情報 */}
          <View className="bg-gray-50 rounded-xl p-4 mb-4">
            <View className="flex-row justify-between mb-1">
              <Text className="text-gray-500 text-sm">注文番号</Text>
              <Text className="font-bold text-gray-900 text-sm">{order.order_number}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500 text-sm">識別</Text>
              <Text className="font-bold text-gray-900 text-sm">{order.display_label}</Text>
            </View>
          </View>

          {/* 注文内容 */}
          <Text className="text-gray-700 font-semibold text-sm mb-2">ご注文内容</Text>
          {items.map((item) => (
            <View key={item.id} className="flex-row justify-between py-1">
              <Text className="text-gray-700 text-sm flex-1 mr-2" numberOfLines={1}>
                {item.menu_name} × {item.quantity}
              </Text>
              <Text className="text-gray-600 text-sm">
                ¥{item.subtotal.toLocaleString()}
              </Text>
            </View>
          ))}

          <View className="flex-row justify-between pt-3 mt-2 border-t border-gray-100">
            <Text className="text-gray-700 font-semibold">合計</Text>
            <Text className="font-bold text-blue-600 text-base">
              ¥{total.toLocaleString()}
            </Text>
          </View>

          {/* もう一度注文する */}
          <TouchableOpacity
            onPress={() => setSubmittedOrder(null)}
            className="mt-6 bg-blue-600 rounded-xl py-3.5 items-center"
            activeOpacity={0.8}
          >
            <Text className="text-white font-bold text-base">もう一度注文する</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------------
  // メインUI: メニュー + カート
  // ------------------------------------------------------------------

  // カートシート (モバイル用スライドアップ)
  const cartSheet = (
    <View
      className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-lg"
      style={{ maxHeight: 480 }}
    >
      {/* ヘッダー */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
        <Text className="font-bold text-gray-900 text-base">
          注文内容 ({cartCount}点)
        </Text>
        <TouchableOpacity onPress={() => setShowCartSheet(false)}>
          <Text className="text-gray-400 text-lg">✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="px-5 py-3" showsVerticalScrollIndicator={false}>
        {cart.map((item) => (
          <View key={item.menu_id} className="flex-row items-center py-2.5 border-b border-gray-50">
            <Text className="flex-1 text-gray-800 text-sm mr-2" numberOfLines={1}>
              {item.menu_name}
            </Text>
            {/* 数量操作 */}
            <View className="flex-row items-center gap-2 mr-3">
              <TouchableOpacity
                onPress={() => changeQuantity(item.menu_id, -1)}
                className="w-7 h-7 rounded-full bg-gray-200 items-center justify-center"
              >
                <Text className="text-gray-700 font-bold text-base leading-none">−</Text>
              </TouchableOpacity>
              <Text className="text-gray-900 font-semibold text-sm w-5 text-center">
                {item.quantity}
              </Text>
              <TouchableOpacity
                onPress={() => changeQuantity(item.menu_id, 1)}
                className="w-7 h-7 rounded-full bg-blue-100 items-center justify-center"
              >
                <Text className="text-blue-700 font-bold text-base leading-none">＋</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-gray-700 text-sm w-16 text-right">
              ¥{(item.unit_price * item.quantity).toLocaleString()}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* 合計 + 送信ボタン */}
      <View className="px-5 py-4 border-t border-gray-100">
        <View className="flex-row justify-between mb-3">
          <Text className="text-gray-700 font-semibold">合計</Text>
          <Text className="font-bold text-blue-600 text-lg">
            ¥{cartTotal.toLocaleString()}
          </Text>
        </View>
        {submitError && (
          <Text className="text-red-500 text-xs mb-2 text-center">{submitError}</Text>
        )}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || cart.length === 0}
          className={`rounded-xl py-4 items-center ${submitting || cart.length === 0 ? 'bg-gray-300' : 'bg-green-600'}`}
          activeOpacity={0.8}
        >
          <Text className="text-white font-bold text-base">
            {submitting ? '送信中...' : '注文申請する'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // デスクトップ用サイドカート
  const sideCart = (
    <View className="w-72 bg-white border-l border-gray-200 flex-col">
      {/* ヘッダー */}
      <View className="px-5 pt-5 pb-3 border-b border-gray-100">
        <Text className="font-bold text-gray-900 text-base">注文内容</Text>
        <Text className="text-gray-500 text-xs mt-0.5">{displayLabel}</Text>
      </View>

      {/* カートアイテム */}
      <ScrollView className="flex-1 px-4 py-2" showsVerticalScrollIndicator={false}>
        {cart.length === 0 ? (
          <Text className="text-gray-400 text-sm text-center py-8">
            メニューを選択してください
          </Text>
        ) : (
          cart.map((item) => (
            <View
              key={item.menu_id}
              className="flex-row items-center py-3 border-b border-gray-50"
            >
              <Text className="flex-1 text-gray-800 text-sm mr-1" numberOfLines={2}>
                {item.menu_name}
              </Text>
              <View className="flex-row items-center gap-1.5 mr-2">
                <TouchableOpacity
                  onPress={() => changeQuantity(item.menu_id, -1)}
                  className="w-6 h-6 rounded-full bg-gray-200 items-center justify-center"
                >
                  <Text className="text-gray-700 font-bold text-sm leading-none">−</Text>
                </TouchableOpacity>
                <Text className="text-gray-900 font-semibold text-sm w-5 text-center">
                  {item.quantity}
                </Text>
                <TouchableOpacity
                  onPress={() => changeQuantity(item.menu_id, 1)}
                  className="w-6 h-6 rounded-full bg-blue-100 items-center justify-center"
                >
                  <Text className="text-blue-700 font-bold text-sm leading-none">＋</Text>
                </TouchableOpacity>
              </View>
              <Text className="text-gray-600 text-xs w-14 text-right">
                ¥{(item.unit_price * item.quantity).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* フッター */}
      <View className="px-4 pb-6 pt-3 border-t border-gray-100">
        <View className="flex-row justify-between mb-4">
          <Text className="text-gray-700 font-semibold">合計</Text>
          <Text className="font-bold text-blue-600 text-lg">
            ¥{cartTotal.toLocaleString()}
          </Text>
        </View>
        {submitError && (
          <Text className="text-red-500 text-xs mb-2 text-center">{submitError}</Text>
        )}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || cart.length === 0}
          className={`rounded-xl py-4 items-center ${submitting || cart.length === 0 ? 'bg-gray-300' : 'bg-green-600'}`}
          activeOpacity={0.8}
        >
          <Text className="text-white font-bold text-base">
            {submitting ? '送信中...' : '注文申請する'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* ヘッダー */}
      {/* ---- PIN認証モーダル (キオスクモード専用) ---- */}
      {showLockModal && (
        <View
          className="absolute inset-0 bg-black/60 items-center justify-center z-50"
          // box-none: 背景View自身はタッチを透過、子要素(モーダル本体)は通常通りタッチ可能
          pointerEvents="box-none"
        >
          <View className="bg-white rounded-2xl p-8 w-80 shadow-xl">
            <Text className="text-xl font-bold text-gray-900 text-center mb-1">管理者認証</Text>
            <Text className="text-gray-500 text-sm text-center mb-6">
              管理者PINを入力してください
            </Text>

            {/* PIN 入力: セキュリティのため secureTextEntry */}
            <TextInput
              value={pinInput}
              onChangeText={(v) => { setPinInput(v); setPinError(false); }}
              placeholder="PIN を入力"
              secureTextEntry
              keyboardType="number-pad"
              maxLength={8}
              autoFocus
              className={`border-2 rounded-xl px-4 py-3 text-gray-900 text-base text-center mb-2 ${pinError ? 'border-red-400' : 'border-gray-300'}`}
            />
            {pinError && (
              <Text className="text-red-500 text-xs text-center mb-3">
                PINが正しくありません
              </Text>
            )}

            <View className="flex-row gap-3 mt-2">
              <TouchableOpacity
                onPress={() => { setShowLockModal(false); setPinInput(''); setPinError(false); }}
                className="flex-1 py-3 bg-gray-200 rounded-xl items-center"
                activeOpacity={0.7}
              >
                <Text className="text-gray-700 font-semibold">キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (pinVerifying) return;
                  setPinVerifying(true);
                  try {
                    const ok = await verifyAdminPassword(pinInput);
                    if (ok) {
                      // 認証成功: キオスクモード解除して管理画面へ
                      setShowLockModal(false);
                      setPinInput('');
                      await onExitKiosk();
                    } else {
                      setPinError(true);
                      setPinInput('');
                    }
                  } finally {
                    setPinVerifying(false);
                  }
                }}
                disabled={pinInput.length === 0 || pinVerifying}
                className={`flex-1 py-3 rounded-xl items-center ${pinInput.length === 0 || pinVerifying ? 'bg-gray-300' : 'bg-blue-600'}`}
                activeOpacity={0.8}
              >
                <Text className="text-white font-bold">
                  {pinVerifying ? '確認中...' : '確認'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ---- ヘッダー ---- */}
      <View className="bg-white border-b border-gray-200 px-4 py-3 flex-row items-center justify-between">
        <View>
          <Text className="font-bold text-gray-900 text-base">{branch.branch_name}</Text>
          <Text className="text-gray-500 text-xs">{displayLabel}</Text>
        </View>

        <View className="flex-row items-center gap-2">
          {/* モバイル: カートボタン */}
          {!isWide && cartCount > 0 && (
            <TouchableOpacity
              onPress={() => setShowCartSheet(true)}
              className="bg-blue-600 rounded-full px-4 py-2 flex-row items-center gap-1"
              activeOpacity={0.8}
            >
              <Text className="text-white font-bold text-sm">
                🛒 {cartCount}点 ¥{cartTotal.toLocaleString()}
              </Text>
            </TouchableOpacity>
          )}

          {/* キオスクモード: 管理者用ロックボタン (目立たないが操作可能) */}
          {isKioskMode && (
            <TouchableOpacity
              onPress={() => setShowLockModal(true)}
              className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
              activeOpacity={0.6}
            >
              <Text className="text-base">🔒</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* メインエリア */}
      <View className="flex-1 flex-row">
        {/* メニューグリッド */}
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {menuLoading ? (
            <View className="py-20 items-center">
              <Text className="text-gray-400">メニューを読み込み中...</Text>
            </View>
          ) : menuSections.length === 0 ? (
            <View className="py-20 items-center">
              <Text className="text-gray-400">現在ご注文いただけるメニューがありません</Text>
            </View>
          ) : (
            menuSections.map((section) => (
              <View key={section.id} className="mb-4">
                {/* カテゴリヘッダー */}
                <View
                  className={`px-4 py-2.5 ${section.visual.headerBgClass}`}
                >
                  <Text className={`font-bold text-sm ${section.visual.headerTextClass}`}>
                    {section.title}
                  </Text>
                </View>

                {/* メニューカード */}
                <View className={`${isWide ? 'flex-row flex-wrap' : ''} px-3 pt-3 pb-1`}>
                  {section.menus.map((menu) => {
                    const inCart = cart.find((c) => c.menu_id === menu.id);
                    return (
                      <TouchableOpacity
                        key={menu.id}
                        onPress={() => addToCart(menu)}
                        activeOpacity={0.75}
                        className={`
                          ${isWide ? 'w-40 mr-3' : 'w-full'}
                          mb-3 bg-white rounded-xl border
                          ${section.visual.cardBorderClass}
                          ${inCart ? 'border-blue-400 shadow-sm' : ''}
                          p-3
                        `}
                      >
                        <Text className="text-gray-900 font-semibold text-sm mb-1" numberOfLines={2}>
                          {menu.menu_name}
                        </Text>
                        <View className="flex-row items-center justify-between mt-1">
                          <Text className="text-blue-600 font-bold text-sm">
                            ¥{menu.price.toLocaleString()}
                          </Text>
                          {inCart && (
                            <View className="bg-blue-600 rounded-full w-5 h-5 items-center justify-center">
                              <Text className="text-white text-xs font-bold">
                                {inCart.quantity}
                              </Text>
                            </View>
                          )}
                        </View>
                        {/* 在庫表示 (残り少ない場合のみ) */}
                        {menu.stock_management && menu.stock_quantity <= 5 && (
                          <Text className="text-orange-500 text-xs mt-1">
                            残り{menu.stock_quantity}点
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}
          {/* 下部余白 (モバイルでフローティングボタンに隠れないように) */}
          <View className="h-24" />
        </ScrollView>

        {/* デスクトップ: サイドカート */}
        {isWide && sideCart}
      </View>

      {/* モバイル: カートシート */}
      {!isWide && showCartSheet && cartSheet}
    </SafeAreaView>
  );
};
