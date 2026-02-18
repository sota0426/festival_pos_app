import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { Button, Card, Header, Input, Modal } from '../../common';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { alertNotify } from '../../../lib/alertUtils';
import { getPrepIngredients, savePrepIngredients } from '../../../lib/storage';
import { getSyncEnabled } from '../../../lib/syncMode';
import type { Branch, PrepIngredient } from '../../../types/database';

interface PrepInventoryProps {
  branch: Branch;
  onBack: () => void;
}

export const PrepInventory = ({ branch, onBack }: PrepInventoryProps) => {
  const [ingredients, setIngredients] = useState<PrepIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('個');
  const [newStock, setNewStock] = useState('0');
  const [newNote, setNewNote] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [editingNoteById, setEditingNoteById] = useState<Record<string, boolean>>({});

  const sortedIngredients = useMemo(
    () => [...ingredients].sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name, 'ja')),
    [ingredients],
  );

  const normalizeIngredient = (row: PrepIngredient): PrepIngredient => ({
    ...row,
    current_stock: Number(row.current_stock) || 0,
    note: row.note ?? '',
  });

  const buildNoteDrafts = (list: PrepIngredient[]): Record<string, string> => {
    const drafts: Record<string, string> = {};
    list.forEach((item) => {
      drafts[item.id] = item.note ?? '';
    });
    return drafts;
  };

  const fetchIngredients = useCallback(async () => {
    setLoading(true);
    try {
      const local = (await getPrepIngredients(branch.id)).map(normalizeIngredient);
      setIngredients(local);
      setNoteDrafts(buildNoteDrafts(local));

      if (!isSupabaseConfigured() || !getSyncEnabled()) return;

      const { data, error } = await supabase
        .from('prep_ingredients')
        .select('*')
        .eq('branch_id', branch.id)
        .order('ingredient_name', { ascending: true });
      if (error) throw error;

      const remote = ((data ?? []) as PrepIngredient[]).map(normalizeIngredient);
      setIngredients(remote);
      setNoteDrafts(buildNoteDrafts(remote));
      await savePrepIngredients(branch.id, remote);
    } catch (error) {
      console.error('Failed to load prep ingredients:', error);
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

  const refreshIngredientsSilently = useCallback(async () => {
    try {
      if (!isSupabaseConfigured() || !getSyncEnabled()) return;
      const { data, error } = await supabase
        .from('prep_ingredients')
        .select('*')
        .eq('branch_id', branch.id)
        .order('ingredient_name', { ascending: true });
      if (error) throw error;
      const remote = ((data ?? []) as PrepIngredient[]).map(normalizeIngredient);
      setIngredients(remote);
      setNoteDrafts(buildNoteDrafts(remote));
      await savePrepIngredients(branch.id, remote);
    } catch (error) {
      console.error('Failed to refresh prep ingredients:', error);
    }
  }, [branch.id]);

  useEffect(() => {
    fetchIngredients();
  }, [fetchIngredients]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !getSyncEnabled()) return;

    // Web環境ではWS接続失敗が出やすいため、Realtime購読は使わずポーリングで同期
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (Platform.OS !== 'web') {
      channel = supabase
        .channel(`prep-ingredients-${branch.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'prep_ingredients',
            filter: `branch_id=eq.${branch.id}`,
          },
          () => {
            void refreshIngredientsSilently();
          },
        )
        .subscribe();
    }

    const pollTimer = setInterval(() => {
      void refreshIngredientsSilently();
    }, 15000);

    return () => {
      clearInterval(pollTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [branch.id, refreshIngredientsSilently]);

  const resetAddForm = () => {
    setNewName('');
    setNewUnit('個');
    setNewStock('0');
    setNewNote('');
  };

  const handleAddIngredient = async () => {
    const name = newName.trim();
    const unit = newUnit.trim() || '個';
    const stock = Number(newStock);
    if (!name) {
      alertNotify('入力エラー', '材料名を入力してください');
      return;
    }
    if (Number.isNaN(stock) || stock < 0) {
      alertNotify('入力エラー', '在庫数は0以上の数値で入力してください');
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const nextIngredient: PrepIngredient = {
      id: Crypto.randomUUID(),
      branch_id: branch.id,
      ingredient_name: name,
      unit,
      current_stock: stock,
      note: newNote.trim(),
      created_at: now,
      updated_at: now,
    };

    try {
      const nextLocal = [...ingredients, nextIngredient];
      setIngredients(nextLocal);
      await savePrepIngredients(branch.id, nextLocal);

      if (isSupabaseConfigured() && getSyncEnabled()) {
        const { error } = await supabase.from('prep_ingredients').insert(nextIngredient);
        if (error) throw error;
      }

      setShowAddModal(false);
      resetAddForm();
      alertNotify('登録完了', `「${name}」を追加しました`);
    } catch (error) {
      console.error('Failed to add ingredient:', error);
      await fetchIngredients();
      alertNotify('エラー', '材料の登録に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const updateIngredientStock = async (ingredientId: string, delta: number) => {
    const target = ingredients.find((item) => item.id === ingredientId);
    if (!target) return;
    const nextStock = Math.max(0, target.current_stock + delta);
    const now = new Date().toISOString();
    const nextList = ingredients.map((item) =>
      item.id === ingredientId ? { ...item, current_stock: nextStock, updated_at: now } : item,
    );

    setIngredients(nextList);
    await savePrepIngredients(branch.id, nextList);

    if (isSupabaseConfigured() && getSyncEnabled()) {
      const { error } = await supabase
        .from('prep_ingredients')
        .update({ current_stock: nextStock, updated_at: now })
        .eq('id', ingredientId);
      if (error) {
        console.error('Failed to update stock:', error);
        await fetchIngredients();
        alertNotify('エラー', '在庫更新に失敗しました');
      }
    }
  };

  const saveIngredientNote = async (ingredientId: string) => {
    const target = ingredients.find((item) => item.id === ingredientId);
    if (!target) return;
    const nextNote = (noteDrafts[ingredientId] ?? '').trim();
    const now = new Date().toISOString();
    const nextList = ingredients.map((item) =>
      item.id === ingredientId ? { ...item, note: nextNote, updated_at: now } : item,
    );

    setIngredients(nextList);
    await savePrepIngredients(branch.id, nextList);

    if (isSupabaseConfigured() && getSyncEnabled()) {
      const { error } = await supabase
        .from('prep_ingredients')
        .update({ note: nextNote, updated_at: now })
        .eq('id', ingredientId);
      if (error) {
        console.error('Failed to save note:', error);
        await fetchIngredients();
        alertNotify('エラー', '備考の保存に失敗しました');
        return;
      }
    }

    setEditingNoteById((prev) => ({ ...prev, [ingredientId]: false }));
  };

  const deleteIngredient = async (ingredient: PrepIngredient) => {
    const confirmed = await new Promise<boolean>((resolve) => {
      const message = `「${ingredient.ingredient_name}」を削除しますか？`;
      if (Platform.OS === 'web') {
        resolve(window.confirm(message));
      } else {
        Alert.alert('材料削除', message, [
          { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
          { text: '削除', style: 'destructive', onPress: () => resolve(true) },
        ]);
      }
    });
    if (!confirmed) return;

    try {
      const next = ingredients.filter((item) => item.id !== ingredient.id);
      setIngredients(next);
      await savePrepIngredients(branch.id, next);

      if (isSupabaseConfigured() && getSyncEnabled()) {
        const { error } = await supabase.from('prep_ingredients').delete().eq('id', ingredient.id);
        if (error) throw error;
      }
    } catch (error) {
      console.error('Failed to delete ingredient:', error);
      await fetchIngredients();
      alertNotify('エラー', '材料の削除に失敗しました');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="調理の下準備"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
        rightElement={<Button title="+ 材料登録" onPress={() => setShowAddModal(true)} size="sm" />}
      />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-gray-500 mt-2">読み込み中...</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 p-4">
          <Card className="mb-3 bg-blue-50 border border-blue-200 p-3">
            <Text className="text-blue-800 font-semibold text-sm">材料在庫は店舗スタッフ間で共有されます</Text>
            <Text className="text-blue-600 text-xs mt-1">
              材料を登録して在庫を更新すると、同じ店舗の別端末でも同じ在庫を確認できます。
            </Text>
          </Card>

          {sortedIngredients.map((item) => (
            <Card key={item.id} className="mb-2 p-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-gray-900 font-bold text-base">{item.ingredient_name}</Text>
                  <Text className={`text-sm mt-0.5 ${item.current_stock <= 3 ? 'text-red-600' : 'text-gray-500'}`}>
                    在庫: {item.current_stock.toLocaleString()} {item.unit}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => deleteIngredient(item)}
                  className="px-2 py-1 rounded bg-red-50"
                  activeOpacity={0.8}
                >
                  <Text className="text-red-600 text-xs font-semibold">削除</Text>
                </TouchableOpacity>
              </View>
              <View className="flex-row items-center gap-2 mt-3">
                <TouchableOpacity
                  onPress={() => updateIngredientStock(item.id, -1)}
                  className="px-3 py-2 rounded-lg bg-gray-200"
                  activeOpacity={0.8}
                >
                  <Text className="text-gray-700 font-bold">-1</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => updateIngredientStock(item.id, 1)}
                  className="px-3 py-2 rounded-lg bg-green-100"
                  activeOpacity={0.8}
                >
                  <Text className="text-green-700 font-bold">+1</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => updateIngredientStock(item.id, 5)}
                  className="px-3 py-2 rounded-lg bg-green-200"
                  activeOpacity={0.8}
                >
                  <Text className="text-green-800 font-bold">+5</Text>
                </TouchableOpacity>
              </View>
              <View className="mt-3">
                <Text className="text-gray-600 text-xs mb-1">備考（スタッフ共有）</Text>
                {editingNoteById[item.id] ? (
                  <>
                    <TextInput
                      value={noteDrafts[item.id] ?? item.note ?? ''}
                      onChangeText={(text) =>
                        setNoteDrafts((prev) => ({ 
                          ...prev, 
                          [item.id]: text 
                        }))
                      }
                      placeholder=""
                      multiline
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-h-[64px]"
                    />
                    <View className="mt-2 flex-row justify-end gap-2">
                      <TouchableOpacity
                        onPress={() => {
                          setNoteDrafts((prev) => ({ ...prev, [item.id]: item.note ?? '' }));
                          setEditingNoteById((prev) => ({ ...prev, [item.id]: false }));
                        }}
                        className="px-3 py-1.5 rounded bg-gray-100"
                        activeOpacity={0.8}
                      >
                        <Text className="text-gray-700 text-xs font-semibold">キャンセル</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => saveIngredientNote(item.id)}
                        className="px-3 py-1.5 rounded bg-blue-50"
                        activeOpacity={0.8}
                      >
                        <Text className="text-blue-700 text-xs font-semibold">保存</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <View className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 flex-row justify-between">
                    <Text className={`text-sm ${item.note ? 'text-gray-700' : 'text-gray-400'}`}>
                      {item.note || '備考は未設定です'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setEditingNoteById((prev) => ({ ...prev, [item.id]: true }))}
                      className="px-3 rounded bg-blue-50"
                      activeOpacity={0.8}
                    >
                      <Text className="text-blue-700 text-xs font-semibold">編集</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </Card>
          ))}

          {sortedIngredients.length === 0 && (
            <Card className="p-6">
              <Text className="text-gray-500 text-center">まだ材料が登録されていません</Text>
              <Text className="text-gray-400 text-center text-sm mt-1">右上の「+ 材料登録」から追加してください</Text>
            </Card>
          )}
        </ScrollView>
      )}

      <Modal
        visible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          resetAddForm();
        }}
        title="材料登録"
      >
        <Input
          label="材料名"
          value={newName}
          onChangeText={setNewName}
          placeholder="例: キャベツ"
        />
        <Input
          label="単位"
          value={newUnit}
          onChangeText={setNewUnit}
          placeholder="例: 個 / 袋 / kg"
        />
        <Input
          label="現在在庫"
          value={newStock}
          onChangeText={setNewStock}
          keyboardType="numeric"
          placeholder="0"
        />
        <Input
          label="備考"
          value={newNote}
          onChangeText={setNewNote}
          placeholder="例: 最低10個は保存"
        />
        <View className="flex-row gap-2 mt-2">
          <View className="flex-1">
            <Button
              title="キャンセル"
              variant="secondary"
              onPress={() => {
                setShowAddModal(false);
                resetAddForm();
              }}
            />
          </View>
          <View className="flex-1">
            <Button
              title="登録"
              onPress={handleAddIngredient}
              loading={saving}
              disabled={saving}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
