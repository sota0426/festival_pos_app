import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header } from '../../common';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { alertNotify } from '../../../lib/alertUtils';
import { useAuth } from '../../../contexts/AuthContext';
import { DEMO_MENUS, resolveDemoBranchId } from '../../../data/demoData';
import type { Branch, Menu } from '../../../types/database';

interface CookingManualProps {
  branch: Branch;
  onBack: () => void;
}

interface MenuCookingManual {
  id: string;
  branch_id: string;
  menu_id: string;
  ingredients: string;
  purchase_source: string;
  cost_per_item: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export const CookingManual = ({ branch, onBack }: CookingManualProps) => {
  const { authState } = useAuth();
  const isDemo = authState.status === 'demo';
  const demoBranchId = resolveDemoBranchId(branch);

  const [menus, setMenus] = useState<Menu[]>([]);
  const [manuals, setManuals] = useState<MenuCookingManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [ingredientsDraft, setIngredientsDraft] = useState('');
  const [purchaseSourceDraft, setPurchaseSourceDraft] = useState('');
  const [costDraft, setCostDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const manualByMenuId = useMemo(() => {
    const map = new Map<string, MenuCookingManual>();
    manuals.forEach((manual) => map.set(manual.menu_id, manual));
    return map;
  }, [manuals]);

  const sortedMenus = useMemo(
    () => [...menus].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.menu_name.localeCompare(b.menu_name, 'ja')),
    [menus],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemo && demoBranchId) {
        const seededMenus = (DEMO_MENUS[demoBranchId] ?? []).map((menu) => ({ ...menu, branch_id: branch.id }));
        setMenus(seededMenus);
        setManuals([]);
        return;
      }

      if (!isSupabaseConfigured()) {
        setMenus([]);
        setManuals([]);
        return;
      }

      const [{ data: menuRows, error: menuError }, { data: manualRows, error: manualError }] = await Promise.all([
        supabase
          .from('menus')
          .select('*')
          .eq('branch_id', branch.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('menu_cooking_manuals')
          .select('*')
          .eq('branch_id', branch.id)
          .order('updated_at', { ascending: false }),
      ]);

      if (menuError) throw menuError;
      if (manualError) throw manualError;

      setMenus((menuRows ?? []) as Menu[]);
      setManuals((manualRows ?? []) as MenuCookingManual[]);
    } catch (error) {
      console.error('[CookingManual] fetch error:', error);
      alertNotify('エラー', '調理マニュアルの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [branch.id, demoBranchId, isDemo]);

  useEffect(() => {
    void fetchData();

    if (isDemo || !isSupabaseConfigured()) return;

    const channel = supabase
      .channel(`menu_cooking_manuals:${branch.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_cooking_manuals', filter: `branch_id=eq.${branch.id}` },
        () => {
          void fetchData();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branch.id, fetchData, isDemo]);

  const openEditModal = (menu: Menu) => {
    setSelectedMenu(menu);
    const manual = manualByMenuId.get(menu.id);
    setIngredientsDraft(manual?.ingredients ?? '');
    setPurchaseSourceDraft(manual?.purchase_source ?? '');
    setCostDraft(manual ? String(manual.cost_per_item) : '');
    setNotesDraft(manual?.notes ?? '');
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setSelectedMenu(null);
    setIngredientsDraft('');
    setPurchaseSourceDraft('');
    setCostDraft('');
    setNotesDraft('');
    setSaving(false);
  };

  const handleSaveManual = async () => {
    if (!selectedMenu) return;

    const parsedCost = Number(costDraft);
    if (costDraft.trim().length > 0 && (Number.isNaN(parsedCost) || parsedCost < 0)) {
      alertNotify('入力エラー', '費用は0以上の数値で入力してください');
      return;
    }

    const now = new Date().toISOString();
    const nextManual: MenuCookingManual = {
      id: manualByMenuId.get(selectedMenu.id)?.id ?? `manual-${selectedMenu.id}`,
      branch_id: branch.id,
      menu_id: selectedMenu.id,
      ingredients: ingredientsDraft.trim(),
      purchase_source: purchaseSourceDraft.trim(),
      cost_per_item: costDraft.trim().length > 0 ? parsedCost : 0,
      notes: notesDraft.trim(),
      created_at: manualByMenuId.get(selectedMenu.id)?.created_at ?? now,
      updated_at: now,
    };

    if (isDemo) {
      setManuals((prev) => {
        const exists = prev.some((manual) => manual.menu_id === selectedMenu.id);
        if (exists) {
          return prev.map((manual) => (manual.menu_id === selectedMenu.id ? nextManual : manual));
        }
        return [nextManual, ...prev];
      });
      closeEditModal();
      return;
    }

    if (!isSupabaseConfigured()) {
      alertNotify('オフライン', 'オフライン時は調理マニュアルを保存できません');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('menu_cooking_manuals')
        .upsert(
          {
            branch_id: branch.id,
            menu_id: selectedMenu.id,
            ingredients: nextManual.ingredients,
            purchase_source: nextManual.purchase_source,
            cost_per_item: nextManual.cost_per_item,
            notes: nextManual.notes,
            updated_at: now,
          },
          { onConflict: 'branch_id,menu_id' },
        );

      if (error) throw error;
      closeEditModal();
      void fetchData();
    } catch (error) {
      console.error('[CookingManual] save error:', error);
      alertNotify('エラー', '調理マニュアルの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleClearManual = async () => {
    if (!selectedMenu) return;

    if (isDemo) {
      setManuals((prev) => prev.filter((manual) => manual.menu_id !== selectedMenu.id));
      closeEditModal();
      return;
    }

    if (!isSupabaseConfigured()) {
      alertNotify('オフライン', 'オフライン時は削除できません');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('menu_cooking_manuals')
        .delete()
        .eq('branch_id', branch.id)
        .eq('menu_id', selectedMenu.id);
      if (error) throw error;
      closeEditModal();
      void fetchData();
    } catch (error) {
      console.error('[CookingManual] clear error:', error);
      alertNotify('エラー', '調理マニュアルの削除に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="調理マニュアル"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
      />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text className="text-gray-500 mt-2 text-sm">読み込み中...</Text>
        </View>
      ) : sortedMenus.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-4">🍳</Text>
          <Text className="text-gray-400 text-base text-center">
            メニューがありません{`\n`}先にメニュー登録を行ってください
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
          <View className="gap-2 pb-6 pt-3">
            {sortedMenus.map((menu) => {
              const manual = manualByMenuId.get(menu.id);
              return (
                <Card key={menu.id} className="p-4">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-base font-bold text-gray-900">{menu.menu_name}</Text>
                      <Text className="text-xs text-gray-500 mt-0.5">販売価格: {menu.price.toLocaleString()}円</Text>

                      {manual ? (
                        <View className="mt-2 gap-1">
                          <Text className="text-xs text-indigo-700">食材: {manual.ingredients || '未設定'}</Text>
                          <Text className="text-xs text-indigo-700">購入元: {manual.purchase_source || '未設定'}</Text>
                          <Text className="text-xs text-indigo-700">1個あたり費用: {manual.cost_per_item.toLocaleString()}円</Text>
                          {manual.notes ? (
                            <Text className="text-xs text-gray-500">備考: {manual.notes}</Text>
                          ) : null}
                        </View>
                      ) : (
                        <Text className="text-xs text-gray-400 mt-2">マニュアル未登録</Text>
                      )}
                    </View>

                    <TouchableOpacity
                      onPress={() => openEditModal(menu)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600"
                      activeOpacity={0.8}
                    >
                      <Text className="text-white text-xs font-semibold">{manual ? '編集' : '登録'}</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })}
          </View>
        </ScrollView>
      )}

      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={closeEditModal}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-2xl p-6">
            <Text className="text-lg font-bold text-gray-900 mb-1">調理マニュアルを編集</Text>
            <Text className="text-sm text-gray-500 mb-4">{selectedMenu?.menu_name ?? ''}</Text>

            <Text className="text-sm font-medium text-gray-700 mb-1">食材（1個あたり）</Text>
            <TextInput
              value={ingredientsDraft}
              onChangeText={setIngredientsDraft}
              placeholder="例: 麺100g、豚肉30g、ソース20ml"
              placeholderTextColor="#9CA3AF"
              className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-3"
            />

            <Text className="text-sm font-medium text-gray-700 mb-1">購入元</Text>
            <TextInput
              value={purchaseSourceDraft}
              onChangeText={setPurchaseSourceDraft}
              placeholder="例: 業務スーパー / 地元精肉店"
              placeholderTextColor="#9CA3AF"
              className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-3"
            />

            <Text className="text-sm font-medium text-gray-700 mb-1">1個あたり費用（円）</Text>
            <TextInput
              value={costDraft}
              onChangeText={setCostDraft}
              placeholder="例: 180"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-3"
            />

            <Text className="text-sm font-medium text-gray-700 mb-1">作るにあたっての備考</Text>
            <TextInput
              value={notesDraft}
              onChangeText={setNotesDraft}
              placeholder="例: 焼き時間は中火で3分、仕上げに青のり"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-5"
            />

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleClearManual}
                disabled={saving}
                className="px-4 border border-red-300 rounded-xl py-3 items-center"
              >
                <Text className="text-red-600 font-semibold text-sm">削除</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={closeEditModal}
                disabled={saving}
                className="flex-1 border border-gray-300 rounded-xl py-3 items-center"
              >
                <Text className="text-gray-600 font-semibold">キャンセル</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveManual}
                disabled={saving}
                className={`flex-1 rounded-xl py-3 items-center ${saving ? 'bg-indigo-300' : 'bg-indigo-600'}`}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">保存</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
