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
import { DEMO_HANDOVER_NOTES, DEMO_SHIFT_ENTRIES, resolveDemoBranchId } from '../../../data/demoData';
import type { Branch } from '../../../types/database';

interface ShiftEntry {
  id: string;
  branch_id: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  members: string;
  note: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface HandoverNote {
  id: string;
  branch_id: string;
  from_shift: string;
  to_shift: string;
  content: string;
  created_by: string;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
}

interface ShiftHandoverProps {
  branch: Branch;
  onBack: () => void;
}

type ViewMode = 'shift' | 'handover';

export const ShiftHandover = ({ branch, onBack }: ShiftHandoverProps) => {
  const { authState } = useAuth();
  const isDemo = authState.status === 'demo';
  const demoBranchId = resolveDemoBranchId(branch);
  const [viewMode, setViewMode] = useState<ViewMode>('handover');
  const [shifts, setShifts] = useState<ShiftEntry[]>([]);
  const [handoverNotes, setHandoverNotes] = useState<HandoverNote[]>([]);
  const [loading, setLoading] = useState(true);

  // シフト追加モーダル
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftName, setShiftName] = useState('');
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [shiftMembers, setShiftMembers] = useState('');
  const [shiftNote, setShiftNote] = useState('');

  // 引き継ぎ追加モーダル
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [handoverFrom, setHandoverFrom] = useState('');
  const [handoverTo, setHandoverTo] = useState('');
  const [handoverContent, setHandoverContent] = useState('');
  const [handoverCreatedBy, setHandoverCreatedBy] = useState('');

  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (isDemo && demoBranchId) {
      setShifts((DEMO_SHIFT_ENTRIES[demoBranchId] ?? []).map((s) => ({ ...s, branch_id: branch.id })));
      setHandoverNotes((DEMO_HANDOVER_NOTES[demoBranchId] ?? []).map((n) => ({ ...n, branch_id: branch.id })));
      setLoading(false);
      return;
    }
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    try {
      const [shiftsRes, handoverRes] = await Promise.all([
        supabase
          .from('shift_entries')
          .select('*')
          .eq('branch_id', branch.id)
          .order('start_time', { ascending: true }),
        supabase
          .from('handover_notes')
          .select('*')
          .eq('branch_id', branch.id)
          .order('created_at', { ascending: false }),
      ]);
      if (shiftsRes.error) throw shiftsRes.error;
      if (handoverRes.error) throw handoverRes.error;
      setShifts(shiftsRes.data ?? []);
      setHandoverNotes(handoverRes.data ?? []);
    } catch (e) {
      console.error('[ShiftHandover] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [branch.id, isDemo, demoBranchId]);

  useEffect(() => {
    void fetchAll();

    if (isDemo || !isSupabaseConfigured()) return;

    const channel = supabase
      .channel(`shift_handover:${branch.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_entries', filter: `branch_id=eq.${branch.id}` }, () => { void fetchAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handover_notes', filter: `branch_id=eq.${branch.id}` }, () => { void fetchAll(); })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [branch.id, fetchAll, isDemo]);

  const handleAddShift = async () => {
    if (!shiftName.trim()) {
      alertNotify('入力エラー', 'シフト名を入力してください');
      return;
    }
    if (isDemo) {
      const now = new Date().toISOString();
      setShifts((prev) => [
        ...prev,
        {
          id: `demo-shift-${branch.id}-${Date.now()}`,
          branch_id: branch.id,
          shift_name: shiftName.trim(),
          start_time: shiftStart.trim(),
          end_time: shiftEnd.trim(),
          members: shiftMembers.trim(),
          note: shiftNote.trim(),
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ]);
      setShiftName(''); setShiftStart(''); setShiftEnd('');
      setShiftMembers(''); setShiftNote('');
      setShowShiftModal(false);
      return;
    }
    if (!isSupabaseConfigured()) {
      alertNotify('オフライン', 'オフライン時はシフトを追加できません');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('shift_entries').insert({
        branch_id: branch.id,
        shift_name: shiftName.trim(),
        start_time: shiftStart.trim(),
        end_time: shiftEnd.trim(),
        members: shiftMembers.trim(),
        note: shiftNote.trim(),
        is_active: true,
      });
      if (error) throw error;
      setShiftName(''); setShiftStart(''); setShiftEnd('');
      setShiftMembers(''); setShiftNote('');
      setShowShiftModal(false);
    } catch (e) {
      console.error('[ShiftHandover] add shift error:', e);
      alertNotify('エラー', 'シフトの追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleAddHandover = async () => {
    if (!handoverContent.trim()) {
      alertNotify('入力エラー', '引き継ぎ内容を入力してください');
      return;
    }
    if (isDemo) {
      const now = new Date().toISOString();
      setHandoverNotes((prev) => [
        {
          id: `demo-handover-${branch.id}-${Date.now()}`,
          branch_id: branch.id,
          from_shift: handoverFrom.trim(),
          to_shift: handoverTo.trim(),
          content: handoverContent.trim(),
          created_by: handoverCreatedBy.trim(),
          is_resolved: false,
          created_at: now,
          updated_at: now,
        },
        ...prev,
      ]);
      setHandoverFrom(''); setHandoverTo('');
      setHandoverContent(''); setHandoverCreatedBy('');
      setShowHandoverModal(false);
      return;
    }
    if (!isSupabaseConfigured()) {
      alertNotify('オフライン', 'オフライン時は引き継ぎを追加できません');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('handover_notes').insert({
        branch_id: branch.id,
        from_shift: handoverFrom.trim(),
        to_shift: handoverTo.trim(),
        content: handoverContent.trim(),
        created_by: handoverCreatedBy.trim(),
        is_resolved: false,
      });
      if (error) throw error;
      setHandoverFrom(''); setHandoverTo('');
      setHandoverContent(''); setHandoverCreatedBy('');
      setShowHandoverModal(false);
    } catch (e) {
      console.error('[ShiftHandover] add handover error:', e);
      alertNotify('エラー', '引き継ぎの追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleResolved = async (note: HandoverNote) => {
    if (isDemo) {
      setHandoverNotes((prev) =>
        prev.map((n) => n.id === note.id ? { ...n, is_resolved: !n.is_resolved, updated_at: new Date().toISOString() } : n)
      );
      return;
    }
    if (!isSupabaseConfigured()) return;
    try {
      await supabase
        .from('handover_notes')
        .update({ is_resolved: !note.is_resolved, updated_at: new Date().toISOString() })
        .eq('id', note.id);
      setHandoverNotes((prev) =>
        prev.map((n) => n.id === note.id ? { ...n, is_resolved: !n.is_resolved } : n)
      );
    } catch (e) {
      console.error('[ShiftHandover] toggle resolved error:', e);
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (isDemo) {
      setShifts((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    if (!isSupabaseConfigured()) return;
    try {
      await supabase.from('shift_entries').delete().eq('id', id);
      setShifts((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      alertNotify('エラー', '削除に失敗しました');
    }
  };

  const handleDeleteHandover = async (id: string) => {
    if (isDemo) {
      setHandoverNotes((prev) => prev.filter((n) => n.id !== id));
      return;
    }
    if (!isSupabaseConfigured()) return;
    try {
      await supabase.from('handover_notes').delete().eq('id', id);
      setHandoverNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      alertNotify('エラー', '削除に失敗しました');
    }
  };

  const formatDatetime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const unresolvedCount = handoverNotes.filter((n) => !n.is_resolved).length;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="シフト・引き継ぎ"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
        rightElement={
          <TouchableOpacity
            onPress={() => viewMode === 'shift' ? setShowShiftModal(true) : setShowHandoverModal(true)}
            className="bg-indigo-600 px-3 py-1.5 rounded-lg"
          >
            <Text className="text-white font-semibold text-sm">＋ 追加</Text>
          </TouchableOpacity>
        }
      />

      {/* タブ */}
      <View className="flex-row mx-4 mt-3 mb-3 bg-gray-200 rounded-xl p-1">
        <TouchableOpacity
          onPress={() => setViewMode('handover')}
          className={`flex-1 rounded-lg py-2.5 items-center ${viewMode === 'handover' ? 'bg-white' : ''}`}
        >
          <View className="flex-row items-center gap-1">
            <Text className={`text-sm font-semibold ${viewMode === 'handover' ? 'text-indigo-600' : 'text-gray-500'}`}>
              引き継ぎ
            </Text>
            {unresolvedCount > 0 && (
              <View className="bg-red-500 rounded-full w-4 h-4 items-center justify-center">
                <Text className="text-white text-xs font-bold">{unresolvedCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewMode('shift')}
          className={`flex-1 rounded-lg py-2.5 items-center ${viewMode === 'shift' ? 'bg-white' : ''}`}
        >
          <Text className={`text-sm font-semibold ${viewMode === 'shift' ? 'text-indigo-600' : 'text-gray-500'}`}>
            シフト一覧
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6366F1" />
          <Text className="text-gray-500 mt-2 text-sm">読み込み中...</Text>
        </View>
      ) : viewMode === 'handover' ? (
        /* 引き継ぎビュー */
        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
          {handoverNotes.length === 0 ? (
            <View className="items-center justify-center py-16">
              <Text className="text-5xl mb-4">📋</Text>
              <Text className="text-gray-400 text-base text-center">
                引き継ぎ事項がありません{'\n'}「＋ 追加」から登録しましょう
              </Text>
            </View>
          ) : (
            <View className="gap-3 pb-6">
              {handoverNotes.map((note) => (
                <Card key={note.id} className={`p-4 ${note.is_resolved ? 'opacity-50' : ''}`}>
                  {/* ヘッダー */}
                  <View className="flex-row items-start justify-between mb-2">
                    <View className="flex-1">
                      {(note.from_shift || note.to_shift) && (
                        <View className="flex-row items-center gap-1 mb-1 flex-wrap">
                          {note.from_shift ? (
                            <View className="bg-gray-100 px-2 py-0.5 rounded-md">
                              <Text className="text-xs text-gray-600 font-medium">{note.from_shift}</Text>
                            </View>
                          ) : null}
                          {note.from_shift && note.to_shift && (
                            <Text className="text-gray-400 text-xs">→</Text>
                          )}
                          {note.to_shift ? (
                            <View className="bg-indigo-100 px-2 py-0.5 rounded-md">
                              <Text className="text-xs text-indigo-600 font-medium">{note.to_shift}</Text>
                            </View>
                          ) : null}
                        </View>
                      )}
                      <Text className={`text-base text-gray-900 leading-relaxed ${note.is_resolved ? 'line-through text-gray-400' : ''}`}>
                        {note.content}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteHandover(note.id)}
                      className="p-1 ml-2"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text className="text-gray-300 text-lg">✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* フッター */}
                  <View className="flex-row items-center justify-between mt-1">
                    <View className="flex-row items-center gap-2">
                      {note.created_by ? (
                        <Text className="text-xs text-gray-400">{note.created_by}</Text>
                      ) : null}
                      <Text className="text-xs text-gray-400">{formatDatetime(note.created_at)}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleToggleResolved(note)}
                      className={`flex-row items-center gap-1 px-3 py-1.5 rounded-lg ${
                        note.is_resolved ? 'bg-gray-100' : 'bg-indigo-600'
                      }`}
                    >
                      <Text className={`text-xs font-semibold ${note.is_resolved ? 'text-gray-500' : 'text-white'}`}>
                        {note.is_resolved ? '未対応に戻す' : '対応済みにする'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        /* シフトビュー */
        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
          {shifts.length === 0 ? (
            <View className="items-center justify-center py-16">
              <Text className="text-5xl mb-4">🗓️</Text>
              <Text className="text-gray-400 text-base text-center">
                シフトが登録されていません{'\n'}「＋ 追加」から登録しましょう
              </Text>
            </View>
          ) : (
            <View className="gap-3 pb-6">
              {shifts.map((shift) => (
                <Card key={shift.id} className="p-4">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className="text-lg font-bold text-gray-900 mb-1">{shift.shift_name}</Text>
                      {(shift.start_time || shift.end_time) && (
                        <View className="flex-row items-center gap-1 mb-1">
                          <Text className="text-sm text-indigo-600 font-medium">
                            {shift.start_time}{shift.start_time && shift.end_time ? ' 〜 ' : ''}{shift.end_time}
                          </Text>
                        </View>
                      )}
                      {shift.members ? (
                        <View className="flex-row flex-wrap gap-1 mb-1">
                          {shift.members.split(/[、,，\s]+/).filter(Boolean).map((m, i) => (
                            <View key={i} className="bg-indigo-100 px-2 py-0.5 rounded-full">
                              <Text className="text-xs text-indigo-700 font-medium">{m}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      {shift.note ? (
                        <Text className="text-sm text-gray-500 mt-1">{shift.note}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteShift(shift.id)}
                      className="p-1 ml-2"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text className="text-gray-300 text-lg">✕</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* シフト追加モーダル */}
      <Modal visible={showShiftModal} transparent animationType="slide" onRequestClose={() => setShowShiftModal(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <ScrollView className="bg-white rounded-t-2xl" keyboardShouldPersistTaps="handled">
            <View className="p-6">
              <Text className="text-lg font-bold text-gray-900 mb-4">シフトを追加</Text>

              <Text className="text-sm font-medium text-gray-700 mb-1">シフト名 *</Text>
              <TextInput value={shiftName} onChangeText={setShiftName} placeholder="例: 午前シフト" placeholderTextColor="#9CA3AF"
                className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-3" />

              <View className="flex-row gap-3 mb-3">
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-700 mb-1">開始時刻</Text>
                  <TextInput value={shiftStart} onChangeText={setShiftStart} placeholder="例: 9:00" placeholderTextColor="#9CA3AF"
                    className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-700 mb-1">終了時刻</Text>
                  <TextInput value={shiftEnd} onChangeText={setShiftEnd} placeholder="例: 13:00" placeholderTextColor="#9CA3AF"
                    className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50" />
                </View>
              </View>

              <Text className="text-sm font-medium text-gray-700 mb-1">担当メンバー</Text>
              <TextInput value={shiftMembers} onChangeText={setShiftMembers} placeholder="例: 田中、鈴木、佐藤" placeholderTextColor="#9CA3AF"
                className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-3" />

              <Text className="text-sm font-medium text-gray-700 mb-1">メモ</Text>
              <TextInput value={shiftNote} onChangeText={setShiftNote} placeholder="注意事項など" placeholderTextColor="#9CA3AF"
                multiline numberOfLines={2}
                className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-5" />

              <View className="flex-row gap-3">
                <TouchableOpacity onPress={() => setShowShiftModal(false)}
                  className="flex-1 border border-gray-300 rounded-xl py-3 items-center">
                  <Text className="text-gray-600 font-semibold">キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddShift} disabled={saving}
                  className={`flex-1 rounded-xl py-3 items-center ${saving ? 'bg-indigo-400' : 'bg-indigo-600'}`}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">追加する</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* 引き継ぎ追加モーダル */}
      <Modal visible={showHandoverModal} transparent animationType="slide" onRequestClose={() => setShowHandoverModal(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <ScrollView className="bg-white rounded-t-2xl" keyboardShouldPersistTaps="handled">
            <View className="p-6">
              <Text className="text-lg font-bold text-gray-900 mb-4">引き継ぎを追加</Text>

              <View className="flex-row gap-3 mb-3">
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-700 mb-1">引き継ぐシフト（任意）</Text>
                  <TextInput value={handoverFrom} onChangeText={setHandoverFrom} placeholder="例: 午前シフト" placeholderTextColor="#9CA3AF"
                    className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-700 mb-1">引き継ぎ先（任意）</Text>
                  <TextInput value={handoverTo} onChangeText={setHandoverTo} placeholder="例: 午後シフト" placeholderTextColor="#9CA3AF"
                    className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50" />
                </View>
              </View>

              <Text className="text-sm font-medium text-gray-700 mb-1">引き継ぎ内容 *</Text>
              <TextInput value={handoverContent} onChangeText={setHandoverContent}
                placeholder="例: 〇〇のお客様が後で取りに来ます。在庫が少ないので補充してください。"
                placeholderTextColor="#9CA3AF" multiline numberOfLines={4}
                className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-3" />

              <Text className="text-sm font-medium text-gray-700 mb-1">記入者名（任意）</Text>
              <TextInput value={handoverCreatedBy} onChangeText={setHandoverCreatedBy} placeholder="例: 田中" placeholderTextColor="#9CA3AF"
                className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-5" />

              <View className="flex-row gap-3">
                <TouchableOpacity onPress={() => setShowHandoverModal(false)}
                  className="flex-1 border border-gray-300 rounded-xl py-3 items-center">
                  <Text className="text-gray-600 font-semibold">キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddHandover} disabled={saving}
                  className={`flex-1 rounded-xl py-3 items-center ${saving ? 'bg-indigo-400' : 'bg-indigo-600'}`}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">追加する</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
