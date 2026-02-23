import { View, Text, TouchableOpacity, ScrollView, Alert, Platform, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { supabase } from '../../lib/supabase';
import { getLoginCodesForUser, createLoginCode, regenerateLoginCode } from '../../lib/loginCode';
import { alertNotify } from '../../lib/alertUtils';
import { clearBranch, getBranch, getMenuCategories, getMenus, saveBranch, saveMenuCategories, saveMenus } from '../../lib/storage';
import { Button, Card, Input, Modal, Header } from '../common';
import type { Branch, LoginCode } from '../../types/database';

// ─── CSV utilities ───

const CSV_HEADER = 'branch_code,branch_name,password,sales_target,status,login_code';

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

const normalizePassword = (raw: string): string => {
  const value = raw.trim();
  if (!value) return '';
  if (/^\d+$/.test(value) && value.length < 4) {
    return value.padStart(4, '0');
  }
  return value;
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

// ─── Component ───

interface MyStoresProps {
  onBack: () => void;
  onEnterStore: (branch: Branch) => void;
}

export const MyStores = ({ onBack, onEnterStore }: MyStoresProps) => {
  const { authState } = useAuth();
  const { isFreePlan, isOrgPlan, maxStores } = useSubscription();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loginCodes, setLoginCodes] = useState<Record<string, LoginCode>>({});
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editingBranchName, setEditingBranchName] = useState('');
  const [editingBranchStatus, setEditingBranchStatus] = useState<'active' | 'inactive'>('active');
  const [savingBranchName, setSavingBranchName] = useState(false);
  const [deletingBranch, setDeletingBranch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [selectDeleteMode, setSelectDeleteMode] = useState(false);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const userId = authState.status === 'authenticated' ? authState.user.id : null;
  const subscriptionId =
    authState.status === 'authenticated' ? authState.subscription.id : null;
  const organizationId =
    authState.status === 'authenticated' ? authState.subscription.organization_id : null;

  const getActiveSubscriptionId = useCallback(async (): Promise<string | null> => {
    if (subscriptionId) return subscriptionId;
    if (!userId) return null;

    const { data } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return data?.id ?? null;
  }, [subscriptionId, userId]);

  // ─── Data loading ───

  const loadData = useCallback(async () => {
    if (isFreePlan) {
      const localBranch = await getBranch();
      setBranches(localBranch ? [localBranch] : []);
      setLoginCodes({});
      setLoading(false);
      return;
    }

    if (!userId) return;
    setLoading(true);
    try {
      let resolvedBranches: Branch[] = [];
      const { data: branchData } = await supabase
        .from('branches')
        .select('*')
        .eq('owner_id', userId)
        .order('branch_code');
      if ((branchData?.length ?? 0) > 0) {
        resolvedBranches = branchData ?? [];
        setBranches(resolvedBranches);
      } else {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('branches')
          .select('*')
          .order('branch_code');
        if (fallbackError) throw fallbackError;
        resolvedBranches = (fallbackData ?? []) as Branch[];
        setBranches(resolvedBranches);
      }

      const codes = await getLoginCodesForUser(userId);
      const codeMap: Record<string, LoginCode> = {};
      for (const code of codes) {
        codeMap[code.branch_id] = code;
      }

      // 有料プランでは全店舗でログインコードを自動生成する（手動「生成」は不要）
      if (resolvedBranches.length > 0) {
        const activeSubId = await getActiveSubscriptionId();
        if (activeSubId) {
          for (const branch of resolvedBranches) {
            if (codeMap[branch.id]) continue;
            const createdCode = await createLoginCode(branch.id, activeSubId, userId);
            if (createdCode) {
              codeMap[branch.id] = createdCode;
            }
          }
        }
      }

      setLoginCodes(codeMap);
    } catch (e) {
      console.error('Failed to load stores:', e);
    } finally {
      setLoading(false);
    }
  }, [getActiveSubscriptionId, isFreePlan, userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData().finally(() => setRefreshing(false));
  }, [loadData]);

  const toggleBranchSelection = (branchId: string) => {
    setSelectedBranchIds((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId]
    );
  };

  const startSelectDeleteMode = () => {
    setShowActionsModal(false);
    setSelectDeleteMode(true);
    setSelectedBranchIds([]);
  };

  const stopSelectDeleteMode = () => {
    setSelectDeleteMode(false);
    setSelectedBranchIds([]);
  };

  // ─── Login code actions ───

  const handleCopyCode = async (code: string) => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(code);
      }
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      alertNotify('エラー', 'コピーに失敗しました');
    }
  };

  const handleRegenerateCode = async (loginCode: LoginCode) => {
    if (!userId) return;

    const confirmed = await new Promise<boolean>((resolve) => {
      if (Platform.OS === 'web') {
        resolve(window.confirm('ログインコードを再生成しますか？\n既存のコードは無効になります。'));
      } else {
        Alert.alert(
          'コード再生成',
          '既存のコードは無効になります。再生成しますか？',
          [
            { text: 'キャンセル', onPress: () => resolve(false) },
            { text: '再生成', onPress: () => resolve(true) },
          ]
        );
      }
    });

    if (!confirmed) return;

    const newCode = await regenerateLoginCode(loginCode.id, userId);
    if (newCode) {
      setLoginCodes((prev) => ({ ...prev, [newCode.branch_id]: newCode }));
    }
  };

  // ─── Branch code helpers ───

  const generateBranchCode = (existingBranches: Array<Pick<Branch, 'branch_code'>>): string => {
    const maxNumber = existingBranches.reduce((max, branch) => {
      const num = parseInt(branch.branch_code.replace('S', ''), 10);
      return Number.isFinite(num) && num > max ? num : max;
    }, 0);
    return `S${String(maxNumber + 1).padStart(3, '0')}`;
  };

  const fetchNextBranchCode = useCallback(async (): Promise<string> => {
    const { data, error } = await supabase
      .from('branches')
      .select('branch_code')
      .order('branch_code', { ascending: true });
    if (error) throw error;
    return generateBranchCode((data ?? []) as Array<Pick<Branch, 'branch_code'>>);
  }, []);

  // ─── Store CRUD ───

  const handleCreateStore = async () => {
    if (!userId) return;
    if (!isFreePlan && Number.isFinite(maxStores) && branches.length >= maxStores) {
      alertNotify(
        '店舗上限',
        `現在のプランでは最大${maxStores}店舗までです。上位プランへ変更すると追加できます。`
      );
      return;
    }

    setLoading(true);
    try {
      const nextNumber = branches.length + 1;
      const branchName = `店舗${nextNumber}`;
      const nextBranchCode = await fetchNextBranchCode();
      const newBranch: Branch = {
        id: Crypto.randomUUID(),
        branch_code: nextBranchCode,
        branch_name: branchName,
        password: '0000',
        sales_target: 0,
        status: 'active',
        created_at: new Date().toISOString(),
        owner_id: userId,
        organization_id: organizationId,
      };

      const { error } = await supabase.from('branches').insert(newBranch);
      if (error) throw error;

      // デフォルトカテゴリ/サンプルメニューを作成
      const defaultCategoryId = Crypto.randomUUID();
      const { error: categoryError } = await supabase.from('menu_categories').insert({
        id: defaultCategoryId,
        branch_id: newBranch.id,
        category_name: 'フード',
        sort_order: 0,
      });
      if (categoryError) throw categoryError;

      const { error: menuError } = await supabase.from('menus').insert({
        id: Crypto.randomUUID(),
        branch_id: newBranch.id,
        menu_name: 'サンプルメニュー',
        price: 500,
        menu_number: 101,
        sort_order: 0,
        category_id: defaultCategoryId,
        stock_management: false,
        stock_quantity: 0,
        is_active: true,
        is_show: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (menuError) throw menuError;

      if (!isFreePlan) {
        const activeSubId = await getActiveSubscriptionId();
        if (activeSubId) {
          const code = await createLoginCode(newBranch.id, activeSubId, userId);
          if (code) {
            setLoginCodes((prev) => ({ ...prev, [newBranch.id]: code }));
          }
        }
      }

      await loadData();
      alertNotify('作成完了', `${branchName} を作成しました`);
    } catch (e) {
      console.error('Failed to create store:', e);
      const msg = e instanceof Error ? e.message : '店舗の作成に失敗しました';
      alertNotify('エラー', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRename = (branch: Branch) => {
    setEditingBranch(branch);
    setEditingBranchName(branch.branch_name);
    setEditingBranchStatus(branch.status ?? 'active');
  };

  const handleCloseRename = () => {
    setEditingBranch(null);
    setEditingBranchName('');
    setEditingBranchStatus('active');
    setSavingBranchName(false);
  };

  const handleRenameStore = async () => {
    if (!editingBranch) return;
    if (!userId && !isFreePlan) {
      alertNotify('エラー', 'ログイン状態を確認できませんでした');
      return;
    }
    const nextName = editingBranchName.trim();
    if (!nextName) {
      alertNotify('入力エラー', '店舗名を入力してください');
      return;
    }
    setSavingBranchName(true);
    try {
      const storedBranch = await getBranch();
      if (isFreePlan) {
        if (!storedBranch) throw new Error('ローカル店舗データが見つかりません');
        const nextBranch = {
          ...storedBranch,
          branch_name: nextName,
          status: editingBranchStatus,
        };
        await saveBranch(nextBranch);
        setBranches([nextBranch]);
      } else {
        const { data, error } = await supabase
          .from('branches')
          .update({
            branch_name: nextName,
            status: editingBranchStatus,
          })
          .eq('id', editingBranch.id)
          .eq('owner_id', userId)
          .select('id, branch_name, status')
          .single();
        if (error) throw error;
        if (!data) throw new Error('更新対象の店舗が見つかりません');

        setBranches((prev) =>
          prev.map((b) =>
            b.id === editingBranch.id
              ? {
                  ...b,
                  branch_name: nextName,
                  status: editingBranchStatus,
                }
              : b,
          ),
        );

        if (
          storedBranch &&
          (storedBranch.id === editingBranch.id || storedBranch.branch_code === editingBranch.branch_code)
        ) {
          await saveBranch({
            ...storedBranch,
            branch_name: nextName,
            status: editingBranchStatus,
          });
        }
      }

      alertNotify('更新完了', '店舗設定を更新しました');
      handleCloseRename();
    } catch (e) {
      console.error('Failed to rename store:', e);
      const message = e instanceof Error ? e.message : '店舗設定の変更に失敗しました';
      alertNotify('エラー', message);
      setSavingBranchName(false);
    }
  };

  const executeDeleteStore = async () => {
    if (!editingBranch) return;
    setDeletingBranch(true);
    try {
      const target = editingBranch;
      const storedBranch = await getBranch();

      if (isFreePlan) {
        const allMenus = await getMenus();
        const allCategories = await getMenuCategories();
        await saveMenus(allMenus.filter((m) => m.branch_id !== target.id));
        await saveMenuCategories(allCategories.filter((c) => c.branch_id !== target.id));
        if (storedBranch?.id === target.id || storedBranch?.branch_code === target.branch_code) {
          await clearBranch();
        }
        setBranches((prev) => prev.filter((b) => b.id !== target.id));
      } else {
        if (!userId) throw new Error('ログイン状態を確認できませんでした');
        const { error } = await supabase
          .from('branches')
          .delete()
          .eq('id', target.id)
          .eq('owner_id', userId);
        if (error) throw error;
        if (storedBranch?.id === target.id || storedBranch?.branch_code === target.branch_code) {
          await clearBranch();
        }
        setBranches((prev) => prev.filter((b) => b.id !== target.id));
      }

      setLoginCodes((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });

      alertNotify('削除完了', `「${target.branch_name}」を削除しました`);
      handleCloseRename();
    } catch (e) {
      console.error('Failed to delete store:', e);
      const message = e instanceof Error ? e.message : '店舗の削除に失敗しました';
      alertNotify('エラー', message);
      setDeletingBranch(false);
    } finally {
      setDeletingBranch(false);
    }
  };

  const handleDeleteStore = async () => {
    if (!editingBranch) return;
    const confirmed = await new Promise<boolean>((resolve) => {
      const msg = `「${editingBranch.branch_name}」を削除します。関連するメニュー・履歴データも削除されます。続行しますか？`;
      if (Platform.OS === 'web') {
        resolve(window.confirm(msg));
      } else {
        Alert.alert(
          '店舗削除',
          msg,
          [
            { text: 'キャンセル', onPress: () => resolve(false), style: 'cancel' },
            { text: '削除', onPress: () => resolve(true), style: 'destructive' },
          ],
        );
      }
    });
    if (!confirmed) return;
    await executeDeleteStore();
  };

  const handleBulkDeleteStores = async () => {
    if (!userId) {
      alertNotify('エラー', 'ログイン状態を確認できませんでした');
      return;
    }
    if (selectedBranchIds.length === 0) {
      alertNotify('未選択', '削除する店舗を選択してください');
      return;
    }

    const targets = branches.filter((b) => selectedBranchIds.includes(b.id));
    if (targets.length === 0) {
      alertNotify('未選択', '削除する店舗を選択してください');
      return;
    }

    const confirmed = await new Promise<boolean>((resolve) => {
      const message = `${targets.length}店舗を削除します。関連するメニュー・履歴データも削除されます。続行しますか？`;
      if (Platform.OS === 'web') {
        resolve(window.confirm(message));
      } else {
        Alert.alert(
          '複数店舗の削除',
          message,
          [
            { text: 'キャンセル', onPress: () => resolve(false), style: 'cancel' },
            { text: '削除', onPress: () => resolve(true), style: 'destructive' },
          ],
        );
      }
    });
    if (!confirmed) return;

    setBulkDeleting(true);
    try {
      const storedBranch = await getBranch();
      const { error } = await supabase
        .from('branches')
        .delete()
        .in('id', selectedBranchIds)
        .eq('owner_id', userId);
      if (error) throw error;

      if (
        storedBranch &&
        targets.some((target) => target.id === storedBranch.id || target.branch_code === storedBranch.branch_code)
      ) {
        await clearBranch();
      }

      setBranches((prev) => prev.filter((b) => !selectedBranchIds.includes(b.id)));
      setLoginCodes((prev) => {
        const next = { ...prev };
        selectedBranchIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      setSelectDeleteMode(false);
      setSelectedBranchIds([]);
      alertNotify('削除完了', `${targets.length}店舗を削除しました`);
    } catch (e) {
      console.error('Failed to bulk delete stores:', e);
      const message = e instanceof Error ? e.message : '複数店舗の削除に失敗しました';
      alertNotify('エラー', message);
    } finally {
      setBulkDeleting(false);
    }
  };

  // ─── CSV Export ───

  const buildCsv = (): string => {
    const lines: string[] = [CSV_HEADER];
    branches.forEach((b) => {
      const loginCode = loginCodes[b.id]?.code ?? '';
      lines.push(
        [
          toCsvCell(b.branch_code),
          toCsvCell(b.branch_name),
          toCsvCell(b.password),
          toCsvCell(b.sales_target),
          toCsvCell(b.status),
          toCsvCell(loginCode),
        ].join(',')
      );
    });
    return `\uFEFF${lines.join('\n')}`;
  };

  const handleExportCsv = async () => {
    if (branches.length === 0) {
      alertNotify('CSV出力', '出力対象の店舗がありません');
      return;
    }

    setExporting(true);
    try {
      const csvContent = buildCsv();
      const filename = `stores_${new Date().toISOString().slice(0, 10)}.csv`;

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
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: '店舗一覧CSVを共有' });
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

  // ─── CSV Import ───

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
    let nextCode = branches.length > 0
      ? Math.max(...branches.map((b) => parseInt(b.branch_code.replace('S', ''), 10) || 0))
      : 0;

    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]);
      const rowNum = i + 1;

      const branchName = colIndex.branch_name >= 0 ? (cells[colIndex.branch_name] ?? '').trim() : '';
      const password = colIndex.password >= 0 ? normalizePassword(cells[colIndex.password] ?? '') : '';
      const salesTarget = colIndex.sales_target >= 0 ? parseInt(cells[colIndex.sales_target] ?? '0', 10) || 0 : 0;
      const statusRaw = colIndex.status >= 0 ? (cells[colIndex.status] ?? 'active').trim().toLowerCase() : 'active';
      const status: 'active' | 'inactive' = statusRaw === 'inactive' ? 'inactive' : 'active';
      const branchCode = colIndex.branch_code >= 0 ? (cells[colIndex.branch_code] ?? '').trim() : '';

      if (!branchName) {
        errors.push(`${rowNum}行目: 店舗名が空です`);
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
    if (!importPreview || !userId) return;

    setImporting(true);
    try {
      for (const row of importPreview.newRows) {
        const branch: Branch = {
          id: Crypto.randomUUID(),
          branch_code: row.branch_code,
          branch_name: row.branch_name,
          password: row.password,
          sales_target: row.sales_target,
          status: row.status,
          created_at: new Date().toISOString(),
          owner_id: userId,
          organization_id: organizationId,
        };

        const { error } = await supabase.from('branches').insert(branch);
        if (error) throw error;

        // 新規店舗にログインコードを自動生成
        const activeSubId = await getActiveSubscriptionId();
        if (activeSubId) {
          const code = await createLoginCode(branch.id, activeSubId, userId);
          if (code) {
            setLoginCodes((prev) => ({ ...prev, [branch.id]: code }));
          }
        }
      }

      for (const row of importPreview.updateRows) {
        const fields = {
          branch_name: row.branch_name,
          password: row.password,
          sales_target: row.sales_target,
          status: row.status,
        };

        const { error } = await supabase.from('branches').update(fields).eq('id', row.existingId);
        if (error) throw error;
      }

      setShowImportModal(false);
      setImportPreview(null);
      await loadData();
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

  const renderStoreItem = ({ item }: { item: Branch }) => {
    const code = loginCodes[item.id];
    const selected = selectedBranchIds.includes(item.id);
    return (
      <Card className={`mb-2 px-3 py-2 border ${item.status === 'active' ? 'border-blue-200 bg-white' : 'border-gray-200 bg-gray-100 opacity-60'}`}>
        <View className="flex-row items-start justify-between">
          {selectDeleteMode && (
            <TouchableOpacity
              onPress={() => toggleBranchSelection(item.id)}
              className={`mt-1 mr-2 w-6 h-6 rounded-md border items-center justify-center ${
                selected ? 'bg-red-500 border-red-500' : 'bg-white border-gray-300'
              }`}
              activeOpacity={0.8}
            >
              <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-gray-300'}`}>✓</Text>
            </TouchableOpacity>
          )}
          {/* Left: store info */}
          <View className="flex-1 pr-2">
            <View className="flex-row items-center gap-1 mb-1">
              <View className="px-2 py-0.5 rounded bg-blue-100">
                <Text className="text-[10px] font-bold text-blue-700">{item.branch_code}</Text>
              </View>
              <View className={`px-2 py-0.5 rounded ${item.status === 'active' ? 'bg-green-100' : 'bg-gray-200'}`}>
                <Text className={`text-[10px] font-bold ${item.status === 'active' ? 'text-green-700' : 'text-gray-500'}`}>
                  {item.status === 'active' ? '稼働中' : '停止中'}
                </Text>
              </View>
            </View>
            <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
              {item.branch_name}
            </Text>
            {/* Login code inline */}
            {!isFreePlan && (
              <View className="flex-row items-center gap-2 mt-1.5">
                <Text className="text-gray-400 text-[10px]">ログインコード:</Text>
                {code ? (
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs font-bold tracking-[3px] text-gray-700">{code.code}</Text>
                    <TouchableOpacity
                      onPress={() => handleCopyCode(code.code)}
                      className="px-1.5 py-0.5 bg-blue-50 rounded"
                    >
                      <Text className="text-blue-600 text-[10px] font-medium">
                        {copiedCode === code.code ? '済' : 'コピー'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleRegenerateCode(code)}
                      className="px-1.5 py-0.5 bg-gray-100 rounded"
                    >
                      <Text className="text-gray-500 text-[10px] font-medium">再生成</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View className="px-2 py-0.5 bg-gray-100 rounded">
                    <Text className="text-gray-500 text-[10px] font-medium">準備中...</Text>
                  </View>
                )}
              </View>
            )}
          </View>
          {/* Right: action buttons */}
          {!selectDeleteMode && (
            <View className="items-end gap-1">
              <TouchableOpacity
                onPress={() => {
                  if (item.status === 'inactive') {
                    alertNotify('停止中の店舗', '停止中の店舗には入れません。店舗設定で「稼働中」に変更してください。');
                    return;
                  }
                  onEnterStore(item);
                }}
                activeOpacity={0.8}
                className={`px-3 py-1.5 rounded ${item.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`}
              >
                <Text className="text-white text-xs font-semibold">店舗に入る</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleOpenRename(item)}
                className="px-2 py-1 bg-blue-50 rounded"
              >
                <Text className="text-blue-600 text-xs font-medium">店舗設定</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Card>
    );
  };

  // ─── Main render ───

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <Header
        title="店舗管理"
        subtitle={`登録済み: ${branches.length}店舗`}
        showBack
        onBack={onBack}
        rightElement={
          <View className="flex-row gap-1">
            {!isFreePlan && (
              <Button title="+ 店舗追加" onPress={handleCreateStore} size="sm" />
            )}
            {isOrgPlan && (
              <TouchableOpacity
                onPress={() => setShowActionsModal(true)}
                className="w-9 h-9 bg-gray-100 rounded-lg items-center justify-center"
                activeOpacity={0.7}
              >
                <Text className="text-gray-700 text-lg font-bold leading-none">☰</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {selectDeleteMode && (
        <View className="mx-4 mt-3 mb-1 p-3 rounded-xl border border-red-200 bg-red-50">
          <View className="flex-row items-center justify-between">
            <Text className="text-red-700 text-sm font-semibold">
              削除対象を選択中: {selectedBranchIds.length}件
            </Text>
            <TouchableOpacity onPress={stopSelectDeleteMode} className="px-2 py-1 bg-white rounded-md border border-red-200">
              <Text className="text-red-600 text-xs font-medium">終了</Text>
            </TouchableOpacity>
          </View>
          <View className="mt-2">
            <Button
              title={bulkDeleting ? '削除中...' : '選択した店舗を削除'}
              onPress={handleBulkDeleteStores}
              variant="danger"
              loading={bulkDeleting}
              disabled={bulkDeleting || selectedBranchIds.length === 0}
            />
          </View>
        </View>
      )}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-gray-500 mt-2">読み込み中...</Text>
        </View>
      ) : (
        <FlatList
          data={branches}
          renderItem={renderStoreItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <Card className="bg-white p-6">
              <Text className="text-gray-500 text-center mb-4">
                まだ店舗がありません
              </Text>
              <Text className="text-gray-400 text-center text-sm">
                {isFreePlan
                  ? '無料プランでは1店舗をローカルで利用できます。\n有料プランにアップグレードすると、DB連携とログインコードが利用可能に。'
                  : '上部の「+ 店舗追加」ボタンから新しい店舗を登録してください。'}
              </Text>
            </Card>
          }
        />
      )}

      {/* Rename modal */}
      <Modal
        visible={!!editingBranch}
        onClose={handleCloseRename}
        title="店舗設定"
      >
        <Input
          label="店舗名"
          value={editingBranchName}
          onChangeText={setEditingBranchName}
          placeholder="店舗名を入力"
        />
        <View className="mt-2">
          <Text className="text-gray-700 font-medium mb-2">稼働状態</Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setEditingBranchStatus('active')}
              className={`flex-1 px-3 py-2 rounded-lg border ${
                editingBranchStatus === 'active' ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
              }`}
              activeOpacity={0.8}
            >
              <Text className={`text-center font-medium ${editingBranchStatus === 'active' ? 'text-white' : 'text-gray-700'}`}>
                稼働中
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setEditingBranchStatus('inactive')}
              className={`flex-1 px-3 py-2 rounded-lg border ${
                editingBranchStatus === 'inactive' ? 'bg-gray-600 border-gray-600' : 'bg-white border-gray-300'
              }`}
              activeOpacity={0.8}
            >
              <Text className={`text-center font-medium ${editingBranchStatus === 'inactive' ? 'text-white' : 'text-gray-700'}`}>
                停止中
              </Text>
            </TouchableOpacity>
          </View>
          {editingBranchStatus === 'inactive' && (
            <View className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
              <Text className="text-yellow-700 text-xs">
                停止中にすると「店舗に入る」「ログインコードログイン」が利用できなくなります。
              </Text>
            </View>
          )}
        </View>
        <View className="flex-row gap-3 mt-3">
          <View className="flex-1">
            <Button title="キャンセル" onPress={handleCloseRename} variant="secondary" />
          </View>
          <View className="flex-1">
            <Button
              title="保存"
              onPress={handleRenameStore}
              loading={savingBranchName}
              disabled={!editingBranchName.trim()}
            />
          </View>
        </View>
        <View className="mt-3">
          <Button
            title={deletingBranch ? '削除中...' : '店舗を削除'}
            onPress={handleDeleteStore}
            variant="danger"
            loading={deletingBranch}
            disabled={deletingBranch}
          />
        </View>
      </Modal>

      {/* Store actions modal (hamburger menu) */}
      <Modal
        visible={showActionsModal}
        onClose={() => setShowActionsModal(false)}
        title="店舗操作"
      >
        <View className="gap-3">
          <TouchableOpacity
            onPress={() => {
              setShowActionsModal(false);
              handlePickCsv();
            }}
            className="flex-row items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3"
            activeOpacity={0.7}
          >
            <Text className="text-lg">📥</Text>
            <View className="flex-1">
              <Text className="text-green-800 font-semibold text-sm">CSV一括登録</Text>
              <Text className="text-green-600 text-xs">CSVファイルから店舗を一括登録・更新</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setShowActionsModal(false);
              handleExportCsv();
            }}
            disabled={exporting || branches.length === 0}
            className={`flex-row items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 ${
              exporting || branches.length === 0 ? 'opacity-50' : ''
            }`}
            activeOpacity={0.7}
          >
            <Text className="text-lg">📤</Text>
            <View className="flex-1">
              <Text className="text-blue-800 font-semibold text-sm">
                {exporting ? 'CSV出力中...' : 'CSV一括ダウンロード'}
              </Text>
              <Text className="text-blue-600 text-xs">全店舗情報をCSVファイルで出力</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={startSelectDeleteMode}
            disabled={branches.length === 0}
            className={`flex-row items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 ${
              branches.length === 0 ? 'opacity-50' : ''
            }`}
            activeOpacity={0.7}
          >
            <Text className="text-lg">🗑️</Text>
            <View className="flex-1">
              <Text className="text-red-800 font-semibold text-sm">複数選択して削除</Text>
              <Text className="text-red-600 text-xs">削除したい店舗だけを選んで一括削除</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* CSV Import Preview modal */}
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
