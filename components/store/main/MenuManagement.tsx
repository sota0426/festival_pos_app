import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Switch, ActivityIndicator, ScrollView, TextInput, PanResponder, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Button, Input, Card, Header, Modal } from '../../common';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { saveMenus, getMenus, saveMenuCategories, getMenuCategories, verifyAdminPassword, getRestrictions } from '../../../lib/storage';
import { alertConfirm, alertNotify } from '../../../lib/alertUtils';
import type { Branch, Menu, MenuCategory, RestrictionSettings } from '../../../types/database';
import { buildMenuCodeMap, getCategoryMetaMap, sortMenusByDisplay, UNCATEGORIZED_VISUAL } from './menuVisuals';

const MENU_CSV_HEADER = 'menu_name,price,category,stock_management,stock_quantity,is_show';

const toCsvCell = (value: string | number | boolean): string => {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  cells.push(current.trim());
  return cells;
};

type CsvMenuImportRow = {
  menu_name: string;
  price: number;
  category_name: string;
  stock_management: boolean;
  stock_quantity: number;
  is_show: boolean;
};

type MenuImportPreview = {
  rows: CsvMenuImportRow[];
  newCategories: string[];
  errors: string[];
};

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
  const [showDeleteMenuModal, setShowDeleteMenuModal] = useState(false);
  const [menuToDelete, setMenuToDelete] = useState<Menu | null>(null);
  const [deleteMenuPasswordInput, setDeleteMenuPasswordInput] = useState('');
  const [deleteMenuError, setDeleteMenuError] = useState('');
  const [deletingMenu, setDeletingMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<MenuImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [showMenuActionsModal, setShowMenuActionsModal] = useState(false);

  // Restriction & admin guard state
  const [restrictions, setRestrictions] = useState<RestrictionSettings | null>(null);
  const [showAdminGuardModal, setShowAdminGuardModal] = useState(false);
  const [adminGuardPwInput, setAdminGuardPwInput] = useState('');
  const [adminGuardError, setAdminGuardError] = useState('');
  const [adminGuardCallback, setAdminGuardCallback] = useState<(() => void) | null>(null);

  const sortMenus = useCallback((list: Menu[]) => sortMenusByDisplay(list), []);
  const defaultCategoryId = useMemo(() => {
    if (categories.length === 0) return null;
    const ordered = [...categories].sort((a, b) => a.sort_order - b.sort_order);
    const foodCategory = ordered.find((category) => category.category_name.trim() === 'フード');
    return foodCategory?.id ?? ordered[0]?.id ?? null;
  }, [categories]);

  const getNextSortOrder = useCallback(
    (categoryId: string | null, targetMenus: Menu[]) => {
      const sameCategory = targetMenus.filter((menu) => menu.category_id === categoryId);
      if (sameCategory.length === 0) return 0;
      const maxOrder = Math.max(...sameCategory.map((menu) => menu.sort_order ?? 0));
      return maxOrder + 1;
    },
    [],
  );

  const getNextMenuNumber = useCallback(
    (categoryId: string | null, targetMenus: Menu[], targetCategories: MenuCategory[]) => {
      const { categoryMetaMap } = getCategoryMetaMap(targetCategories);
      const sameCategoryMenus = targetMenus.filter((menu) => menu.category_id === categoryId);
      const existingCategoryDigits = sameCategoryMenus
        .map((menu) => (typeof menu.menu_number === 'number' ? Math.floor(menu.menu_number / 100) : null))
        .filter((value): value is number => value !== null);
      const categoryDigit = categoryId
        ? existingCategoryDigits[0] ?? categoryMetaMap.get(categoryId)?.digit ?? 0
        : 0;
      const usedSlots = new Set<number>();
      sameCategoryMenus.forEach((menu) => {
        if (typeof menu.menu_number !== 'number') return;
        const slot = menu.menu_number % 100;
        if (slot >= 1 && slot <= 99) usedSlots.add(slot);
      });

      let nextSlot = 1;
      while (usedSlots.has(nextSlot) && nextSlot <= 99) {
        nextSlot += 1;
      }
      if (nextSlot > 99) return null;
      return categoryDigit * 100 + nextSlot;
    },
    [],
  );

  const getCategoryDigit = useCallback(
    (categoryId: string | null, targetCategories: MenuCategory[]) => {
      if (!categoryId) return 0;
      const { categoryMetaMap } = getCategoryMetaMap(targetCategories);
      return categoryMetaMap.get(categoryId)?.digit ?? 0;
    },
    [],
  );

  const resequenceCategoryMenus = useCallback(
    (targetMenus: Menu[], categoryId: string | null, targetCategories: MenuCategory[]) => {
      const categoryDigit = getCategoryDigit(categoryId, targetCategories);
      const sameCategory = sortMenus(targetMenus.filter((menu) => menu.category_id === categoryId));
      const reassigned = sameCategory.map((menu, index) => ({
        ...menu,
        sort_order: index,
        menu_number: categoryDigit * 100 + (index + 1),
      }));
      const reassignedMap = new Map(reassigned.map((menu) => [menu.id, menu]));
      return targetMenus.map((menu) => reassignedMap.get(menu.id) ?? menu);
    },
    [getCategoryDigit, sortMenus],
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
              menu_number: 1,
              sort_order: 0,
              category_id: null,
              stock_management: true,
              stock_quantity: 50,
              is_active: true,
              is_show:true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: '2',
              branch_id: branch.id,
              menu_name: 'フランクフルト',
              price: 200,
              menu_number: 2,
              sort_order: 1,
              category_id: null,
              stock_management: true,
              stock_quantity: 30,
              is_active: true,
              is_show:true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: '3',
              branch_id: branch.id,
              menu_name: 'ジュース',
              price: 100,
              menu_number: 3,
              sort_order: 2,
              category_id: null,
              stock_management: false,
              stock_quantity: 0,
              is_active: true,
              is_show:true,
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

      const remoteMenus = data || [];
      const remoteIds = new Set(remoteMenus.map((m) => m.id));
      const localOnlyMenus = branchMenus.filter((m) => !remoteIds.has(m.id));

      if (localOnlyMenus.length > 0) {
        for (const localMenu of localOnlyMenus) {
          const { error: insertError } = await supabase.from('menus').insert(localMenu);
          if (insertError) {
            console.log('Local menu sync skipped:', insertError.message);
          }
        }
      }

      const mergedMenus = sortMenus([...remoteMenus, ...localOnlyMenus]);
      setMenus(mergedMenus);
      await saveMenus(mergedMenus);
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('Error fetching menus:', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
      });
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
    getRestrictions().then(setRestrictions);
  }, [fetchMenus, fetchCategories]);

  const resetForm = () => {
    setMenuName('');
    setPrice('');
    setSelectedCategoryId(defaultCategoryId);
    setStockManagement(false);
    setStockQuantity('');
  };

  // --- Admin guard helpers ---
  const openMenuGuard = (onSuccess: () => void) => {
    setAdminGuardPwInput('');
    setAdminGuardError('');
    setAdminGuardCallback(() => onSuccess);
    setShowAdminGuardModal(true);
  };

  const closeMenuGuard = () => {
    setShowAdminGuardModal(false);
    setAdminGuardPwInput('');
    setAdminGuardError('');
    setAdminGuardCallback(null);
  };

  const handleMenuGuardSubmit = async () => {
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
    closeMenuGuard();
    cb?.();
  };

  const withMenuRestrictionCheck = (key: keyof RestrictionSettings, action: () => void) => {
    if (restrictions?.[key]) {
      openMenuGuard(action);
    } else {
      action();
    }
  };

  const handleAddMenu = async () => {
    if (!menuName.trim() || !price.trim()) {
      Alert.alert('エラー', 'メニュー名と金額を入力してください');
      return;
    }

    setSaving(true);

    try {
      const generatedMenuNumber = getNextMenuNumber(selectedCategoryId, menus, categories);
      if (generatedMenuNumber == null) {
        Alert.alert('エラー', 'このカテゴリのメニュー番号が上限(99)に達しています');
        setSaving(false);
        return;
      }

      const newMenu: Menu = {
        id: Crypto.randomUUID(),
        branch_id: branch.id,
        menu_name: menuName.trim(),
        price: parseInt(price, 10),
        menu_number: generatedMenuNumber,
        sort_order: getNextSortOrder(selectedCategoryId, menus),
        category_id: selectedCategoryId,
        stock_management: stockManagement,
        stock_quantity: stockManagement ? parseInt(stockQuantity, 10) || 0 : 0,
        is_active: true,
        is_show:true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updatedMenus = sortMenus([...menus, newMenu]);
      setMenus(updatedMenus);
      await saveMenus(updatedMenus);

      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('menus').insert(newMenu);
        if (error) {
          console.log('Menu saved locally; remote sync deferred:', error.message);
          Alert.alert('オフライン保存', 'メニューを端末に保存しました。通信復帰後に同期されます。');
        }
      }

      setShowAddModal(false);
      resetForm();
    } catch (error: any) {
      console.error('Error adding menu:', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
      });
      const reason = error?.message ? `\n${error.message}` : '';
      Alert.alert('エラー', `メニューの追加に失敗しました${reason}`);
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
      const isCategoryChanged = previousCategoryId !== selectedCategoryId;
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

      let updatedMenus = menus.map((m) => (m.id === editingMenu.id ? updatedMenu : m));
      if (isCategoryChanged) {
        updatedMenus = resequenceCategoryMenus(updatedMenus, previousCategoryId, categories);
        updatedMenus = resequenceCategoryMenus(updatedMenus, selectedCategoryId, categories);
      }
      const sortedUpdatedMenus = sortMenus(updatedMenus);
      setMenus(sortedUpdatedMenus);
      await saveMenus(sortedUpdatedMenus);

      if (isSupabaseConfigured()) {
        if (!isCategoryChanged) {
          const { error } = await supabase
            .from('menus')
            .update(updatedMenu)
            .eq('id', editingMenu.id);
          if (error) throw error;
        } else {
          const affectedCategoryIds = new Set<string | null>([previousCategoryId, selectedCategoryId]);
          const affectedMenus = sortedUpdatedMenus.filter((menu) => affectedCategoryIds.has(menu.category_id));

          // UNIQUE制約(menu_number等)の一時衝突を避けるため2段階更新する
          for (let i = 0; i < affectedMenus.length; i += 1) {
            const menu = affectedMenus[i];
            const { error } = await supabase
              .from('menus')
              .update({
                sort_order: 100000 + i,
                menu_number: -100000 - i,
                updated_at: new Date().toISOString(),
              })
              .eq('id', menu.id);
            if (error) throw error;
          }

          for (const menu of affectedMenus) {
            const { error } = await supabase
              .from('menus')
              .update({
                menu_name: menu.menu_name,
                price: menu.price,
                category_id: menu.category_id,
                sort_order: menu.sort_order,
                menu_number: menu.menu_number,
                stock_management: menu.stock_management,
                stock_quantity: menu.stock_quantity,
                updated_at: new Date().toISOString(),
              })
              .eq('id', menu.id);
            if (error) throw error;
          }
        }
      }

      setShowEditModal(false);
      setEditingMenu(null);
      resetForm();
    } catch (error: any) {
      console.error('Error updating menu:', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
      });
      const reason = error?.message ? `\n${error.message}` : '';
      Alert.alert('エラー', `メニューの更新に失敗しました${reason}`);
    } finally {
      setSaving(false);
    }
  };

  const handleVisible= async( menu:Menu) =>{
    const newIsShow = !menu.is_show
    setSaving(true);

    try{
      if(isSupabaseConfigured()){
        const {error} = await supabase
         .from("menus")
         .update({
          is_show:newIsShow, 
          updated_at: new Date().toISOString()})
         .eq("id",menu.id);

        if(error) throw error
      }

      const updatedMenus = menus.map((m)=>
        m.id === menu.id ? {...m , is_show:newIsShow} : m
      );

      setMenus(updatedMenus);
      await saveMenus(updatedMenus)

    }catch(error){
      console.error("Error updating item visible")
      Alert.alert("Error","メニューの表示設定の更新を失敗しました")
    }finally{
      setSaving(false)
    }
  }

  const executeDeleteMenu = async (menu: Menu) => {
    setDeletingMenu(true);
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('menus').delete().eq('id', menu.id);
        if (error) throw error;
      }

      const updatedMenus = menus.filter((m) => m.id !== menu.id);
      setMenus(updatedMenus);
      await saveMenus(updatedMenus);

      setShowDeleteMenuModal(false);
      setMenuToDelete(null);
      setDeleteMenuPasswordInput('');
      setDeleteMenuError('');
    } catch (error) {
      console.error('Error deleting menu:', error);
      setDeleteMenuError('メニューの削除に失敗しました');
    } finally {
      setDeletingMenu(false);
    }
  };

  const handleDeleteMenu = (menu: Menu) => {
    setMenuToDelete(menu);
    setDeleteMenuPasswordInput('');
    setDeleteMenuError('');
    setShowDeleteMenuModal(true);
  };

  const handleDeleteMenuWithPassword = async () => {
    if (!menuToDelete) return;
    if (!deleteMenuPasswordInput.trim()) {
      setDeleteMenuError('管理者パスワードを入力してください');
      return;
    }

    const isValid = await verifyAdminPassword(deleteMenuPasswordInput);
    if (!isValid) {
      setDeleteMenuError('パスワードが正しくありません');
      return;
    }

    alertConfirm(
      '最終確認',
      `「${menuToDelete.menu_name}」を削除します。この操作は取り消せません。実行しますか？`,
      () => executeDeleteMenu(menuToDelete),
      '削除する',
    );
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



  // ─── CSV Export ───

  const buildMenuCsv = (): string => {
    const categoryMap = new Map(categories.map((c) => [c.id, c.category_name]));
    const lines: string[] = [MENU_CSV_HEADER];
    const sorted = sortMenus(menus);
    sorted.forEach((m) => {
      lines.push(
        [
          toCsvCell(m.menu_name),
          toCsvCell(m.price),
          toCsvCell(m.category_id ? (categoryMap.get(m.category_id) ?? '') : ''),
          toCsvCell(m.stock_management ? 'true' : 'false'),
          toCsvCell(m.stock_quantity),
          toCsvCell(m.is_show ? 'true' : 'false'),
        ].join(',')
      );
    });
    return `\uFEFF${lines.join('\n')}`;
  };

  const handleExportMenuCsv = async () => {
    if (menus.length === 0) {
      alertNotify('CSV出力', '出力対象のメニューがありません');
      return;
    }

    setExporting(true);
    try {
      const csvContent = buildMenuCsv();
      const filename = `menus_${branch.branch_code}_${new Date().toISOString().slice(0, 10)}.csv`;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        alertNotify('CSV出力', 'メニューCSVをダウンロードしました');
        return;
      }

      const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDir) throw new Error('保存先ディレクトリを取得できませんでした');
      const fileUri = `${baseDir}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'メニューCSVを共有' });
      } else {
        alertNotify('CSV出力', `CSVを保存しました: ${fileUri}`);
      }
    } catch (error: any) {
      console.error('Menu CSV export error:', error);
      alertNotify('エラー', `CSV出力に失敗しました: ${error?.message ?? ''}`);
    } finally {
      setExporting(false);
    }
  };

  // ─── CSV Import ───

  const parseMenuImportCsv = (csvText: string): MenuImportPreview => {
    const raw = csvText.replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const errors: string[] = [];
    const rows: CsvMenuImportRow[] = [];

    if (lines.length < 2) {
      errors.push('CSVにデータ行がありません');
      return { rows, newCategories: [], errors };
    }

    const headerCells = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
    const colIndex = {
      menu_name: headerCells.indexOf('menu_name'),
      price: headerCells.indexOf('price'),
      category: headerCells.indexOf('category'),
      stock_management: headerCells.indexOf('stock_management'),
      stock_quantity: headerCells.indexOf('stock_quantity'),
      is_show: headerCells.indexOf('is_show'),
    };

    if (colIndex.menu_name === -1) {
      errors.push('ヘッダーに menu_name 列が必要です');
      return { rows, newCategories: [], errors };
    }
    if (colIndex.price === -1) {
      errors.push('ヘッダーに price 列が必要です');
      return { rows, newCategories: [], errors };
    }

    const existingCategoryNames = new Set(categories.map((c) => c.category_name));
    const newCategorySet = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]);
      const rowNum = i + 1;

      const menuName = (cells[colIndex.menu_name] ?? '').trim();
      const priceStr = (cells[colIndex.price] ?? '').trim();
      const categoryName = colIndex.category >= 0 ? (cells[colIndex.category] ?? '').trim() : '';
      const stockMgmtStr = colIndex.stock_management >= 0 ? (cells[colIndex.stock_management] ?? 'false').trim().toLowerCase() : 'false';
      const stockQtyStr = colIndex.stock_quantity >= 0 ? (cells[colIndex.stock_quantity] ?? '0').trim() : '0';
      const isShowStr = colIndex.is_show >= 0 ? (cells[colIndex.is_show] ?? 'true').trim().toLowerCase() : 'true';

      if (!menuName) {
        errors.push(`${rowNum}行目: メニュー名が空です`);
        continue;
      }

      const price = parseInt(priceStr, 10);
      if (isNaN(price) || price < 0) {
        errors.push(`${rowNum}行目: 金額が不正です (${priceStr})`);
        continue;
      }

      const stockManagement = stockMgmtStr === 'true' || stockMgmtStr === '1' || stockMgmtStr === 'yes';
      const stockQuantity = parseInt(stockQtyStr, 10) || 0;
      const isShow = isShowStr !== 'false' && isShowStr !== '0' && isShowStr !== 'no';

      if (categoryName && !existingCategoryNames.has(categoryName)) {
        newCategorySet.add(categoryName);
      }

      rows.push({
        menu_name: menuName,
        price,
        category_name: categoryName,
        stock_management: stockManagement,
        stock_quantity: stockQuantity,
        is_show: isShow,
      });
    }

    return { rows, newCategories: Array.from(newCategorySet), errors };
  };

  const handlePickMenuCsv = async () => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,text/csv';
        input.onchange = async (e: any) => {
          const file = e.target?.files?.[0];
          if (!file) return;
          const text: string = await file.text();
          const preview = parseMenuImportCsv(text);
          setImportPreview(preview);
          setShowImportModal(true);
        };
        input.click();
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', '*/*'],
      });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'utf8' });
      const preview = parseMenuImportCsv(text);
      setImportPreview(preview);
      setShowImportModal(true);
    } catch (error: any) {
      console.error('Menu CSV pick error:', error);
      alertNotify('エラー', `CSVファイルの読み込みに失敗しました: ${error?.message ?? ''}`);
    }
  };

  const handleMenuImportConfirm = async () => {
    if (!importPreview) return;

    setImporting(true);
    try {
      // 1. Create new categories if needed
      let currentCategories = [...categories];
      for (const catName of importPreview.newCategories) {
        const newCat: MenuCategory = {
          id: Crypto.randomUUID(),
          branch_id: branch.id,
          category_name: catName,
          sort_order: currentCategories.length,
          created_at: new Date().toISOString(),
        };

        if (isSupabaseConfigured()) {
          const { error } = await supabase.from('menu_categories').insert(newCat);
          if (error) throw error;
        }

        currentCategories = [...currentCategories, newCat];
      }

      // Save updated categories
      if (importPreview.newCategories.length > 0) {
        setCategories(currentCategories);
        const allCategories = await getMenuCategories();
        const otherCategories = allCategories.filter((c) => c.branch_id !== branch.id);
        await saveMenuCategories([...otherCategories, ...currentCategories]);
      }

      // 2. Build category name -> id map
      const catNameToId = new Map(currentCategories.map((c) => [c.category_name, c.id]));

      // 3. Create menus
      let currentMenus = [...menus];
      const newMenus: Menu[] = [];

      for (const row of importPreview.rows) {
        const categoryId = row.category_name ? (catNameToId.get(row.category_name) ?? null) : null;
        const menuNumber = getNextMenuNumber(categoryId, [...currentMenus, ...newMenus], currentCategories);

        const newMenu: Menu = {
          id: Crypto.randomUUID(),
          branch_id: branch.id,
          menu_name: row.menu_name,
          price: row.price,
          menu_number: menuNumber ?? undefined,
          sort_order: getNextSortOrder(categoryId, [...currentMenus, ...newMenus]),
          category_id: categoryId,
          stock_management: row.stock_management,
          stock_quantity: row.stock_management ? row.stock_quantity : 0,
          is_active: true,
          is_show: row.is_show,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (isSupabaseConfigured()) {
          const { error } = await supabase.from('menus').insert(newMenu);
          if (error) throw error;
        }

        newMenus.push(newMenu);
      }

      const allMenus = sortMenus([...currentMenus, ...newMenus]);
      setMenus(allMenus);
      await saveMenus(allMenus);

      setShowImportModal(false);
      setImportPreview(null);
      alertNotify(
        'インポート完了',
        `メニュー ${importPreview.rows.length}件${importPreview.newCategories.length > 0 ? `、新規カテゴリ ${importPreview.newCategories.length}件` : ''} を登録しました`
      );
    } catch (error: any) {
      console.error('Menu import error:', error);
      alertNotify('エラー', `インポートに失敗しました: ${error?.message ?? ''}`);
    } finally {
      setImporting(false);
    }
  };

  const openEditModal = (menu: Menu) => {
    setEditingMenu(menu);
    setMenuName(menu.menu_name);
    setPrice(menu.price.toString());
    setSelectedCategoryId(menu.category_id ?? defaultCategoryId);
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

    const resequenced = resequenceCategoryMenus(reordered, menu.category_id, categories);
    const sorted = sortMenus(resequenced);
    setMenus(sorted);
    await saveMenus(sorted);

    if (isSupabaseConfigured()) {
      const sameCategoryUpdated = sorted.filter((m) => m.category_id === menu.category_id);
      for (const m of sameCategoryUpdated) {
        const { error } = await supabase
          .from('menus')
          .update({
            sort_order: m.sort_order,
            menu_number: m.menu_number,
            updated_at: new Date().toISOString(),
          })
          .eq('id', m.id);
        if (error) throw error;
      }
    }
  };

  const menuSections = useMemo(() => {
      let sections = orderedCategories
      .map((category) => ({
        id: category.id,
        title: category.category_name,
        categoryCode: categoryMetaMap.get(category.id)?.code ?? '-',
        visual: categoryMetaMap.get(category.id)?.visual ?? UNCATEGORIZED_VISUAL,
        menus: sortMenus(menus.filter((m) => m.category_id === category.id)),
      }))
      .filter((section) => section.menus.length > 0);

    const uncategorized = sortMenus(
      menus.filter((menu) => !menu.category_id || !categories.find((c) => c.id === menu.category_id)),
    );
    if (uncategorized.length > 0) {
      const fallbackCategory = orderedCategories.find((category) => category.id === defaultCategoryId);
      const fallbackInSections = sections.find((s) => s.id === defaultCategoryId);
      if (fallbackCategory && fallbackInSections) {
        // fallback category has directly-assigned menus → merge uncategorized into it
        sections = sections.map((section) =>
          section.id === fallbackCategory.id
            ? { ...section, menus: sortMenus([...section.menus, ...uncategorized]) }
            : section,
        );
      } else if (fallbackCategory && !fallbackInSections) {
        // fallback category exists but was filtered out (no direct menus) → restore it with uncategorized
        const meta = categoryMetaMap.get(fallbackCategory.id);
        sections.push({
          id: fallbackCategory.id,
          title: fallbackCategory.category_name,
          categoryCode: meta?.code ?? '1',
          visual: meta?.visual ?? UNCATEGORIZED_VISUAL,
          menus: uncategorized,
        });
      } else {
        // no fallback category at all → create a generic uncategorized section
        sections.push({
          id: 'uncategorized',
          title: 'フード',
          categoryCode: '1',
          visual: UNCATEGORIZED_VISUAL,
          menus: uncategorized,
        });
      }
    }
    return sections.filter((section) => section.menus.length > 0);
  }, [orderedCategories, categoryMetaMap, categories, menus, sortMenus, defaultCategoryId]);

  const renderMenuItem = ({
    item,
    indexInSection,
    sectionLength,
    categoryVisual,
  }: {
    item: Menu;
    indexInSection: number;
    sectionLength: number;
    categoryVisual: {
      cardBgClass: string;
      cardBorderClass: string;
      chipBgClass: string;
      chipTextClass: string;
    };
  }) => {
    const menuCode = menuCodeMap.get(item.id) ?? '000';
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
      <Card 
        className={`mb-2 px-3 py-2 border 
          ${categoryVisual.cardBgClass} 
          ${categoryVisual.cardBorderClass}
          ${!item.is_show ? 'opacity-40 bg-gray-200' : ''}
        `}
      >
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
                onPress={() => withMenuRestrictionCheck('menu_edit', () => openEditModal(item))}
                className="px-2 py-1 bg-blue-50 rounded"
              >
                <Text className="text-blue-600 text-xs font-medium">編集</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleVisible(item)}
                className="px-2 py-1 bg-blue-50 rounded"
              >
              <Text
                className={`text-xs font-medium ${
                  !item.is_show ? 'text-orange-600' : 'text-green-600'
                }`}
              >
              {item.is_show ? "表示": "※ メニュー非表示"}
                </Text>
              </TouchableOpacity>              

              <TouchableOpacity
                onPress={() => withMenuRestrictionCheck('menu_delete', () => handleDeleteMenu(item))}
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
              {orderedCategories.map((cat) => (
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
            <View className="flex-row gap-1">
              <Button
                title="+ メニュー追加"
                onPress={() =>
                  withMenuRestrictionCheck('menu_add', () => {
                    resetForm();
                    setShowAddModal(true);
                  })
                }
                size="sm"
              />
              <TouchableOpacity
                onPress={() => setShowMenuActionsModal(true)}
                className="w-9 h-9 bg-gray-100 rounded-lg items-center justify-center"
                activeOpacity={0.7}
              >
                <Text className="text-gray-700 text-lg font-bold leading-none">☰</Text>
              </TouchableOpacity>
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
              <Button
                title="メニューを追加"
                onPress={() =>
                  withMenuRestrictionCheck('menu_add', () => {
                    resetForm();
                    setShowAddModal(true);
                  })
                }
              />
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
            const categoryCode = categoryMeta?.code ?? '-';
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
        visible={showDeleteMenuModal}
        onClose={() => {
          setShowDeleteMenuModal(false);
          setMenuToDelete(null);
          setDeleteMenuPasswordInput('');
          setDeleteMenuError('');
        }}
        title="メニュー削除"
      >
        <View className="gap-3">
          <Text className="text-gray-600 text-sm">
            メニュー削除には管理者パスワードが必要です。
            {"\n"}初期パスワードは「0000」です。設定タブで変更できます。
          </Text>
          {menuToDelete ? (
            <View className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <Text className="text-red-700 text-sm font-semibold">削除対象: {menuToDelete.menu_name}</Text>
            </View>
          ) : null}
          <TextInput
            value={deleteMenuPasswordInput}
            onChangeText={(text) => {
              setDeleteMenuPasswordInput(text);
              setDeleteMenuError('');
            }}
            secureTextEntry
            placeholder="管理者パスワード"
            className="border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
            placeholderTextColor="#9CA3AF"
          />
          {deleteMenuError ? <Text className="text-red-500 text-sm">{deleteMenuError}</Text> : null}
          <View className="flex-row gap-3 mt-1">
            <View className="flex-1">
              <Button
                title="キャンセル"
                onPress={() => {
                  setShowDeleteMenuModal(false);
                  setMenuToDelete(null);
                  setDeleteMenuPasswordInput('');
                  setDeleteMenuError('');
                }}
                variant="secondary"
              />
            </View>
            <View className="flex-1">
              <Button
                title="次へ"
                onPress={handleDeleteMenuWithPassword}
                loading={deletingMenu}
                variant="danger"
              />
            </View>
          </View>
        </View>
      </Modal>

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

      {/* CSVインポートプレビューモーダル */}
      <Modal
        visible={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportPreview(null);
        }}
        title="メニューCSVインポート確認"
      >
        {importPreview && (
          <ScrollView style={{ maxHeight: 400 }}>
            {importPreview.errors.length > 0 && (
              <View className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <Text className="text-red-700 font-semibold mb-1">エラー ({importPreview.errors.length}件)</Text>
                {importPreview.errors.map((err, i) => (
                  <Text key={i} className="text-red-600 text-sm">{err}</Text>
                ))}
              </View>
            )}

            {importPreview.newCategories.length > 0 && (
              <View className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-3">
                <Text className="text-purple-700 font-semibold mb-1">
                  新規カテゴリ ({importPreview.newCategories.length}件)
                </Text>
                <Text className="text-purple-600 text-xs mb-2">存在しないカテゴリ名が含まれているため自動作成します</Text>
                {importPreview.newCategories.map((name, i) => (
                  <Text key={i} className="text-purple-800 text-sm">- {name}</Text>
                ))}
              </View>
            )}

            {importPreview.rows.length > 0 && (
              <View className="mb-4">
                <Text className="text-green-700 font-semibold mb-2">
                  登録メニュー ({importPreview.rows.length}件)
                </Text>
                {importPreview.rows.map((row, i) => (
                  <View key={`menu-${i}`} className="flex-row items-center justify-between bg-green-50 rounded-lg px-3 py-2 mb-1">
                    <View className="flex-1">
                      <Text className="text-gray-900 font-medium">{row.menu_name}</Text>
                      <View className="flex-row items-center gap-2">
                        <Text className="text-blue-600 text-xs font-bold">{row.price.toLocaleString()}円</Text>
                        {row.category_name ? (
                          <Text className="text-gray-500 text-xs">{row.category_name}</Text>
                        ) : null}
                      </View>
                    </View>
                    <View className="items-end gap-0.5">
                      {row.stock_management ? (
                        <Text className="text-gray-500 text-xs">在庫: {row.stock_quantity}</Text>
                      ) : (
                        <Text className="text-green-600 text-xs">在庫無制限</Text>
                      )}
                      {!row.is_show && (
                        <Text className="text-orange-500 text-xs">非表示</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {importPreview.rows.length === 0 && importPreview.errors.length === 0 && (
              <Text className="text-gray-500 text-center py-4">処理対象のデータがありません</Text>
            )}

            <View className="flex-row gap-3 mt-4">
              <View className="flex-1">
                <Button
                  title="キャンセル"
                  onPress={() => {
                    setShowImportModal(false);
                    setImportPreview(null);
                  }}
                  variant="secondary"
                />
              </View>
              <View className="flex-1">
                <Button
                  title="インポート実行"
                  onPress={handleMenuImportConfirm}
                  loading={importing}
                  disabled={importing || importPreview.rows.length === 0}
                  variant="success"
                />
              </View>
            </View>
          </ScrollView>
        )}
      </Modal>

      <Modal
        visible={showMenuActionsModal}
        onClose={() => setShowMenuActionsModal(false)}
        title="メニュー操作"
      >
        <View className="gap-3">
          <TouchableOpacity
            onPress={() => {
              setShowMenuActionsModal(false);
              withMenuRestrictionCheck('menu_add', handlePickMenuCsv);
            }}
            className="flex-row items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3"
            activeOpacity={0.7}
          >
            <Text className="text-lg">📥</Text>
            <View className="flex-1">
              <Text className="text-green-800 font-semibold text-sm">CSV一括登録</Text>
              <Text className="text-green-600 text-xs">CSVファイルからメニューを一括登録</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setShowMenuActionsModal(false);
              handleExportMenuCsv();
            }}
            disabled={exporting || menus.length === 0}
            className={`flex-row items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 ${
              exporting || menus.length === 0 ? 'opacity-50' : ''
            }`}
            activeOpacity={0.7}
          >
            <Text className="text-lg">📤</Text>
            <View className="flex-1">
              <Text className="text-blue-800 font-semibold text-sm">
                {exporting ? 'CSV出力中...' : 'CSV一括ダウンロード'}
              </Text>
              <Text className="text-blue-600 text-xs">全メニュー情報をCSVファイルで出力</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setShowMenuActionsModal(false);
              withMenuRestrictionCheck('menu_delete', () => {
                setAdminPasswordInput('');
                setDeleteAllError('');
                setShowDeleteAllModal(true);
              });
            }}
            className="flex-row items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3"
            activeOpacity={0.7}
          >
            <Text className="text-lg">🗑️</Text>
            <View className="flex-1">
              <Text className="text-red-800 font-semibold text-sm">メニュー全削除</Text>
              <Text className="text-red-600 text-xs">登録済みのメニューをすべて削除</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Admin Guard Modal for restrictions */}
      <Modal
        visible={showAdminGuardModal}
        onClose={closeMenuGuard}
        title="管理者パスワード"
      >
        <Text className="text-gray-600 text-sm mb-3">
          この操作には管理者パスワードが必要です
        </Text>
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
            <Button title="キャンセル" onPress={closeMenuGuard} variant="secondary" />
          </View>
          <View className="flex-1">
            <Button
              title="確認"
              onPress={handleMenuGuardSubmit}
              disabled={!adminGuardPwInput.trim()}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
