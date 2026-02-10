import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Switch, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { Button, Input, Card, Header, Modal } from '../../common';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { saveMenus, getMenus, saveMenuCategories, getMenuCategories } from '../../../lib/storage';
import { alertConfirm } from '../../../lib/alertUtils';
import type { Branch, Menu, MenuCategory } from '../../../types/database';

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

      if (!isSupabaseConfigured()) {
        if (localMenus.length > 0 && localMenus[0].branch_id === branch.id) {
          setMenus(localMenus);
        } else {
          // Demo data
          const demoMenus: Menu[] = [
            {
              id: '1',
              branch_id: branch.id,
              menu_name: '焼きそば',
              price: 300,
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
              category_id: null,
              stock_management: false,
              stock_quantity: 0,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ];
          setMenus(demoMenus);
          await saveMenus(demoMenus);
        }
        setLoading(false);
        return;
      }

      // Fetch from Supabase
      const { data, error } = await supabase
        .from('menus')
        .select('*')
        .eq('branch_id', branch.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMenus(data || []);
      await saveMenus(data || []);
    } catch (error) {
      console.error('Error fetching menus:', error);
      // Use local data as fallback
      const localMenus = await getMenus();
      setMenus(localMenus.filter((m) => m.branch_id === branch.id));
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

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

      const updatedMenus = [...menus, newMenu];
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
      const updatedMenu: Menu = {
        ...editingMenu,
        menu_name: menuName.trim(),
        price: parseInt(price, 10),
        category_id: selectedCategoryId,
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

      const updatedMenus = menus.map((m) => (m.id === editingMenu.id ? updatedMenu : m));
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

  const getCategoryName = (categoryId: string | null): string | null => {
    if (!categoryId) return null;
    return categories.find((c) => c.id === categoryId)?.category_name ?? null;
  };

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

  const renderMenuItem = ({ item }: { item: Menu }) => {
    const catName = getCategoryName(item.category_id);
    return (
    <Card className="mb-3">
      <TouchableOpacity onPress={() => openEditModal(item)} activeOpacity={0.7}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-lg font-semibold text-gray-900">{item.menu_name}</Text>
            {catName && (
              <View className="bg-purple-100 px-2 py-0.5 rounded self-start mt-0.5">
                <Text className="text-purple-700 text-xs">{catName}</Text>
              </View>
            )}
            <Text className="text-blue-600 font-bold mt-1">{item.price.toLocaleString()}円</Text>
          </View>

          {item.stock_management && (
            <View className="items-center">
              <Text className="text-gray-500 text-xs mb-1">在庫</Text>
              <View className="flex-row items-center">
                <TouchableOpacity
                  onPress={() => handleStockChange(item, -1)}
                  className="w-8 h-8 bg-gray-200 rounded-l items-center justify-center"
                >
                  <Text className="text-lg font-bold text-gray-600">-</Text>
                </TouchableOpacity>
                <View className="w-12 h-8 bg-gray-100 items-center justify-center">
                  <Text
                    className={`font-bold ${
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
                  className="w-8 h-8 bg-gray-200 rounded-r items-center justify-center"
                >
                  <Text className="text-lg font-bold text-gray-600">+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!item.stock_management && (
            <View className="bg-green-100 px-2 py-1 rounded">
              <Text className="text-green-700 text-xs">在庫無制限</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <View className="flex-row mt-3 pt-3 border-t border-gray-100 gap-2">
        <TouchableOpacity
          onPress={() => openEditModal(item)}
          className="flex-1 py-2 bg-blue-50 rounded items-center"
        >
          <Text className="text-blue-600 font-medium">編集</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleDeleteMenu(item)}
          className="flex-1 py-2 bg-red-50 rounded items-center"
        >
          <Text className="text-red-600 font-medium">削除</Text>
        </TouchableOpacity>
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
            <Button title="+ 追加" onPress={() => setShowAddModal(true)} size="sm" />
          ) : (
            <Button title="+ カテゴリ追加" onPress={() => { setCategoryName(''); setShowCategoryModal(true); }} size="sm" />
          )
        }
      />

      {/* View mode tabs */}
      <View className="flex-row border-b border-gray-200 bg-white">
        <TouchableOpacity
          onPress={() => setViewMode('menus')}
          className={`flex-1 py-3 items-center ${viewMode === 'menus' ? 'border-b-2 border-blue-500' : ''}`}
        >
          <Text className={viewMode === 'menus' ? 'text-blue-600 font-semibold' : 'text-gray-500'}>
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
      <FlatList
        data={menus}
        renderItem={renderMenuItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-gray-500 mb-4">メニューが登録されていません</Text>
            <Button title="メニューを追加" onPress={() => setShowAddModal(true)} />
          </View>
        }
      />
      )}

      {/* Category list */}
      {!loading && viewMode === 'categories' && (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item, index }) => {
            const menuCount = menus.filter((m) => m.category_id === item.id).length;
            return (
              <Card className="mb-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-lg font-semibold text-gray-900">{item.category_name}</Text>
                    <Text className="text-gray-500 text-sm mt-0.5">{menuCount}件のメニュー</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <TouchableOpacity
                      onPress={() => moveCategoryOrder(item, 'up')}
                      disabled={index === 0}
                      className={`w-8 h-8 items-center justify-center rounded ${index === 0 ? 'opacity-30' : ''}`}
                    >
                      <Text className="text-gray-600 font-bold">↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveCategoryOrder(item, 'down')}
                      disabled={index === categories.length - 1}
                      className={`w-8 h-8 items-center justify-center rounded ${index === categories.length - 1 ? 'opacity-30' : ''}`}
                    >
                      <Text className="text-gray-600 font-bold">↓</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="flex-row mt-3 pt-3 border-t border-gray-100 gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      setEditingCategory(item);
                      setCategoryName(item.category_name);
                      setShowEditCategoryModal(true);
                    }}
                    className="flex-1 py-2 bg-blue-50 rounded items-center"
                  >
                    <Text className="text-blue-600 font-medium">編集</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteCategory(item)}
                    className="flex-1 py-2 bg-red-50 rounded items-center"
                  >
                    <Text className="text-red-600 font-medium">削除</Text>
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
    </SafeAreaView>
  );
};
