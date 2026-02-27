import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header, Card } from '../../common';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { alertNotify } from '../../../lib/alertUtils';
import { useAuth } from '../../../contexts/AuthContext';
import { DEMO_TASK_CHECKLISTS, resolveDemoBranchId } from '../../../data/demoData';
import type { Branch } from '../../../types/database';

interface TaskItem {
  id: string;
  branch_id: string;
  title: string;
  is_done: boolean;
  done_by: string | null;
  assigned_to: string | null;
  note: string;
  category: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface TaskChecklistProps {
  branch: Branch;
  onBack: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  '準備': 'bg-blue-100 text-blue-700',
  '調理': 'bg-orange-100 text-orange-700',
  '接客': 'bg-green-100 text-green-700',
  '片付け': 'bg-gray-100 text-gray-700',
  'その他': 'bg-purple-100 text-purple-700',
};

const CATEGORIES = Object.keys(CATEGORY_COLORS);

export const TaskChecklist = ({ branch, onBack }: TaskChecklistProps) => {
  const { authState } = useAuth();
  const isDemo = authState.status === 'demo';
  const demoBranchId = resolveDemoBranchId(branch);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newCategory, setNewCategory] = useState('その他');
  const [newAssignee, setNewAssignee] = useState<string | null>(null);
  const [doneByName, setDoneByName] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterDone, setFilterDone] = useState<'all' | 'todo' | 'done'>('all');
  const [recorderNames, setRecorderNames] = useState<string[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningTask, setAssigningTask] = useState<TaskItem | null>(null);
  const [assigning, setAssigning] = useState(false);

  const normalizeTask = useCallback((task: Partial<TaskItem>): TaskItem => ({
    id: String(task.id ?? ''),
    branch_id: String(task.branch_id ?? branch.id),
    title: String(task.title ?? ''),
    is_done: task.is_done === true,
    done_by: typeof task.done_by === 'string' ? task.done_by : null,
    assigned_to: typeof task.assigned_to === 'string' ? task.assigned_to : null,
    note: String(task.note ?? ''),
    category: String(task.category ?? 'その他'),
    sort_order: Number(task.sort_order ?? 0),
    created_at: String(task.created_at ?? new Date().toISOString()),
    updated_at: String(task.updated_at ?? new Date().toISOString()),
  }), [branch.id]);

  const fetchTasks = useCallback(async () => {
    if (isDemo && demoBranchId) {
      const seeded = (DEMO_TASK_CHECKLISTS[demoBranchId] ?? []).map((task) => ({
        ...normalizeTask(task),
        branch_id: branch.id,
      }));
      setTasks(seeded);
      setLoading(false);
      return;
    }
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('task_checklists')
        .select('*')
        .eq('branch_id', branch.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      setTasks((data ?? []).map((row) => normalizeTask(row)));
    } catch (e) {
      console.error('[TaskChecklist] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [branch.id, isDemo, demoBranchId, normalizeTask]);

  const fetchRecorders = useCallback(async () => {
    if (isDemo) {
      setRecorderNames(['店長', '店員1', '店員2', '店員3']);
      return;
    }
    if (!isSupabaseConfigured()) {
      setRecorderNames([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('branch_recorders')
        .select('recorder_name')
        .eq('branch_id', branch.id)
        .eq('is_active', true)
        .order('group_id', { ascending: true })
        .order('recorder_name', { ascending: true });
      if (error) throw error;
      const names = (data ?? [])
        .map((row) => String(row.recorder_name ?? '').trim())
        .filter((name) => name.length > 0);
      setRecorderNames(names);
    } catch (e) {
      console.error('[TaskChecklist] fetch recorders error:', e);
      setRecorderNames([]);
    }
  }, [branch.id, isDemo]);

  useEffect(() => {
    void fetchTasks();
    void fetchRecorders();

    if (isDemo || !isSupabaseConfigured()) return;

    const channel = supabase
      .channel(`task_checklists:${branch.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_checklists', filter: `branch_id=eq.${branch.id}` },
        () => { void fetchTasks(); }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [branch.id, fetchTasks, fetchRecorders, isDemo]);

  const handleToggleDone = async (task: TaskItem) => {
    if (isDemo) {
      const nowDone = !task.is_done;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, is_done: nowDone, done_by: nowDone ? (doneByName.trim() || null) : null, updated_at: new Date().toISOString() }
            : t
        )
      );
      return;
    }
    if (!isSupabaseConfigured()) {
      alertNotify('オフライン', 'オフライン時はチェックを変更できません');
      return;
    }
    try {
      const nowDone = !task.is_done;
      const { error } = await supabase
        .from('task_checklists')
        .update({
          is_done: nowDone,
          done_by: nowDone ? (doneByName.trim() || null) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);
      if (error) throw error;
      // リアルタイム購読で自動更新されるが、即時反映のためローカルも更新
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, is_done: nowDone, done_by: nowDone ? (doneByName.trim() || null) : null }
            : t
        )
      );
      void fetchTasks();
    } catch (e) {
      console.error('[TaskChecklist] toggle error:', e);
      alertNotify('エラー', 'チェックの更新に失敗しました');
    }
  };

  const handleAddTask = async () => {
    const title = newTitle.trim();
    if (!title) {
      alertNotify('入力エラー', 'タスク名を入力してください');
      return;
    }
    if (isDemo) {
      const maxOrder = tasks.reduce((m, t) => Math.max(m, t.sort_order), 0);
      const now = new Date().toISOString();
      setTasks((prev) => [
        ...prev,
        {
          id: `demo-task-${branch.id}-${Date.now()}`,
          branch_id: branch.id,
          title,
          is_done: false,
          done_by: null,
          assigned_to: newAssignee?.trim() ? newAssignee : null,
          note: newNote.trim(),
          category: newCategory,
          sort_order: maxOrder + 1,
          created_at: now,
          updated_at: now,
        },
      ]);
      setNewTitle('');
      setNewNote('');
      setNewCategory('その他');
      setNewAssignee(null);
      setShowAddModal(false);
      return;
    }
    if (!isSupabaseConfigured()) {
      alertNotify('オフライン', 'オフライン時はタスクを追加できません');
      return;
    }
    setSaving(true);
    try {
      const maxOrder = tasks.reduce((m, t) => Math.max(m, t.sort_order), 0);
      const { error } = await supabase.from('task_checklists').insert({
        branch_id: branch.id,
        title,
        is_done: false,
        done_by: null,
        assigned_to: newAssignee?.trim() ? newAssignee : null,
        note: newNote.trim(),
        category: newCategory,
        sort_order: maxOrder + 1,
      });
      if (error) throw error;
      setNewTitle('');
      setNewNote('');
      setNewCategory('その他');
      setNewAssignee(null);
      setShowAddModal(false);
      void fetchTasks();
    } catch (e) {
      console.error('[TaskChecklist] add error:', e);
      alertNotify('エラー', 'タスクの追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignTask = async (task: TaskItem, assignee: string | null) => {
    if (isDemo) {
      setTasks((prev) =>
        prev.map((item) =>
          item.id === task.id
            ? { ...item, assigned_to: assignee, updated_at: new Date().toISOString() }
            : item
        ),
      );
      setShowAssignModal(false);
      setAssigningTask(null);
      return;
    }
    if (!isSupabaseConfigured()) {
      alertNotify('オフライン', 'オフライン時は担当者を変更できません');
      return;
    }

    setAssigning(true);
    try {
      const { error } = await supabase
        .from('task_checklists')
        .update({
          assigned_to: assignee,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);
      if (error) throw error;

      setTasks((prev) =>
        prev.map((item) => (item.id === task.id ? { ...item, assigned_to: assignee } : item)),
      );
      setShowAssignModal(false);
      setAssigningTask(null);
      void fetchTasks();
    } catch (e) {
      console.error('[TaskChecklist] assign error:', e);
      alertNotify('エラー', '担当者の更新に失敗しました');
    } finally {
      setAssigning(false);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (isDemo) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      return;
    }
    if (!isSupabaseConfigured()) return;
    try {
      const { error } = await supabase.from('task_checklists').delete().eq('id', id);
      if (error) throw error;
      setTasks((prev) => prev.filter((t) => t.id !== id));
      void fetchTasks();
    } catch (e) {
      console.error('[TaskChecklist] delete error:', e);
      alertNotify('エラー', '削除に失敗しました');
    }
  };

  const handleResetAll = async () => {
    if (isDemo) {
      setTasks((prev) => prev.map((t) => ({ ...t, is_done: false, done_by: null, updated_at: new Date().toISOString() })));
      return;
    }
    if (!isSupabaseConfigured()) return;
    try {
      const { error } = await supabase
        .from('task_checklists')
        .update({ is_done: false, done_by: null, updated_at: new Date().toISOString() })
        .eq('branch_id', branch.id);
      if (error) throw error;
      setTasks((prev) => prev.map((t) => ({ ...t, is_done: false, done_by: null })));
      void fetchTasks();
    } catch (e) {
      console.error('[TaskChecklist] reset error:', e);
      alertNotify('エラー', 'リセットに失敗しました');
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filterDone === 'todo') return !t.is_done;
    if (filterDone === 'done') return t.is_done;
    return true;
  });

  const doneCount = tasks.filter((t) => t.is_done).length;
  const totalCount = tasks.length;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="仕事チェックリスト"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
        rightElement={
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            className="bg-blue-600 px-3 py-1.5 rounded-lg"
          >
            <Text className="text-white font-semibold text-sm">＋ 追加</Text>
          </TouchableOpacity>
        }
      />

      {/* 進捗バー */}
      {totalCount > 0 && (
        <View className="mx-4 mt-3 mb-1">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-gray-500">進捗</Text>
            <Text className="text-xs font-semibold text-gray-700">{doneCount} / {totalCount} 完了</Text>
          </View>
          <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <View
              className="h-2 bg-blue-500 rounded-full"
              style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
            />
          </View>
        </View>
      )}

      {/* フィルター */}
      <View className="flex-row mx-4 mt-3 mb-2 bg-gray-200 rounded-xl p-1">
        {(['all', 'todo', 'done'] as const).map((key) => (
          <TouchableOpacity
            key={key}
            onPress={() => setFilterDone(key)}
            className={`flex-1 rounded-lg py-2 items-center ${filterDone === key ? 'bg-white' : ''}`}
          >
            <Text className={`text-xs font-semibold ${filterDone === key ? 'text-blue-600' : 'text-gray-500'}`}>
              {key === 'all' ? 'すべて' : key === 'todo' ? '未完了' : '完了済み'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 担当者名入力 */}
      <View className="mx-4 mb-2 flex-row items-center gap-2">
        <Text className="text-xs text-gray-500 shrink-0">あなたの名前：</Text>
        <TextInput
          value={doneByName}
          onChangeText={setDoneByName}
          placeholder="例: 田中"
          placeholderTextColor="#9CA3AF"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-900"
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text className="text-gray-500 mt-2 text-sm">読み込み中...</Text>
        </View>
      ) : filteredTasks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-4">✅</Text>
          <Text className="text-gray-400 text-base text-center">
            {tasks.length === 0
              ? 'タスクがありません\n「＋ 追加」からタスクを登録しましょう'
              : 'このフィルターに一致するタスクはありません'}
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
          <View className="gap-2 pb-6 pt-1">
            {filteredTasks.map((task) => (
              <TouchableOpacity
                key={task.id}
                onPress={() => handleToggleDone(task)}
                activeOpacity={0.75}
              >
                <Card className={`p-4 flex-row items-start gap-3 ${task.is_done ? 'opacity-60' : ''}`}>
                  {/* チェックボックス */}
                  <View
                    className={`w-6 h-6 rounded-full border-2 items-center justify-center shrink-0 mt-0.5 ${
                      task.is_done ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                    }`}
                  >
                    {task.is_done && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>

                  {/* 内容 */}
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 flex-wrap mb-0.5">
                      <Text
                        className={`text-base font-semibold ${task.is_done ? 'line-through text-gray-400' : 'text-gray-900'}`}
                      >
                        {task.title}
                      </Text>
                      <View className={`px-2 py-0.5 rounded-full ${CATEGORY_COLORS[task.category] ?? 'bg-gray-100 text-gray-600'}`}>
                        <Text className="text-xs font-medium">{task.category}</Text>
                      </View>
                    </View>
                    {task.note ? (
                      <Text className="text-sm text-gray-500 mt-0.5">{task.note}</Text>
                    ) : null}
                    {task.assigned_to ? (
                      <Text className="text-xs text-indigo-600 mt-1">担当: {task.assigned_to}</Text>
                    ) : (
                      <Text className="text-xs text-gray-400 mt-1">担当: 未設定</Text>
                    )}
                    {task.is_done && task.done_by ? (
                      <Text className="text-xs text-blue-500 mt-1">{task.done_by} が完了</Text>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => {
                        setAssigningTask(task);
                        setShowAssignModal(true);
                      }}
                      className="self-start mt-2 px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50"
                    >
                      <Text className="text-xs font-semibold text-indigo-700">
                        {task.assigned_to ? '担当者を変更' : '担当者を割り当て'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* 削除ボタン */}
                  <TouchableOpacity
                    onPress={() => handleDeleteTask(task.id)}
                    className="p-1"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text className="text-gray-300 text-lg">✕</Text>
                  </TouchableOpacity>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* 全リセットボタン */}
      {doneCount > 0 && (
        <View className="px-4 pb-4">
          <TouchableOpacity
            onPress={handleResetAll}
            className="border border-gray-300 rounded-xl py-3 items-center"
            activeOpacity={0.8}
          >
            <Text className="text-gray-500 text-sm font-medium">チェックをすべてリセット</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* タスク追加モーダル */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-2xl p-6">
            <Text className="text-lg font-bold text-gray-900 mb-4">タスクを追加</Text>

            <Text className="text-sm font-medium text-gray-700 mb-1">タスク名 *</Text>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="例: 材料の補充確認"
              placeholderTextColor="#9CA3AF"
              className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-3"
            />

            <Text className="text-sm font-medium text-gray-700 mb-1">メモ（任意）</Text>
            <TextInput
              value={newNote}
              onChangeText={setNewNote}
              placeholder="詳細・注意事項など"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={2}
              className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-3"
            />

            <Text className="text-sm font-medium text-gray-700 mb-2">カテゴリ</Text>
            <View className="flex-row flex-wrap gap-2 mb-5">
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setNewCategory(cat)}
                  className={`px-3 py-1.5 rounded-full border ${
                    newCategory === cat
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-white border-gray-300'
                  }`}
                >
                  <Text className={`text-sm font-medium ${newCategory === cat ? 'text-white' : 'text-gray-600'}`}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-sm font-medium text-gray-700 mb-2">担当者（任意）</Text>
            <View className="flex-row flex-wrap gap-2 mb-5">
              <TouchableOpacity
                onPress={() => setNewAssignee(null)}
                className={`px-3 py-1.5 rounded-full border ${
                  !newAssignee ? 'bg-gray-600 border-gray-600' : 'bg-white border-gray-300'
                }`}
              >
                <Text className={`text-sm font-medium ${!newAssignee ? 'text-white' : 'text-gray-600'}`}>
                  未設定
                </Text>
              </TouchableOpacity>
              {recorderNames.map((name) => (
                <TouchableOpacity
                  key={name}
                  onPress={() => setNewAssignee(name)}
                  className={`px-3 py-1.5 rounded-full border ${
                    newAssignee === name ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'
                  }`}
                >
                  <Text className={`text-sm font-medium ${newAssignee === name ? 'text-white' : 'text-gray-600'}`}>
                    {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => {
                  setShowAddModal(false);
                  setNewTitle('');
                  setNewNote('');
                  setNewCategory('その他');
                  setNewAssignee(null);
                }}
                className="flex-1 border border-gray-300 rounded-xl py-3 items-center"
              >
                <Text className="text-gray-600 font-semibold">キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddTask}
                disabled={saving}
                className={`flex-1 rounded-xl py-3 items-center ${saving ? 'bg-blue-400' : 'bg-blue-600'}`}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text className="text-white font-bold">追加する</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 担当者割り当てモーダル */}
      <Modal visible={showAssignModal} transparent animationType="slide" onRequestClose={() => setShowAssignModal(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-2xl p-6">
            <Text className="text-lg font-bold text-gray-900 mb-1">担当者を設定</Text>
            <Text className="text-sm text-gray-500 mb-4">{assigningTask?.title ?? ''}</Text>

            <View className="flex-row flex-wrap gap-2 mb-5">
              <TouchableOpacity
                onPress={() => assigningTask && handleAssignTask(assigningTask, null)}
                disabled={assigning}
                className={`px-3 py-1.5 rounded-full border ${
                  !assigningTask?.assigned_to ? 'bg-gray-600 border-gray-600' : 'bg-white border-gray-300'
                }`}
              >
                <Text className={`text-sm font-medium ${!assigningTask?.assigned_to ? 'text-white' : 'text-gray-600'}`}>
                  未設定
                </Text>
              </TouchableOpacity>
              {recorderNames.map((name) => (
                <TouchableOpacity
                  key={name}
                  onPress={() => assigningTask && handleAssignTask(assigningTask, name)}
                  disabled={assigning}
                  className={`px-3 py-1.5 rounded-full border ${
                    assigningTask?.assigned_to === name ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'
                  }`}
                >
                  <Text className={`text-sm font-medium ${assigningTask?.assigned_to === name ? 'text-white' : 'text-gray-600'}`}>
                    {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {recorderNames.length === 0 && (
              <Text className="text-sm text-gray-500 mb-4">
                登録者が見つかりません。設定画面で登録者を追加すると担当者に選べます。
              </Text>
            )}

            <TouchableOpacity
              onPress={() => {
                setShowAssignModal(false);
                setAssigningTask(null);
              }}
              className="border border-gray-300 rounded-xl py-3 items-center"
            >
              <Text className="text-gray-600 font-semibold">閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
