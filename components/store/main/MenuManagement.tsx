import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Switch, ActivityIndicator, ScrollView, TextInput, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { Button, Input, Card, Header, Modal } from '../../common';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { saveMenus, getMenus, saveMenuCategories, getMenuCategories, verifyAdminPassword } from '../../../lib/storage';
import { alertConfirm } from '../../../lib/alertUtils';
import type { Branch, Menu, MenuCategory } from '../../../types/database';
import { buildMenuCodeMap, getCategoryMetaMap, sortMenusByDisplay, UNCATEGORIZED_VISUAL } from './menuVisuals';

interface MenuManagementProps {
  branch: Branch;
  onBack: () => void;
}

export const MenuManagement = ({ branch, onBack }: MenuManagementProps) => {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'menus' | 'categories'>('menus');

  // Form state
  const [menuName, setMenuName] = useState('');
  const [price, setPrice] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [stockManagement, setStockManagement] = useState(false);
  const [stockQuantity, setStockQuantity] = useState('');

  // Category form state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [deleteAllError, setDeleteAllError] = useState('');
  const [deletingAll, setDeletingAll] = useState(false);

  const sortMenus = useCallback((list: Menu[]) => sortMenusByDisplay(list), []);

  const getNextSortOrder = useCallback(
    (categoryId: string | null, targetMenus: Menu[]) => {
      const sameCategory = targetMenus.filter((menu) => menu.category_id === categoryId);
      if (sameCategory.length === 0) return 0;
      const maxOrder = Math.max(...sameCategory.map((menu) => menu.sort_order ?? 0));
      return maxOrder + 1;
    },
    [],
  );

  const fetchCategories = useCallback(async () => {
    try {
      const localCategories = await getMenuCategories();
      const branchCategories = localCategories.filter((c) => c.branch_id === branch.id);

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from('menu_categories')
          .select('*')
          .eq('branch_id', branch.id)
          .order('sort_order', { ascending: true });

        if (!error && data) {
          setCategories(data);
          // Merge with other branches' categories in local storage
          const otherCategories = localCategories.filter((c) => c.branch_id !== branch.id);
          await saveMenuCategories([...otherCategories, ...data]);
          return;
        }
      }

      setCategories(branchCategories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      const localCategories = await getMenuCategories();
      setCategories(localCategories.filter((c) => c.branch_id === branch.id));
    }
  }, [branch.id]);

  const fetchMenus = useCallback(async () => {
    try {
      // First try to get from local storage
      const localMenus = await getMenus();
      const branchMenus = localMenus.filter((menu) => menu.branch_id === branch.id);

      if (!isSupabaseConfigured()) {
        if (branchMenus.length > 0) {
          setMenus(sortMenus(branchMenus));
        } else {
          // Demo data
          const demoMenus: Menu[] = [
            {
              id: '1',
              branch_id: branch.id,
              menu_name: '焼きそば',
              price: 300,
              sort_order: 0,
              category_id: null,
              stock_management: true,
              stock_quantity: 50,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: '2',
              branch_id: branch.id,
              menu_name: 'フランクフルト',
              price: 200,
              sort_order: 1,
              category_id: null,
              stock_management: true,
              stock_quantity: 30,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: '3',
              branch_id: branch.id,
              menu_name: 'ジュース',
              price: 100,
              sort_order: 2,
              category_id: null,
              stock_management: false,
              stock_quantity: 0,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ];
          const sortedDemoMenus = sortMenus(demoMenus);
          setMenus(sortedDemoMenus);
          await saveMenus(sortedDemoMenus);
        }
        setLoading(false);
        return;
      }

      // Fetch from Supabase
      const { data, error } = await supabase
        .from('menus')
        .select('*')
        .eq('branch_id', branch.id)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (error) throw error;

      const sortedMenus = sortMenus(data || []);
      setMenus(sortedMenus);
      await saveMenus(sortedMenus);
    } catch (error:any) {
      if (error?.name === 'AbortError') return;
      console.error('Error fetching menus:', error);
      // Use local data as fallback
      const localMenus = await getMenus();
      setMenus(sortMenus(localMenus.filter((m) => m.branch_id === branch.id)));
    } finally {
      setLoading(false);
    }
  }, [branch.id, sortMenus]);

  useEffect(() => {
    fetchMenus();
    fetchCategories();
  }, [fetchMenus, fetchCategories]);

  const resetForm = () => {
    setMenuName('');
    setPrice('');
    setSelectedCategoryId(null);
    setStockManagement(false);
    setStockQuantity('');
  };

  const handleAddMenu = async () => {
    if (!menuName.trim() || !price.trim()) {
      Alert.alert('エラー', 'メニュー名と金額を入力してください');
      return;
    }

    setSaving(true);

    try {
      const newMenu: Menu = {
        id: Crypto.randomUUID(),
        branch_id: branch.id,
        menu_name: menuName.trim(),
        price: parseInt(price, 10),
        sort_order: getNextSortOrder(selectedCategoryId, menus),
        category_id: selectedCategoryId,
        stock_management: stockManagement,
        stock_quantity: stockManagement ? parseInt(stockQuantity, 10) || 0 : 0,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('menus').insert(newMenu);
        if (error) throw error;
      }

      const updatedMenus = sortMenus([...menus, newMenu]);
      setMenus(updatedMenus);
      await saveMenus(updatedMenus);

      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error('Error adding menu:', error);
      Alert.alert('エラー', 'メニューの追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleEditMenu = async () => {
    if (!editingMenu || !menuName.trim() || !price.trim()) {
      Alert.alert('エラー', 'メニュー名と金額を入力してください');
      return;
    }

    setSaving(true);

    try {
      const previousCategoryId = editingMenu.category_id;
      const updatedMenu: Menu = {
        ...editingMenu,
        menu_name: menuName.trim(),
        price: parseInt(price, 10),
        category_id: selectedCategoryId,
        sort_order:
          previousCategoryId === selectedCategoryId
            ? editingMenu.sort_order ?? getNextSortOrder(selectedCategoryId, menus)
            : getNextSortOrder(selectedCategoryId, menus.filter((m) => m.id !== editingMenu.id)),
        stock_management: stockManagement,
        stock_quantity: stockManagement ? parseInt(stockQuantity, 10) || 0 : editingMenu.stock_quantity,
        updated_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('menus')
          .update(updatedMenu)
          .eq('id', editingMenu.id);
        if (error) throw error;
      }

      const updatedMenus = sortMenus(menus.map((m) => (m.id === editingMenu.id ? updatedMenu : m)));
      setMenus(updatedMenus);
      await saveMenus(updatedMenus);

      setShowEditModal(false);
      setEditingMenu(null);
      resetForm();
    } catch (error) {
      console.error('Error updating menu:', error);
      Alert.alert('エラー', 'メニューの更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMenu = (menu: Menu) => {
    alertConfirm('確認', `「${menu.menu_name}」を削除しますか？`, async () => {
      try {
        if (isSupabaseConfigured()) {
          const { error } = await supabase.from('menus').delete().eq('id', menu.id);
          if (error) throw error;
        }

        const updatedMenus = menus.filter((m) => m.id !== menu.id);
        setMenus(updatedMenus);
        await saveMenus(updatedMenus);
      } catch (error) {
        console.error('Error deleting menu:', error);
        Alert.alert('エラー', 'メニューの削除に失敗しました');
      }
    }, '削除');
  };

  const executeDeleteAllMenus = async () => {
    setDeletingAll(true);
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('menus')
          .delete()
          .eq('branch_id', branch.id);
        if (error) throw error;
      }

      const localMenus = await getMenus();
      const remaining = localMenus.filter((m) => m.branch_id !== branch.id);
      await saveMenus(remaining);
      setMenus([]);

      setShowDeleteAllModal(false);
      setAdminPasswordInput('');
      setDeleteAllError('');
    } catch (error) {
      console.error('Error deleting all menus:', error);
      setDeleteAllError('メニューの全削除に失敗しました');
    } finally {
      setDeletingAll(false);
    }
  };

  const handleDeleteAllMenus = async () => {
    if (!adminPasswordInput.trim()) {
      setDeleteAllError('管理者パスワードを入力してください');
      return;
    }

    const isValid = await verifyAdminPassword(adminPasswordInput);
    if (!isValid) {
      setDeleteAllError('パスワードが正しくありません');
      return;
    }

    alertConfirm(
      '最終確認',
      'この店舗のメニューを全削除します。この操作は取り消せません。実行しますか？',
      executeDeleteAllMenus,
      '削除する',
    );
  };

  const handleStockChange = async (menu: Menu, change: number) => {
    const newQuantity = Math.max(0, menu.stock_quantity + change);

    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('menus')
          .update({ stock_quantity: newQuantity, updated_at: new Date().toISOString() })
          .eq('id', menu.id);
        if (error) throw error;
      }

      const updatedMenus = menus.map((m) =>
        m.id === menu.id ? { ...m, stock_quantity: newQuantity, updated_at: new Date().toISOString() } : m
      );
      setMenus(updatedMenus);
      await saveMenus(updatedMenus);
    } catch (error) {
      console.error('Error updating stock:', error);
      Alert.alert('エラー', '在庫数の更新に失敗しました');
    }
  };

  const openEditModal = (menu: Menu) => {
    setEditingMenu(menu);
    setMenuName(menu.menu_name);
    setPrice(menu.price.toString());
    setSelectedCategoryId(menu.category_id ?? null);
    setStockManagement(menu.stock_management);
    setStockQuantity(menu.stock_quantity.toString());
    setShowEditModal(true);
  };

  const { orderedCategories, categoryMetaMap } = useMemo(() => getCategoryMetaMap(categories), [categories]);
  const menuCodeMap = useMemo(() => buildMenuCodeMap(menus, categories), [menus, categories]);

  // Category CRUD handlers
  const handleAddCategory = async () => {
    if (!categoryName.trim()) {
      Alert.alert('エラー', 'カテゴリ名を入力してください');
      return;
    }
    setSavingCategory(true);
    try {
      const newCategory: MenuCategory = {
        id: Crypto.randomUUID(),
        branch_id: branch.id,
        category_name: categoryName.trim(),
        sort_order: categories.length,
        created_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('menu_categories').insert(newCategory);
        if (error) throw error;
      }

      const updatedCategories = [...categories, newCategory];
      setCategories(updatedCategories);
      const allCategories = await getMenuCategories();
      const otherCategories = allCategories.filter((c) => c.branch_id !== branch.id);
      await saveMenuCategories([...otherCategories, ...updatedCategories]);

      setShowCategoryModal(false);
      setCategoryName('');
    } catch (error) {
      console.error('Error adding category:', error);
      Alert.alert('エラー', 'カテゴリの追加に失敗しました');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory || !categoryName.trim()) {
      Alert.alert('エラー', 'カテゴリ名を入力してください');
      return;
    }
    setSavingCategory(true);
    try {
      const updatedCategory: MenuCategory = {
        ...editingCategory,
        category_name: categoryName.trim(),
      };

      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('menu_categories')
          .update({ category_name: categoryName.trim() })
          .eq('id', editingCategory.id);
        if (error) throw error;
      }

      const updatedCategories = categories.map((c) =>
        c.id === editingCategory.id ? updatedCategory : c
      );
      setCategories(updatedCategories);
      const allCategories = await getMenuCategories();
      const otherCategories = allCategories.filter((c) => c.branch_id !== branch.id);
      await saveMenuCategories([...otherCategories, ...updatedCategories]);

      setShowEditCategoryModal(false);
      setEditingCategory(null);
      setCategoryName('');
    } catch (error) {
      console.error('Error updating category:', error);
      Alert.alert('エラー', 'カテゴリの更新に失敗しました');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = (category: MenuCategory) => {
    const menusInCategory = menus.filter((m) => m.category_id === category.id);
    const warningMsg = menusInCategory.length > 0
      ? `このカテゴリには${menusInCategory.length}件のメニューが含まれています。\nカテゴリを削除すると、これらのメニューはカテゴリなしになります。\n\n「${category.category_name}」を削除しますか？`
      : `「${category.category_name}」を削除しますか？`;

    alertConfirm('確認', warningMsg, async () => {
      try {
        if (isSupabaseConfigured()) {
          // Set menus in this category to null
          await supabase
            .from('menus')
            .update({ category_id: null })
            .eq('category_id', category.id);
          const { error } = await supabase.from('menu_categories').delete().eq('id', category.id);
          if (error) throw error;
        }

        // Update menus locally
        const updatedMenus = menus.map((m) =>
          m.category_id === category.id ? { ...m, category_id: null } : m
        );
        setMenus(updatedMenus);
        await saveMenus(updatedMenus);

        const updatedCategories = categories.filter((c) => c.id !== category.id);
        setCategories(updatedCategories);
        const allCategories = await getMenuCategories();
        const otherCategories = allCategories.filter((c) => c.branch_id !== branch.id);
        await saveMenuCategories([...otherCategories, ...updatedCategories]);
      } catch (error) {
        console.error('Error deleting category:', error);
        Alert.alert('エラー', 'カテゴリの削除に失敗しました');
      }
    }, '削除');
  };

  const moveCategoryOrder = async (category: MenuCategory, direction: 'up' | 'down') => {
    const idx = categories.findIndex((c) => c.id === category.id);
    if (direction === 'up' && idx <= 0) return;
    if (direction === 'down' && idx >= categories.length - 1) return;

    const newCategories = [...categories];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const tempOrder = newCategories[idx].sort_order;
    newCategories[idx] = { ...newCategories[idx], sort_order: newCategories[swapIdx].sort_order };
    newCategories[swapIdx] = { ...newCategories[swapIdx], sort_order: tempOrder };
    newCategories.sort((a, b) => a.sort_order - b.sort_order);

    setCategories(newCategories);
    const allCategories = await getMenuCategories();
    const otherCategories = allCategories.filter((c) => c.branch_id !== branch.id);
    await saveMenuCategories([...otherCategories, ...newCategories]);

    if (isSupabaseConfigured()) {
      for (const c of newCategories) {
        await supabase
          .from('menu_categories')
          .update({ sort_order: c.sort_order })
          .eq('id', c.id);
      }
    }
  };

  const moveMenuOrder = async (menu: Menu, direction: 'up' | 'down') => {
    const sameCategoryMenus = sortMenus(menus.filter((m) => m.category_id === menu.category_id));
    const idx = sameCategoryMenus.findIndex((m) => m.id === menu.id);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === sameCategoryMenus.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const target = sameCategoryMenus[swapIdx];
    const currentOrder = menu.sort_order ?? idx;
    const targetOrder = target.sort_order ?? swapIdx;

    const reordered = menus.map((m) => {
      if (m.id === menu.id) return { ...m, sort_order: targetOrder };
      if (m.id === target.id) return { ...m, sort_order: currentOrder };
      return m;
    });

    const sorted = sortMenus(reordered);
    setMenus(sorted);
    await saveMenus(sorted);

    if (isSupabaseConfigured()) {
      await supabase.from('menus').update({ sort_order: targetOrder }).eq('id', menu.id);
      await supabase.from('menus').update({ sort_order: currentOrder }).eq('id', target.id);
    }
  };

  const menuSections = useMemo(() => {
    const sections = orderedCategories
      .map((category) => ({
        id: category.id,
        title: category.category_name,
        categoryCode: categoryMetaMap.get(category.id)?.code ?? 'C--',
        visual: categoryMetaMap.get(category.id)?.visual ?? UNCATEGORIZED_VISUAL,
        menus: sortMenus(menus.filter((m) => m.category_id === category.id)),
      }))
      .filter((section) => section.menus.length > 0);

    const uncategorized = sortMenus(
      menus.filter((menu) => !menu.category_id || !categories.find((c) => c.id === menu.category_id)),
    );
    if (uncategorized.length > 0) {
      sections.push({
        id: 'uncategorized',
        title: 'その他',
        categoryCode: 'C00',
        visual: UNCATEGORIZED_VISUAL,
        menus: uncategorized,
      });
    }
    return sections;
  }, [orderedCategories, categoryMetaMap, categories, menus, sortMenus]);

  const renderMenuItem = ({
    item,
    indexInSection,
    sectionLength,
    categoryCode,
    categoryVisual,
  }: {
    item: Menu;
    indexInSection: number;
    sectionLength: number;
    categoryCode: string;
    categoryVisual: {
      cardBgClass: string;
      cardBorderClass: string;
      chipBgClass: string;
      chipTextClass: string;
    };
  }) => {
    const menuCode = menuCodeMap.get(item.id) ?? 'M---';
    const isTopInSection = indexInSection === 0;
    const isBottomInSection = indexInSection === sectionLength - 1;
    const dragResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 6,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -20) {
          moveMenuOrder(item, 'up');
        } else if (gestureState.dy > 20) {
          moveMenuOrder(item, 'down');
        }
      },
    });

    return (
      <Card className={`mb-2 px-3 py-2 border ${categoryVisual.cardBgClass} ${categoryVisual.cardBorderClass}`}>
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-2">
            <View className="flex-row items-center gap-1 mb-1">
              <View className={`px-2 py-0.5 rounded ${categoryVisual.chipBgClass}`}>
                <Text className={`text-[10px] font-bold ${categoryVisual.chipTextClass}`}>{menuCode}</Text>
              </View>
            </View>
            <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
              {item.menu_name}
            </Text>
            <View className="flex-row items-center gap-2 mt-1">
              <Text className="text-blue-600 font-bold">{item.price.toLocaleString()}円</Text>
            </View>
            <View className="flex-row items-center gap-2 mt-1">
              {item.stock_management ? (
                <>
                  <Text className="text-gray-500 text-xs">在庫</Text>
                  <View className="flex-row items-center">
                    <TouchableOpacity
                      onPress={() => handleStockChange(item, -1)}
                      className="w-6 h-6 bg-gray-200 rounded-l items-center justify-center"
                    >
                      <Text className="text-base font-bold text-gray-600">-</Text>
                    </TouchableOpacity>
                    <View className="w-10 h-6 bg-gray-100 items-center justify-center">
                      <Text
                        className={`text-xs font-bold ${
                          item.stock_quantity === 0
                            ? 'text-red-500'
                            : item.stock_quantity <= 5
                              ? 'text-orange-500'
                              : 'text-gray-900'
                        }`}
                      >
                        {item.stock_quantity}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleStockChange(item, 1)}
                      className="w-6 h-6 bg-gray-200 rounded-r items-center justify-center"
                    >
                      <Text className="text-base font-bold text-gray-600">+</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View className="bg-green-100 px-2 py-0.5 rounded">
                  <Text className="text-green-700 text-[11px]">在庫無制限</Text>
                </View>
              )}
            </View>
          </View>

          <View className="items-end gap-1">
            <View className="flex-row gap-1">
              <TouchableOpacity
                onPress={() => openEditModal(item)}
                className="px-2 py-1 bg-blue-50 rounded"
              >
                <Text className="text-blue-600 text-xs font-medium">編集</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDeleteMenu(item)}
                className="px-2 py-1 bg-red-50 rounded"
              >
                <Text className="text-red-600 text-xs font-medium">削除</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row gap-1 items-center">
              <View
                {...dragResponder.panHandlers}
                className="w-7 h-7 items-center justify-center rounded bg-gray-200"
              >
                <Text className="text-gray-600 text-xs font-bold">⋮⋮</Text>
              </View>
              <TouchableOpacity
                onPress={() => moveMenuOrder(item, 'up')}
                disabled={isTopInSection}
                className={`w-7 h-7 items-center justify-center rounded ${
                  isTopInSection ? 'bg-gray-200 opacity-40' : 'bg-gray-100'
                }`}
              >
                <Text className="text-gray-600 font-bold">↑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => moveMenuOrder(item, 'down')}
                disabled={isBottomInSection}
                className={`w-7 h-7 items-center justify-center rounded ${
                  isBottomInSection ? 'bg-gray-200 opacity-40' : 'bg-gray-100'
                }`}
              >
                <Text className="text-gray-600 font-bold">↓</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Card>
    );
  };

  const renderMenuForm = (isEdit: boolean) => (
    <>
      <Input
        label="メニュー名"
        value={menuName}
        onChangeText={setMenuName}
        placeholder="例: 焼きそば"
      />

      <Input
        label="金額（円）"
        value={price}
        onChangeText={setPrice}
        placeholder="例: 300"
        keyboardType="numeric"
      />

      {categories.length > 0 && (
        <View className="mb-4">
          <Text className="text-gray-700 font-medium mb-2">カテゴリ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setSelectedCategoryId(null)}
                className={`px-3 py-2 rounded-lg border ${
                  selectedCategoryId === null ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'
                }`}
              >
                <Text className={selectedCategoryId === null ? 'text-white font-medium' : 'text-gray-700'}>
                  なし
                </Text>
              </TouchableOpacity>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setSelectedCategoryId(cat.id)}
                  className={`px-3 py-2 rounded-lg border ${
                    selectedCategoryId === cat.id ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'
                  }`}
                >
                  <Text className={selectedCategoryId === cat.id ? 'text-white font-medium' : 'text-gray-700'}>
                    {cat.category_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-gray-700 font-medium">在庫管理</Text>
          <Text className="text-gray-500 text-xs">ONにすると残数を管理します</Text>
        </View>
        <Switch
          value={stockManagement}
          onValueChange={setStockManagement}
          trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
          thumbColor={stockManagement ? '#3B82F6' : '#f4f3f4'}
        />
      </View>

      {stockManagement && (
        <Input
          label="在庫数"
          value={stockQuantity}
          onChangeText={setStockQuantity}
          placeholder="例: 50"
          keyboardType="numeric"
        />
      )}

      <View className="flex-row gap-3 mt-4">
        <View className="flex-1">
          <Button
            title="キャンセル"
            onPress={() => {
              isEdit ? setShowEditModal(false) : setShowAddModal(false);
              setEditingMenu(null);
              resetForm();
            }}
            variant="secondary"
          />
        </View>
        <View className="flex-1">
          <Button
            title={isEdit ? '更新' : '追加'}
            onPress={isEdit ? handleEditMenu : handleAddMenu}
            loading={saving}
            disabled={!menuName.trim() || !price.trim()}
          />
        </View>
      </View>
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="メニュー登録"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
        rightElement={
          viewMode === 'menus' ? (
            <View className="flex-row gap-2">
              <Button title="+ 追加" onPress={() => setShowAddModal(true)} size="sm" />
              <Button
                title="全削除"
                onPress={() => {
                  setAdminPasswordInput('');
                  setDeleteAllError('');
                  setShowDeleteAllModal(true);
                }}
                variant="danger"
                size="sm"
              />
            </View>
          ) : (
            <Button title="+ カテゴリ追加" onPress={() => { setCategoryName(''); setShowCategoryModal(true); }} size="sm" />
          )
        }
      />

      {/* View mode tabs */}
      <View className="flex-row border-b border-gray-200 bg-white">
        <TouchableOpacity
          onPress={() => setViewMode('menus')}
          className={`flex-1 py-3 items-center ${viewMode === 'menus' ? 'border-b-4 border-blue-500' : ''}`}
        >
          <Text className={viewMode === 'menus' ? 'text-blue-600 font-bold' : 'text-gray-500'}>
            メニュー
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewMode('categories')}
          className={`flex-1 py-3 items-center ${viewMode === 'categories' ? 'border-b-2 border-blue-500' : ''}`}
        >
          <Text className={viewMode === 'categories' ? 'text-blue-600 font-semibold' : 'text-gray-500'}>
            カテゴリ
          </Text>
        </TouchableOpacity>
      </View>

      { loading &&(
        <View className='flex-1 items-center justify-center'>
          <ActivityIndicator size="large" />
          <Text className='text-gray-500 mt-2'>読み込み中...</Text>
        </View>
      )}

      {/* Menu list */}
      {!loading && viewMode === 'menus' && (
        <ScrollView className="flex-1 px-4 pt-3" showsVerticalScrollIndicator={false}>
          {menuSections.length === 0 ? (
            <View className="items-center py-12">
              <Text className="text-gray-500 mb-4">メニューが登録されていません</Text>
              <Button title="メニューを追加" onPress={() => setShowAddModal(true)} />
            </View>
          ) : (
            menuSections.map((section) => (
              <View key={section.id} className="mb-4">
                <View className={`px-3 py-2 rounded-lg mb-2 ${section.visual.headerBgClass}`}>
                  <Text className={`font-bold ${section.visual.headerTextClass}`}>
                    {section.categoryCode} {section.title}
                  </Text>
                </View>
                {section.menus.map((menu, index) => (
                  <View key={menu.id}>
                    {renderMenuItem({
                      item: menu,
                      indexInSection: index,
                      sectionLength: section.menus.length,
                      categoryCode: section.categoryCode,
                      categoryVisual: section.visual,
                    })}
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Category list */}
      {!loading && viewMode === 'categories' && (
        <FlatList
          data={orderedCategories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={
            <View className="mb-3">
              <Card className="px-3 py-2">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-gray-500 text-xs">カテゴリ数</Text>
                    <Text className="text-lg font-bold text-gray-900">{categories.length}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-gray-500 text-xs">紐づくメニュー総数</Text>
                    <Text className="text-lg font-bold text-blue-600">
                      {menus.filter((menu) => !!menu.category_id).length}
                    </Text>
                  </View>
                </View>
                <Text className="text-[11px] text-gray-500 mt-2">
                  矢印でカテゴリ順を並び替えできます。メニュー画面の表示順にも反映されます。
                </Text>
              </Card>
            </View>
          }
          renderItem={({ item, index }) => {
            const menuCount = menus.filter((m) => m.category_id === item.id).length;
            const categoryMeta = categoryMetaMap.get(item.id);
            const categoryCode = categoryMeta?.code ?? 'C--';
            const visual = categoryMeta?.visual ?? UNCATEGORIZED_VISUAL;
            return (
              <Card className={`mb-2 px-3 py-2 border ${visual.cardBgClass} ${visual.cardBorderClass}`}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <View className={`px-2 py-0.5 rounded ${visual.chipBgClass}`}>
                        <Text className={`text-[10px] font-bold ${visual.chipTextClass}`}>{categoryCode}</Text>
                      </View>
                      <Text className="text-base font-semibold text-gray-900">{item.category_name}</Text>
                    </View>
                    <View className="mt-1 self-start bg-white/80 px-2 py-0.5 rounded-full">
                      <Text className="text-gray-700 text-xs">{menuCount}件のメニュー</Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <TouchableOpacity
                      onPress={() => moveCategoryOrder(item, 'up')}
                      disabled={index === 0}
                      className={`w-7 h-7 items-center justify-center rounded bg-gray-100 ${index === 0 ? 'opacity-30' : ''}`}
                    >
                      <Text className="text-gray-600 font-bold">↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveCategoryOrder(item, 'down')}
                      disabled={index === orderedCategories.length - 1}
                      className={`w-7 h-7 items-center justify-center rounded bg-gray-100 ${index === orderedCategories.length - 1 ? 'opacity-30' : ''}`}
                    >
                      <Text className="text-gray-600 font-bold">↓</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="flex-row mt-2 pt-2 border-t border-gray-100 gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      setEditingCategory(item);
                      setCategoryName(item.category_name);
                      setShowEditCategoryModal(true);
                    }}
                    className="flex-1 py-1.5 bg-blue-50 rounded items-center"
                  >
                    <Text className="text-blue-600 text-xs font-medium">編集</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteCategory(item)}
                    className="flex-1 py-1.5 bg-red-50 rounded items-center"
                  >
                    <Text className="text-red-600 text-xs font-medium">削除</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <View className="items-center py-12">
              <Text className="text-gray-500 mb-2">カテゴリが登録されていません</Text>
              <Text className="text-gray-400 text-sm mb-4">カテゴリを作成するとメニューをグループ分けできます</Text>
              <Button title="カテゴリを追加" onPress={() => { setCategoryName(''); setShowCategoryModal(true); }} />
            </View>
          }
        />
      )}

      {/* Menu add/edit modals */}
      <Modal
        visible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          resetForm();
        }}
        title="メニュー追加"
      >
        {renderMenuForm(false)}
      </Modal>

      <Modal
        visible={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingMenu(null);
          resetForm();
        }}
        title="メニュー編集"
      >
        {renderMenuForm(true)}
      </Modal>

      {/* Category add modal */}
      <Modal
        visible={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setCategoryName('');
        }}
        title="カテゴリ追加"
      >
        <Input
          label="カテゴリ名"
          value={categoryName}
          onChangeText={setCategoryName}
          placeholder="例: ドリンク"
        />
        <View className="flex-row gap-3 mt-4">
          <View className="flex-1">
            <Button
              title="キャンセル"
              onPress={() => {
                setShowCategoryModal(false);
                setCategoryName('');
              }}
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <Button
              title="追加"
              onPress={handleAddCategory}
              loading={savingCategory}
              disabled={!categoryName.trim()}
            />
          </View>
        </View>
      </Modal>

      {/* Category edit modal */}
      <Modal
        visible={showEditCategoryModal}
        onClose={() => {
          setShowEditCategoryModal(false);
          setEditingCategory(null);
          setCategoryName('');
        }}
        title="カテゴリ編集"
      >
        <Input
          label="カテゴリ名"
          value={categoryName}
          onChangeText={setCategoryName}
          placeholder="例: ドリンク"
        />
        <View className="flex-row gap-3 mt-4">
          <View className="flex-1">
            <Button
              title="キャンセル"
              onPress={() => {
                setShowEditCategoryModal(false);
                setEditingCategory(null);
                setCategoryName('');
              }}
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <Button
              title="更新"
              onPress={handleEditCategory}
              loading={savingCategory}
              disabled={!categoryName.trim()}
            />
          </View>
        </View>
      </Modal>

      {/** Menu All Delete modal*/}
      <Modal
        visible={showDeleteAllModal}
        onClose={() => {
          setShowDeleteAllModal(false);
          setAdminPasswordInput('');
          setDeleteAllError('');
        }}
        title="メニュー全削除"
      >
        <View className="gap-3">
          <Text className="text-gray-600 text-sm">
            メニューを全削除するには管理者パスワードが必要です。
            {"\n"}初期パスワードは「0000」です。設定タブで変更できます。
          </Text>
          <TextInput
            value={adminPasswordInput}
            onChangeText={(text) => {
              setAdminPasswordInput(text);
              setDeleteAllError('');
            }}
            secureTextEntry
            placeholder="管理者パスワード"
            className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
            placeholderTextColor="#9CA3AF"
          />
          {deleteAllError ? <Text className="text-red-500 text-sm">{deleteAllError}</Text> : null}
          <View className="flex-row gap-3 mt-1">
            <View className="flex-1">
              <Button
                title="キャンセル"
                onPress={() => {
                  setShowDeleteAllModal(false);
                  setAdminPasswordInput('');
                  setDeleteAllError('');
                }}
                variant="secondary"
              />
            </View>
            <View className="flex-1">
              <Button
                title="次へ"
                onPress={handleDeleteAllMenus}
                loading={deletingAll}
                variant="danger"
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
