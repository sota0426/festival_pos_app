import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, RefreshControl, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Button, Input, Card, Header, Modal } from '../common';
import { alertNotify } from '../../lib/alertUtils';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Branch } from '../../types/database';

interface BranchManagementProps {
  onBack: () => void;
}

const CSV_HEADER = 'branch_code,branch_name,password,sales_target,status';

const toCsvCell = (value: string | number): string => {
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

type CsvImportRow = {
  branch_code: string;
  branch_name: string;
  password: string;
  sales_target: number;
  status: 'active' | 'inactive';
};

type ImportPreview = {
  newRows: CsvImportRow[];
  updateRows: (CsvImportRow & { existingId: string })[];
  errors: string[];
};

export const BranchManagement = ({ onBack }: BranchManagementProps) => {
  const { authState } = useAuth();
  const ownerId = authState.status === 'authenticated' ? authState.user.id : null;
  const organizationId =
    authState.status === 'authenticated' ? authState.subscription.organization_id : null;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newSalesTarget, setNewSalesTarget] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);

  const resetForm = () => {
    setNewBranchName('');
    setNewPassword('');
    setNewSalesTarget('');
  };

  const generateBranchCode = (existingBranches: Array<Pick<Branch, 'branch_code'>>): string => {
    const maxNumber = existingBranches.reduce((max, branch) => {
      const num = parseInt(branch.branch_code.replace('S', ''), 10);
      return num > max ? num : max;
    }, 0);
    return `S${String(maxNumber + 1).padStart(3, '0')}`;
  };

  const fetchNextBranchCode = async (): Promise<string> => {
    const { data, error } = await supabase
      .from('branches')
      .select('branch_code')
      .order('branch_code', { ascending: true });
    if (error) throw error;
    return generateBranchCode((data ?? []) as Array<Pick<Branch, 'branch_code'>>);
  };

  const fetchBranches = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setBranches([
        {
          id: '1',
          branch_code: 'S001',
          branch_name: '焼きそば屋',
          password: '0000',
          sales_target: 50000,
          status: 'active',
          created_at: new Date().toISOString(),
        }
      ]);
      setLoading(false);
      return;
    }

    try {
      let query = supabase
        .from('branches')
        .select('*')
        .order('branch_code', { ascending: true });
      if (ownerId && organizationId) {
        query = query.or(`owner_id.eq.${ownerId},organization_id.eq.${organizationId}`);
      } else if (ownerId) {
        query = query.eq('owner_id', ownerId);
      }
      const { data, error } = await query;

      if (error) throw error;
      if ((data?.length ?? 0) === 0 && ownerId) {
        // 旧データ移行前でも画面上で管理できるようフォールバック
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('branches')
          .select('*')
          .order('branch_code', { ascending: true });
        if (fallbackError) throw fallbackError;
        setBranches(fallbackData || []);
      } else {
        setBranches(data || []);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
      Alert.alert('エラー', '支店情報の取得に失敗しました');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ownerId, organizationId]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const handleAddBranch = async () => {
    if (!newBranchName.trim()) {
      Alert.alert('エラー', '模擬店名を入力してください');
      return;
    }

    if (!newPassword.trim()) {
      Alert.alert('エラー', 'パスワードを入力してください');
      return;
    }

    setSaving(true);

    try {
      const nextBranchCode = isSupabaseConfigured()
        ? await fetchNextBranchCode()
        : generateBranchCode(branches);
      const newBranch: Branch = {
        id: Crypto.randomUUID(),
        branch_code: nextBranchCode,
        branch_name: newBranchName.trim(),
        password: newPassword.trim(),
        sales_target: parseInt(newSalesTarget, 10) || 0,
        status: 'active',
        created_at: new Date().toISOString(),
        owner_id: ownerId,
        organization_id: organizationId,
      };

      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('branches').insert(newBranch);
        if (error) throw error;
      }

      setBranches([...branches, newBranch]);
      setShowAddModal(false);
      resetForm();
      Alert.alert('成功', `支店番号 ${newBranch.branch_code} を発行しました`);
    } catch (error) {
      console.error('Error adding branch:', error);
      const msg = error instanceof Error ? error.message : '支店の追加に失敗しました';
      Alert.alert('エラー', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (branch: Branch) => {
    const newStatus = branch.status === 'active' ? 'inactive' : 'active';

    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('branches')
          .update({ status: newStatus })
          .eq('id', branch.id);
        if (error) throw error;
      }

      setBranches(
        branches.map((b) => (b.id === branch.id ? { ...b, status: newStatus } : b))
      );
    } catch (error) {
      console.error('Error updating branch status:', error);
      Alert.alert('エラー', 'ステータスの更新に失敗しました');
    }
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setNewBranchName(branch.branch_name);
    setNewPassword(branch.password);
    setNewSalesTarget(branch.sales_target.toString());
    setShowEditModal(true);
  };

  const handleEditBranch = async () => {
    if (!editingBranch) return;

    if (!newBranchName.trim()) {
      Alert.alert('エラー', '模擬店名を入力してください');
      return;
    }

    if (!newPassword.trim()) {
      Alert.alert('エラー', 'パスワードを入力してください');
      return;
    }

    setSaving(true);

    try {
      const updatedFields = {
        branch_name: newBranchName.trim(),
        password: newPassword.trim(),
        sales_target: parseInt(newSalesTarget, 10) || 0,
      };

      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('branches')
          .update(updatedFields)
          .eq('id', editingBranch.id);
        if (error) throw error;
      }

      setBranches(
        branches.map((b) =>
          b.id === editingBranch.id ? { ...b, ...updatedFields } : b
        )
      );

      setShowEditModal(false);
      setEditingBranch(null);
      resetForm();
      Alert.alert('成功', '支店情報を更新しました');
    } catch (error) {
      console.error('Error updating branch:', error);
      Alert.alert('エラー', '支店情報の更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // ─── CSV Download ───

  const buildCsv = (): string => {
    const lines: string[] = [CSV_HEADER];
    branches.forEach((b) => {
      lines.push(
        [
          toCsvCell(b.branch_code),
          toCsvCell(b.branch_name),
          toCsvCell(b.password),
          toCsvCell(b.sales_target),
          toCsvCell(b.status),
        ].join(',')
      );
    });
    return `\uFEFF${lines.join('\n')}`;
  };

  const handleExportCsv = async () => {
    if (branches.length === 0) {
      alertNotify('CSV出力', '出力対象の支店がありません');
      return;
    }

    setExporting(true);
    try {
      const csvContent = buildCsv();
      const filename = `branches_${new Date().toISOString().slice(0, 10)}.csv`;

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
        alertNotify('CSV出力', 'CSVをダウンロードしました');
        return;
      }

      const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDir) throw new Error('保存先ディレクトリを取得できませんでした');
      const fileUri = `${baseDir}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: '支店一覧CSVを共有' });
      } else {
        alertNotify('CSV出力', `CSVを保存しました: ${fileUri}`);
      }
    } catch (error: any) {
      console.error('CSV export error:', error);
      alertNotify('エラー', `CSV出力に失敗しました: ${error?.message ?? ''}`);
    } finally {
      setExporting(false);
    }
  };

  // ─── CSV Upload / Import ───

  const parseImportCsv = (csvText: string): ImportPreview => {
    const raw = csvText.replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const errors: string[] = [];
    const newRows: CsvImportRow[] = [];
    const updateRows: (CsvImportRow & { existingId: string })[] = [];

    if (lines.length < 2) {
      errors.push('CSVにデータ行がありません');
      return { newRows, updateRows, errors };
    }

    const headerCells = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
    const colIndex = {
      branch_code: headerCells.indexOf('branch_code'),
      branch_name: headerCells.indexOf('branch_name'),
      password: headerCells.indexOf('password'),
      sales_target: headerCells.indexOf('sales_target'),
      status: headerCells.indexOf('status'),
    };

    if (colIndex.branch_name === -1) {
      errors.push('ヘッダーに branch_name 列が必要です');
      return { newRows, updateRows, errors };
    }
    if (colIndex.password === -1) {
      errors.push('ヘッダーに password 列が必要です');
      return { newRows, updateRows, errors };
    }

    const existingMap = new Map(branches.map((b) => [b.branch_code, b]));
    // 新規コード自動採番用: 既存+CSVで新規追加予定のコードも考慮
    let nextCode = branches.length > 0
      ? Math.max(...branches.map((b) => parseInt(b.branch_code.replace('S', ''), 10) || 0))
      : 0;

    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]);
      const rowNum = i + 1;

      const branchName = colIndex.branch_name >= 0 ? (cells[colIndex.branch_name] ?? '').trim() : '';
      const password = colIndex.password >= 0 ? (cells[colIndex.password] ?? '').trim() : '';
      const salesTarget = colIndex.sales_target >= 0 ? parseInt(cells[colIndex.sales_target] ?? '0', 10) || 0 : 0;
      const statusRaw = colIndex.status >= 0 ? (cells[colIndex.status] ?? 'active').trim().toLowerCase() : 'active';
      const status: 'active' | 'inactive' = statusRaw === 'inactive' ? 'inactive' : 'active';
      const branchCode = colIndex.branch_code >= 0 ? (cells[colIndex.branch_code] ?? '').trim() : '';

      if (!branchName) {
        errors.push(`${rowNum}行目: 模擬店名が空です`);
        continue;
      }
      if (!password) {
        errors.push(`${rowNum}行目: パスワードが空です`);
        continue;
      }
      if (salesTarget < 0) {
        errors.push(`${rowNum}行目: 売上目標が不正です`);
        continue;
      }

      const row: CsvImportRow = { branch_code: branchCode, branch_name: branchName, password, sales_target: salesTarget, status };

      if (branchCode && existingMap.has(branchCode)) {
        updateRows.push({ ...row, existingId: existingMap.get(branchCode)!.id });
      } else {
        if (!branchCode) {
          nextCode++;
          row.branch_code = `S${String(nextCode).padStart(3, '0')}`;
        }
        newRows.push(row);
      }
    }

    return { newRows, updateRows, errors };
  };

  const handlePickCsv = async () => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,text/csv';
        input.onchange = async (e: any) => {
          const file = e.target?.files?.[0];
          if (!file) return;
          const text: string = await file.text();
          const preview = parseImportCsv(text);
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
      const preview = parseImportCsv(text);
      setImportPreview(preview);
      setShowImportModal(true);
    } catch (error: any) {
      console.error('CSV pick error:', error);
      alertNotify('エラー', `CSVファイルの読み込みに失敗しました: ${error?.message ?? ''}`);
    }
  };

  const handleImportConfirm = async () => {
    if (!importPreview) return;

    setImporting(true);
    try {
      const newBranches: Branch[] = [];

      for (const row of importPreview.newRows) {
        const branch: Branch = {
          id: Crypto.randomUUID(),
          branch_code: row.branch_code,
          branch_name: row.branch_name,
          password: row.password,
          sales_target: row.sales_target,
          status: row.status,
          created_at: new Date().toISOString(),
          owner_id: ownerId,
          organization_id: organizationId,
        };

        if (isSupabaseConfigured()) {
          const { error } = await supabase.from('branches').insert(branch);
          if (error) throw error;
        }

        newBranches.push(branch);
      }

      let updatedBranches = [...branches, ...newBranches];

      for (const row of importPreview.updateRows) {
        const fields = {
          branch_name: row.branch_name,
          password: row.password,
          sales_target: row.sales_target,
          status: row.status,
        };

        if (isSupabaseConfigured()) {
          const { error } = await supabase.from('branches').update(fields).eq('id', row.existingId);
          if (error) throw error;
        }

        updatedBranches = updatedBranches.map((b) =>
          b.id === row.existingId ? { ...b, ...fields } : b
        );
      }

      setBranches(updatedBranches);
      setShowImportModal(false);
      setImportPreview(null);
      alertNotify(
        'インポート完了',
        `新規 ${importPreview.newRows.length}件、更新 ${importPreview.updateRows.length}件 を処理しました`
      );
    } catch (error: any) {
      console.error('Import error:', error);
      alertNotify('エラー', `インポートに失敗しました: ${error?.message ?? ''}`);
    } finally {
      setImporting(false);
    }
  };

  // ─── Render helpers ───

  const renderBranchForm = (isEdit: boolean) => (
    <>
      {isEdit && editingBranch ? (
        <Text className="text-gray-500 text-sm mb-4">
          支店番号: {editingBranch.branch_code}
        </Text>
      ) : (
        <Text className="text-gray-500 text-sm mb-4">
          支店番号は自動で発行されます
        </Text>
      )}

      <Input
        label="模擬店名"
        value={newBranchName}
        onChangeText={setNewBranchName}
        placeholder="例: 焼きそば屋"
      />

      <Input
        label="パスワード"
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder="例: 1234"
      />

      <Input
        label="売上目標（円）"
        value={newSalesTarget}
        onChangeText={setNewSalesTarget}
        placeholder="例: 50000"
        keyboardType="numeric"
      />

      <View className="flex-row gap-3 mt-4">
        <View className="flex-1">
          <Button
            title="キャンセル"
            onPress={() => {
              if (isEdit) {
                setShowEditModal(false);
                setEditingBranch(null);
              } else {
                setShowAddModal(false);
              }
              resetForm();
            }}
            variant="secondary"
          />
        </View>
        <View className="flex-1">
          <Button
            title={isEdit ? '更新' : '登録'}
            onPress={isEdit ? handleEditBranch : handleAddBranch}
            loading={saving}
            disabled={!newBranchName.trim()}
          />
        </View>
      </View>
    </>
  );

  const renderBranchItem = ({ item }: { item: Branch }) => (
    <Card className={`mb-2 px-3 py-2 border ${item.status === 'active' ? 'border-blue-200 bg-white' : 'border-gray-200 bg-gray-100 opacity-60'}`}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <View className="flex-row items-center gap-1 mb-1">
            <View className="px-2 py-0.5 rounded bg-blue-100">
              <Text className="text-[10px] font-bold text-blue-700">{item.branch_code}</Text>
            </View>
            <View
              className={`px-2 py-0.5 rounded ${
                item.status === 'active' ? 'bg-green-100' : 'bg-gray-200'
              }`}
            >
              <Text
                className={`text-[10px] font-bold ${
                  item.status === 'active' ? 'text-green-700' : 'text-gray-500'
                }`}
              >
                {item.status === 'active' ? '稼働中' : '停止中'}
              </Text>
            </View>
          </View>
          <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
            {item.branch_name}
          </Text>
          <View className="flex-row items-center gap-3 mt-1">
            <Text className="text-gray-500 text-xs">PW: {item.password}</Text>
            <Text className="text-blue-600 font-bold text-xs">目標 {item.sales_target.toLocaleString()}円</Text>
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
              onPress={() => handleToggleStatus(item)}
              className={`px-2 py-1 rounded ${
                item.status === 'active' ? 'bg-red-50' : 'bg-green-50'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  item.status === 'active' ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {item.status === 'active' ? '停止' : '再開'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Card>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="支店管理"
        subtitle={`登録済み: ${branches.length}店舗`}
        showBack
        onBack={onBack}
        rightElement={
          <View className="flex-row gap-1">
            <Button title="+ 新規登録" onPress={() => setShowAddModal(true)} size="sm" />
            <Button
              title={exporting ? '...' : 'CSV出力'}
              onPress={handleExportCsv}
              size="sm"
              variant="secondary"
              disabled={exporting || branches.length === 0}
              loading={exporting}
            />
            <Button
              title="CSV登録"
              onPress={handlePickCsv}
              size="sm"
              variant="success"
            />
          </View>
        }
      />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-gray-500 mt-2">読み込み中...</Text>
        </View>
        ):(
        <FlatList
          data={branches}
          renderItem={renderBranchItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => {
              setRefreshing(true);
              fetchBranches();
            }} />
          }
          ListEmptyComponent={
            <View className="items-center py-12">
              <Text className="text-gray-500">支店が登録されていません</Text>
            </View>
          }
        />
      )}

      <Modal
        visible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          resetForm();
        }}
        title="新規支店登録"
      >
        {renderBranchForm(false)}
      </Modal>

      <Modal
        visible={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingBranch(null);
          resetForm();
        }}
        title="支店情報編集"
      >
        {renderBranchForm(true)}
      </Modal>

      {/* CSVインポートプレビューモーダル */}
      <Modal
        visible={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportPreview(null);
        }}
        title="CSVインポート確認"
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

            {importPreview.newRows.length > 0 && (
              <View className="mb-4">
                <Text className="text-green-700 font-semibold mb-2">
                  新規登録 ({importPreview.newRows.length}件)
                </Text>
                {importPreview.newRows.map((row, i) => (
                  <View key={`new-${i}`} className="flex-row items-center justify-between bg-green-50 rounded-lg px-3 py-2 mb-1">
                    <View>
                      <Text className="text-gray-900 font-medium">{row.branch_code} {row.branch_name}</Text>
                      <Text className="text-gray-500 text-xs">目標: {row.sales_target.toLocaleString()}円</Text>
                    </View>
                    <View className={`px-2 py-0.5 rounded-full ${row.status === 'active' ? 'bg-green-200' : 'bg-gray-200'}`}>
                      <Text className="text-xs">{row.status === 'active' ? '稼働' : '停止'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {importPreview.updateRows.length > 0 && (
              <View className="mb-4">
                <Text className="text-blue-700 font-semibold mb-2">
                  更新 ({importPreview.updateRows.length}件)
                </Text>
                {importPreview.updateRows.map((row, i) => (
                  <View key={`upd-${i}`} className="flex-row items-center justify-between bg-blue-50 rounded-lg px-3 py-2 mb-1">
                    <View>
                      <Text className="text-gray-900 font-medium">{row.branch_code} {row.branch_name}</Text>
                      <Text className="text-gray-500 text-xs">目標: {row.sales_target.toLocaleString()}円</Text>
                    </View>
                    <View className={`px-2 py-0.5 rounded-full ${row.status === 'active' ? 'bg-green-200' : 'bg-gray-200'}`}>
                      <Text className="text-xs">{row.status === 'active' ? '稼働' : '停止'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {importPreview.newRows.length === 0 && importPreview.updateRows.length === 0 && importPreview.errors.length === 0 && (
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
                  onPress={handleImportConfirm}
                  loading={importing}
                  disabled={importing || (importPreview.newRows.length === 0 && importPreview.updateRows.length === 0)}
                  variant="success"
                />
              </View>
            </View>
          </ScrollView>
        )}
      </Modal>
    </SafeAreaView>
  );
};
