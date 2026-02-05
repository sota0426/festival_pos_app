import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';
import { Button, Input, Card, Header, Modal } from '../common';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { saveMenus, getMenus } from '../../lib/storage';
import type { Branch, Menu } from '../../types/database';

interface MenuManagementProps {
  branch: Branch;
  onBack: () => void;
}

export const MenuManagement = ({ branch, onBack }: MenuManagementProps) => {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [menuName, setMenuName] = useState('');
  const [price, setPrice] = useState('');
  const [stockManagement, setStockManagement] = useState(false);
  const [stockQuantity, setStockQuantity] = useState('');

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
  }, [fetchMenus]);

  const resetForm = () => {
    setMenuName('');
    setPrice('');
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
        id: uuidv4(),
        branch_id: branch.id,
        menu_name: menuName.trim(),
        price: parseInt(price, 10),
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

  const handleDeleteMenu = async (menu: Menu) => {
    Alert.alert('確認', `「${menu.menu_name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
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
        },
      },
    ]);
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
    setStockManagement(menu.stock_management);
    setStockQuantity(menu.stock_quantity.toString());
    setShowEditModal(true);
  };

  const renderMenuItem = ({ item }: { item: Menu }) => (
    <Card className="mb-3">
      <TouchableOpacity onPress={() => openEditModal(item)} activeOpacity={0.7}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-lg font-semibold text-gray-900">{item.menu_name}</Text>
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
          <Button title="+ 追加" onPress={() => setShowAddModal(true)} size="sm" />
        }
      />

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
    </SafeAreaView>
  );
};
