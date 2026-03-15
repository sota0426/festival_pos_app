import { useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../common';
import { DEMO_MENU_CATEGORIES, DEMO_MENUS, resolveDemoBranchId } from '../../data/demoData';
import type { Branch, CartItem, Menu, MenuCategory } from '../../types/database';

interface DemoMobileOrderClientProps {
  branch: Branch;
  onBack: () => void;
}

const sortMenus = (list: Menu[]): Menu[] =>
  [...list].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.menu_name.localeCompare(b.menu_name, 'ja');
  });

export const DemoMobileOrderClient = ({ branch, onBack }: DemoMobileOrderClientProps) => {
  const insets = useSafeAreaInsets();
  const demoBranchId = resolveDemoBranchId(branch);
  const categories = useMemo<MenuCategory[]>(
    () => (demoBranchId ? DEMO_MENU_CATEGORIES[demoBranchId] ?? [] : []),
    [demoBranchId],
  );
  const menus = useMemo<Menu[]>(
    () => sortMenus(demoBranchId ? DEMO_MENUS[demoBranchId] ?? [] : []),
    [demoBranchId],
  );
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submittedOrderNumber, setSubmittedOrderNumber] = useState<string | null>(null);

  const categoryMap = useMemo(() => {
    const grouped = new Map<string, Menu[]>();
    const uncategorized: Menu[] = [];
    menus.forEach((menu) => {
      if (!menu.category_id) {
        uncategorized.push(menu);
        return;
      }
      const current = grouped.get(menu.category_id) ?? [];
      current.push(menu);
      grouped.set(menu.category_id, current);
    });
    return { grouped, uncategorized };
  }, [menus]);

  const totalAmount = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const panelBottomPadding = Math.max(insets.bottom, 12);

  const addToCart = (menu: Menu) => {
    setSubmittedOrderNumber(null);
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

  const handleSubmitDemoOrder = () => {
    if (cart.length === 0) return;
    const nextNumber = String((totalCount % 9) + 1).padStart(2, '0');
    setSubmittedOrderNumber(nextNumber);
    setCart([]);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      <Header
        title="モバイルオーダー体験"
        subtitle={`${branch.branch_name} のお客様向けダミー画面`}
        showBack
        onBack={onBack}
      />

      <View className="mx-4 mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
        <Text className="text-sm font-bold text-sky-900">デモ用プレビュー</Text>
        <Text className="mt-1 text-xs leading-5 text-sky-800">
          実際の送信は行わず、注文フローの見え方だけ確認できます。
        </Text>
      </View>

      {submittedOrderNumber ? (
        <View className="mx-4 mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
          <Text className="text-sm font-semibold text-emerald-800">注文申請完了イメージ</Text>
          <Text className="mt-1 text-3xl font-black text-emerald-900">番号 {submittedOrderNumber}</Text>
          <Text className="mt-2 text-xs text-emerald-800">
            この番号をスタッフへ伝える想定です。デモのため保存はされません。
          </Text>
        </View>
      ) : null}

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: panelBottomPadding + 170 }}
      >
        {categories.map((category) => {
          const list = categoryMap.grouped.get(category.id) ?? [];
          if (list.length === 0) return null;
          return (
            <View key={category.id} className="mb-5">
              <View className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <Text className="text-base font-bold text-slate-900">{category.category_name}</Text>
              </View>
              <View className="gap-2">
                {list.map((menu) => (
                  <TouchableOpacity
                    key={menu.id}
                    onPress={() => addToCart(menu)}
                    activeOpacity={0.85}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text className="text-base font-semibold text-slate-900">{menu.menu_name}</Text>
                        <Text className="mt-1 text-sm font-bold text-sky-700">{menu.price.toLocaleString()}円</Text>
                      </View>
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-sky-600">
                        <Text className="text-lg font-bold text-white">+</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}

        {categoryMap.uncategorized.length > 0 ? (
          <View className="gap-2">
            {categoryMap.uncategorized.map((menu) => (
              <TouchableOpacity
                key={menu.id}
                onPress={() => addToCart(menu)}
                activeOpacity={0.85}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-semibold text-slate-900">{menu.menu_name}</Text>
                    <Text className="mt-1 text-sm font-bold text-sky-700">{menu.price.toLocaleString()}円</Text>
                  </View>
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-sky-600">
                    <Text className="text-lg font-bold text-white">+</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View
        className="absolute left-0 right-0 border-t border-slate-200 bg-white px-4 py-3"
        style={{ bottom: 0, paddingBottom: panelBottomPadding }}
      >
        <Text className="mb-2 text-sm font-semibold text-slate-800">選択中 {totalCount}点</Text>
        <View className="max-h-28">
          <ScrollView>
            {cart.map((item) => (
              <View key={item.menu_id} className="flex-row items-center justify-between py-1.5">
                <Text className="mr-2 flex-1 text-sm text-slate-700" numberOfLines={1}>
                  {item.menu_name}
                </Text>
                <View className="flex-row items-center">
                  <TouchableOpacity
                    onPress={() => updateCart(item.menu_id, -1)}
                    className="h-7 w-7 items-center justify-center rounded bg-slate-200"
                  >
                    <Text className="font-bold text-slate-800">-</Text>
                  </TouchableOpacity>
                  <Text className="mx-2 w-6 text-center font-semibold text-slate-800">{item.quantity}</Text>
                  <TouchableOpacity
                    onPress={() => updateCart(item.menu_id, 1)}
                    className="h-7 w-7 items-center justify-center rounded bg-slate-200"
                  >
                    <Text className="font-bold text-slate-800">+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="font-bold text-slate-900">合計（参考）</Text>
          <Text className="text-lg font-bold text-slate-900">{totalAmount.toLocaleString()}円</Text>
        </View>
        <TouchableOpacity
          onPress={handleSubmitDemoOrder}
          disabled={cart.length === 0}
          activeOpacity={0.85}
          className={`mt-3 rounded-xl py-3 ${cart.length === 0 ? 'bg-slate-300' : 'bg-sky-600'}`}
        >
          <Text className="text-center font-bold text-white">注文申請を試す</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
