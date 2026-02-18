import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { Card, Header, Button, Input, Modal } from '../common';
import {
  getStoreSettings, saveStoreSettings, saveAdminPassword, verifyAdminPassword,
  clearAllPendingTransactions, saveBranch, getRestrictions, saveRestrictions,
  saveMenus, saveMenuCategories, clearPendingVisitorCountsByBranch,
  saveBudgetSettings, saveBudgetExpenses, savePrepIngredients,
  getMenus, getMenuCategories, getPendingTransactions, savePendingTransaction,
  getPendingVisitorCounts, savePendingVisitorCount, getVisitorGroups, saveVisitorGroups,
  getBudgetSettings, getBudgetExpenses, getPrepIngredients,
} from '../../lib/storage';
import { alertNotify } from '../../lib/alertUtils';
import type {
  Branch,
  BudgetExpense,
  BudgetSettings,
  Menu,
  MenuCategory,
  PaymentMethodSettings,
  PendingTransaction,
  PendingVisitorCount,
  PrepIngredient,
  RestrictionSettings,
  Transaction,
  TransactionItem,
  VisitorCounterGroup,
} from '../../types/database';
import { isSupabaseConfigured, supabase } from 'lib/supabase';
import { base64ToBytes, bytesToBase64, bytesToText, createZip, extractStoredZipEntries, textToBytes } from '../../lib/zipUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';

/** 削除カテゴリのキー */
type DeleteCategory = 'sales' | 'menu' | 'visitor' | 'budget' | 'prep';

type ExportableCategory = DeleteCategory;

type StoreBackupPayload = {
  version: 1;
  exported_at: string;
  branch: { id: string; branch_code: string; branch_name: string };
  data: Partial<Record<ExportableCategory, unknown>>;
};

type TabKey = 'main' | 'sub' | 'budget' | 'settings';
type SettingsView = 'top' | 'payment' | 'admin';

interface StoreHomeProps {
  branch: Branch;
  onNavigateToRegister: () => void;
  onNavigateToMenus: () => void;
  onNavigateToHistory: () => void;
  onNavigateToCounter: () => void;
  onNavigateToOrderBoard: () => void;
  onNavigateToPrep: () => void;
  onNavigateToBudget: () => void;
  onNavigateToBudgetExpense: () => void;
  onNavigateToBudgetBreakeven: () => void;
  /** タブレットモードで客向けオーダー画面を開く */
  onNavigateToCustomerOrder: () => void;
  onBranchUpdated?: (branch: Branch) => void;
  onLogout: () => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'main', label: 'メイン画面' },
  { key: 'sub', label: 'サブ画面' },
  { key: 'budget', label: '予算管理' },
  { key: 'settings', label: '設定' },
];

const DATA_CATEGORY_DEFS: { key: ExportableCategory; label: string; desc: string }[] = [
  { key: 'sales', label: '売上データ', desc: '取引履歴・会計データ' },
  { key: 'menu', label: 'メニューデータ', desc: 'メニュー・カテゴリ一覧' },
  { key: 'visitor', label: '来客データ', desc: '来客カウンター記録' },
  { key: 'budget', label: '会計データ', desc: '予算設定・支出記録' },
  { key: 'prep', label: '下準備データ', desc: '材料・在庫管理記録' },
];

const DATA_CATEGORY_LABELS: Record<ExportableCategory, string> = {
  sales: '売上データ',
  menu: 'メニューデータ',
  visitor: '来客データ',
  budget: '会計データ',
  prep: '下準備データ',
};

const toCsvCell = (value: unknown): string => {
  const normalized =
    value == null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  const text = String(normalized);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const csvFromObjects = (rows: Record<string, unknown>[]): string => {
  if (rows.length === 0) return '\uFEFF';
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
  const lines: string[] = [headers.map(toCsvCell).join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => toCsvCell(row[header])).join(','));
  });
  return `\uFEFF${lines.join('\n')}`;
};

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
};

const csvToObjects = (content: string): Record<string, string>[] => {
  const raw = content.replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
};

const toNumberOr = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) ? n : fallback;
};

const toBoolean = (value: unknown): boolean => String(value ?? '').trim().toLowerCase() === 'true';

const parseJsonCell = <T,>(value: unknown, fallback: T): T => {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

export const StoreHome = ({
  branch,
  onNavigateToRegister,
  onNavigateToMenus,
  onNavigateToHistory,
  onNavigateToCounter,
  onNavigateToOrderBoard,
  onNavigateToPrep,
  onNavigateToBudget,
  onNavigateToBudgetExpense,
  onNavigateToBudgetBreakeven,
  onNavigateToCustomerOrder,
  onBranchUpdated,
  onLogout,
}: StoreHomeProps) => {
  const { authState, exitLoginCode } = useAuth();
  const { isOrgPlan } = useSubscription();
  const [activeTab, setActiveTab] = useState<TabKey>('main');
  const [settingsView, setSettingsView] = useState<SettingsView>('top');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSettings>({
    cash: false,
    cashless: true,
    voucher: true,
  });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [showDataDeleteModal, setShowDataDeleteModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);
  /** 削除対象として選択されているカテゴリ */
  const [selectedDeleteCategories, setSelectedDeleteCategories] = useState<Set<DeleteCategory>>(new Set());
  const [showPreDeleteExportModal, setShowPreDeleteExportModal] = useState(false);
  const [pendingDeleteCategories, setPendingDeleteCategories] = useState<Set<DeleteCategory>>(new Set());

  const [showDataExportModal, setShowDataExportModal] = useState(false);
  const [selectedExportCategories, setSelectedExportCategories] = useState<Set<ExportableCategory>>(new Set());
  const [exportingData, setExportingData] = useState(false);

  const [showDataImportModal, setShowDataImportModal] = useState(false);
  const [importPayload, setImportPayload] = useState<StoreBackupPayload | null>(null);
  const [selectedImportCategories, setSelectedImportCategories] = useState<Set<ExportableCategory>>(new Set());
  const [importingData, setImportingData] = useState(false);
  const [importSourceName, setImportSourceName] = useState('');
  const [importError, setImportError] = useState('');

  // Restriction management state
  const [restrictions, setRestrictions] = useState<RestrictionSettings>({
    menu_add: false, menu_edit: false, menu_delete: true,
    sales_cancel: false, sales_history: false, sales_reset: true,
    payment_change: false, settings_access: false,
  });
  const [showRestrictionsModal, setShowRestrictionsModal] = useState(false);

  // Admin guard modal state (generic password prompt for restricted operations)
  const [showAdminGuardModal, setShowAdminGuardModal] = useState(false);
  const [adminGuardInput, setAdminGuardInput] = useState('');
  const [adminGuardError, setAdminGuardError] = useState('');
  const [adminGuardCallback, setAdminGuardCallback] = useState<(() => void) | null>(null);
  const [switchableBranches, setSwitchableBranches] = useState<Branch[]>([]);
  const [branchLoginCode, setBranchLoginCode] = useState<string | null>(null);
  const [showLoginCodeModal, setShowLoginCodeModal] = useState(false);
  const [copiedLoginCode, setCopiedLoginCode] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getStoreSettings();
      // ログインコード利用時は常に店舗ホーム（メイン画面）から開始
      if (authState.status === 'login_code') {
        setActiveTab('main');
      } else if (settings.sub_screen_mode) {
        setActiveTab('sub');
      }
      if (settings.payment_methods) {
        setPaymentMethods(settings.payment_methods);
      }
      const r = await getRestrictions();
      setRestrictions(r);
    };
    loadSettings();
  }, [authState.status]);

  useEffect(() => {
    if (authState.status === 'login_code') {
      setActiveTab('main');
      setSettingsView('top');
    }
  }, [authState.status]);

  useEffect(() => {
    const refreshBranchName = async () => {
      if (!isSupabaseConfigured()) return;
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('id', branch.id)
        .maybeSingle();
      if (error || !data) return;
      if (
        data.branch_name !== branch.branch_name ||
        data.password !== branch.password ||
        data.status !== branch.status
      ) {
        await saveBranch(data);
        onBranchUpdated?.(data);
      }
    };
    refreshBranchName();
  }, [branch.id, branch.branch_name, branch.password, branch.status, onBranchUpdated]);

  useEffect(() => {
    const loadSwitchableBranches = async () => {
      if (!isSupabaseConfigured() || !isOrgPlan || authState.status !== 'authenticated') {
        setSwitchableBranches([]);
        return;
      }

      const ownerId = authState.user.id;
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('owner_id', ownerId)
        .order('branch_code', { ascending: true });

      if (error) {
        console.error('Failed to load switchable branches:', error);
        setSwitchableBranches([]);
        return;
      }
      setSwitchableBranches(data ?? []);
    };

    loadSwitchableBranches();
  }, [authState, isOrgPlan]);

  useEffect(() => {
    const loadBranchLoginCode = async () => {
      if (authState.status === 'login_code' && authState.branch.id === branch.id) {
        setBranchLoginCode(authState.loginCode);
        return;
      }
      if (!isSupabaseConfigured()) {
        setBranchLoginCode(null);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('login_codes')
          .select('code')
          .eq('branch_id', branch.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) {
          console.error('Failed to load branch login code:', error);
          setBranchLoginCode(null);
          return;
        }
        setBranchLoginCode(data?.[0]?.code ?? null);
      } catch (error) {
        console.error('Failed to load branch login code:', error);
        setBranchLoginCode(null);
      }
    };
    loadBranchLoginCode();
  }, [authState, branch.id]);

  // --- Admin guard helpers ---
  const openAdminGuard = (onSuccess: () => void) => {
    setAdminGuardInput('');
    setAdminGuardError('');
    setAdminGuardCallback(() => onSuccess);
    setShowAdminGuardModal(true);
  };

  const closeAdminGuard = () => {
    setShowAdminGuardModal(false);
    setAdminGuardInput('');
    setAdminGuardError('');
    setAdminGuardCallback(null);
  };

  const handleAdminGuardSubmit = async () => {
    if (!adminGuardInput.trim()) {
      setAdminGuardError('管理者パスワードを入力してください');
      return;
    }
    const isValid = await verifyAdminPassword(adminGuardInput);
    if (!isValid) {
      setAdminGuardError('パスワードが正しくありません');
      return;
    }
    const cb = adminGuardCallback;
    closeAdminGuard();
    cb?.();
  };

  /** Check restriction and either run action immediately or show password modal */
  const withRestrictionCheck = (key: keyof RestrictionSettings, action: () => void) => {
    if (restrictions[key]) {
      openAdminGuard(action);
    } else {
      action();
    }
  };

  // --- Restriction setting toggle ---
  const toggleRestriction = async (key: keyof RestrictionSettings) => {
    const updated = { ...restrictions, [key]: !restrictions[key] };
    setRestrictions(updated);
    await saveRestrictions(updated);
  };

  const handleTabChange = async (tab: TabKey) => {
    if (tab === 'settings' && restrictions.settings_access && activeTab !== 'settings') {
      openAdminGuard(async () => {
        setActiveTab('settings');
        setSettingsView('top');
        const currentSettings = await getStoreSettings();
        await saveStoreSettings({ ...currentSettings, sub_screen_mode: false });
      });
      return;
    }
    setActiveTab(tab);
    if (tab === 'settings') setSettingsView('top');
    const currentSettings = await getStoreSettings();
    await saveStoreSettings({ ...currentSettings, sub_screen_mode: tab === 'sub' });
  };

  const togglePaymentMethod = async (key: keyof PaymentMethodSettings) => {
    const doToggle = async () => {
      const updated = { ...paymentMethods, [key]: !paymentMethods[key] };
      // Ensure at least one payment method is enabled
      if (!updated.cash && !updated.cashless && !updated.voucher) return;
      setPaymentMethods(updated);
      const currentSettings = await getStoreSettings();
      await saveStoreSettings({ ...currentSettings, payment_methods: updated });
    };
    if (restrictions.payment_change) {
      openAdminGuard(doToggle);
    } else {
      await doToggle();
    }
  };

  const resetPasswordForm = () => {
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      setPasswordError('新しいパスワードを入力してください');
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError('パスワードは4文字以上で設定してください');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('新しいパスワードが一致しません');
      return;
    }

    setSavingPassword(true);
    try {
      const nextPassword = newPassword.trim();

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from('branches')
          .update({ password: nextPassword })
          .eq('id', branch.id)
          .select('*')
          .single();
        if (error) throw error;
        if (!data) throw new Error('店舗データの更新に失敗しました');

        await saveBranch(data);
        onBranchUpdated?.(data);
      } else {
        const updatedBranch: Branch = { ...branch, password: nextPassword };
        await saveBranch(updatedBranch);
        onBranchUpdated?.(updatedBranch);
      }

      await saveAdminPassword(newPassword);
      setShowPasswordModal(false);
      resetPasswordForm();
      alertNotify('完了', '管理者パスワードを変更しました');
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordError('パスワードの変更に失敗しました');
    } finally {
      setSavingPassword(false);
    }
  };

  const executeDataDeletion = async (categories: Set<DeleteCategory>) => {
    setResetting(true);
    const errors: string[] = [];
    try {
      // ── 売上データ ──────────────────────────────────────────────
      if (categories.has('sales')) {
        try {
          if (isSupabaseConfigured()) {
            const { data: txIds } = await supabase
              .from('transactions')
              .select('id')
              .eq('branch_id', branch.id);
            if (txIds && txIds.length > 0) {
              const { error: itemsErr } = await supabase
                .from('transaction_items')
                .delete()
                .in('transaction_id', txIds.map((t) => t.id));
              if (itemsErr) console.error('Error deleting transaction items:', itemsErr);
            }
            const { error: transErr } = await supabase
              .from('transactions')
              .delete()
              .eq('branch_id', branch.id);
            if (transErr) console.error('Error deleting transactions:', transErr);
          }
          await clearAllPendingTransactions(branch.id);
        } catch (e) {
          console.error('sales delete error:', e);
          errors.push('売上データ');
        }
      }

      // ── メニューデータ ────────────────────────────────────────────
      if (categories.has('menu')) {
        try {
          if (isSupabaseConfigured()) {
            const { error: menusErr } = await supabase
              .from('menus')
              .delete()
              .eq('branch_id', branch.id);
            if (menusErr) console.error('Error deleting menus:', menusErr);

            const { error: catsErr } = await supabase
              .from('menu_categories')
              .delete()
              .eq('branch_id', branch.id);
            if (catsErr) console.error('Error deleting menu_categories:', catsErr);
          }
          await saveMenus([]);
          await saveMenuCategories([]);
        } catch (e) {
          console.error('menu delete error:', e);
          errors.push('メニューデータ');
        }
      }

      // ── 来客データ ────────────────────────────────────────────────
      if (categories.has('visitor')) {
        try {
          if (isSupabaseConfigured()) {
            const { error: visitorErr } = await supabase
              .from('visitor_counts')
              .delete()
              .eq('branch_id', branch.id);
            if (visitorErr) console.error('Error deleting visitor_counts:', visitorErr);
          }
          await clearPendingVisitorCountsByBranch(branch.id);
        } catch (e) {
          console.error('visitor delete error:', e);
          errors.push('来客データ');
        }
      }

      // ── 会計データ ────────────────────────────────────────────────
      if (categories.has('budget')) {
        try {
          if (isSupabaseConfigured()) {
            const { error: expErr } = await supabase
              .from('budget_expenses')
              .delete()
              .eq('branch_id', branch.id);
            if (expErr) console.error('Error deleting budget_expenses:', expErr);

            const { error: settErr } = await supabase
              .from('budget_settings')
              .delete()
              .eq('branch_id', branch.id);
            if (settErr) console.error('Error deleting budget_settings:', settErr);
          }
          await saveBudgetSettings({ branch_id: branch.id, initial_budget: 0, target_sales: 0 });
          await saveBudgetExpenses([]);
        } catch (e) {
          console.error('budget delete error:', e);
          errors.push('会計データ');
        }
      }

      // ── 下準備データ ──────────────────────────────────────────────
      if (categories.has('prep')) {
        try {
          if (isSupabaseConfigured()) {
            const { error: prepErr } = await supabase
              .from('prep_ingredients')
              .delete()
              .eq('branch_id', branch.id);
            if (prepErr) console.error('Error deleting prep_ingredients:', prepErr);
          }
          await savePrepIngredients(branch.id, []);
        } catch (e) {
          console.error('prep delete error:', e);
          errors.push('下準備データ');
        }
      }

      setShowDataDeleteModal(false);
      setAdminPasswordInput('');
      setResetError('');
      setSelectedDeleteCategories(new Set());

      if (errors.length > 0) {
        alertNotify('一部エラー', `以下のデータ削除に失敗しました:\n${errors.join('、')}`);
      } else {
        const labels = Array.from(categories).map((c) => DATA_CATEGORY_LABELS[c]);
        alertNotify('完了', `${labels.join('、')} を削除しました`);
      }
    } catch (error) {
      console.error('Error deleting data:', error);
      setResetError('データの削除に失敗しました');
    } finally {
      setResetting(false);
    }
  };

  const handleDataDelete = async () => {
    if (selectedDeleteCategories.size === 0) {
      setResetError('削除するデータを選択してください');
      return;
    }
    if (!adminPasswordInput.trim()) {
      setResetError('管理者パスワードを入力してください');
      return;
    }

    const isValid = await verifyAdminPassword(adminPasswordInput);
    if (!isValid) {
      setResetError('パスワードが正しくありません');
      return;
    }

    const snapshot = new Set(selectedDeleteCategories);
    setPendingDeleteCategories(snapshot);
    setShowPreDeleteExportModal(true);
  };

  const toggleDeleteCategory = (cat: DeleteCategory) => {
    setSelectedDeleteCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const toggleExportCategory = (cat: ExportableCategory) => {
    setSelectedExportCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleImportCategory = (cat: ExportableCategory) => {
    setSelectedImportCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const buildBackupPayload = async (categories: Set<ExportableCategory>): Promise<StoreBackupPayload> => {
    const data: Partial<Record<ExportableCategory, unknown>> = {};

    if (categories.has('sales')) {
      const pendingTransactions = (await getPendingTransactions()).filter((tx) => tx.branch_id === branch.id);
      let transactions: Transaction[] = [];
      let transactionItems: TransactionItem[] = [];
      if (isSupabaseConfigured()) {
        try {
          const { data: txData } = await supabase
            .from('transactions')
            .select('*')
            .eq('branch_id', branch.id);
          transactions = (txData ?? []) as Transaction[];
          if (transactions.length > 0) {
            const txIds = transactions.map((tx) => tx.id);
            const { data: itemData } = await supabase
              .from('transaction_items')
              .select('*')
              .in('transaction_id', txIds);
            transactionItems = (itemData ?? []) as TransactionItem[];
          }
        } catch (error) {
          console.error('sales export fetch error:', error);
        }
      }
      data.sales = {
        transactions,
        transaction_items: transactionItems,
        pending_transactions: pendingTransactions,
      };
    }

    if (categories.has('menu')) {
      const localMenus = (await getMenus()).filter((menu) => menu.branch_id === branch.id);
      const localCategories = (await getMenuCategories()).filter((category) => category.branch_id === branch.id);
      let menus = localMenus;
      let menuCategories = localCategories;
      if (isSupabaseConfigured()) {
        try {
          const [{ data: menuData }, { data: categoryData }] = await Promise.all([
            supabase.from('menus').select('*').eq('branch_id', branch.id),
            supabase.from('menu_categories').select('*').eq('branch_id', branch.id),
          ]);
          menus = (menuData ?? []) as Menu[];
          menuCategories = (categoryData ?? []) as MenuCategory[];
        } catch (error) {
          console.error('menu export fetch error:', error);
        }
      }
      data.menu = {
        menus,
        menu_categories: menuCategories,
      };
    }

    if (categories.has('visitor')) {
      const pendingVisitorCounts = (await getPendingVisitorCounts()).filter((row) => row.branch_id === branch.id);
      const visitorGroups = await getVisitorGroups(branch.id);
      let visitorCounts: PendingVisitorCount[] = [];
      if (isSupabaseConfigured()) {
        try {
          const { data: remoteVisitor } = await supabase
            .from('visitor_counts')
            .select('*')
            .eq('branch_id', branch.id);
          visitorCounts = (remoteVisitor ?? []) as PendingVisitorCount[];
        } catch (error) {
          console.error('visitor export fetch error:', error);
        }
      }
      data.visitor = {
        visitor_counts: visitorCounts,
        pending_visitor_counts: pendingVisitorCounts,
        visitor_groups: visitorGroups,
      };
    }

    if (categories.has('budget')) {
      const budgetSettings = await getBudgetSettings(branch.id);
      const budgetExpenses = (await getBudgetExpenses()).filter((expense) => expense.branch_id === branch.id);
      let remoteSettings: BudgetSettings | null = null;
      let remoteExpenses: BudgetExpense[] = [];
      if (isSupabaseConfigured()) {
        try {
          const [{ data: settingsData }, { data: expenseData }] = await Promise.all([
            supabase.from('budget_settings').select('*').eq('branch_id', branch.id).maybeSingle(),
            supabase.from('budget_expenses').select('*').eq('branch_id', branch.id),
          ]);
          remoteSettings = (settingsData ?? null) as BudgetSettings | null;
          remoteExpenses = (expenseData ?? []) as BudgetExpense[];
        } catch (error) {
          console.error('budget export fetch error:', error);
        }
      }
      data.budget = {
        budget_settings: remoteSettings ?? budgetSettings,
        budget_expenses: remoteExpenses.length > 0 ? remoteExpenses : budgetExpenses,
      };
    }

    if (categories.has('prep')) {
      const localPrepIngredients = await getPrepIngredients(branch.id);
      let prepIngredients = localPrepIngredients;
      if (isSupabaseConfigured()) {
        try {
          const { data: prepData } = await supabase
            .from('prep_ingredients')
            .select('*')
            .eq('branch_id', branch.id);
          prepIngredients = (prepData ?? []) as PrepIngredient[];
        } catch (error) {
          console.error('prep export fetch error:', error);
        }
      }
      data.prep = {
        prep_ingredients: prepIngredients,
      };
    }

    return {
      version: 1,
      exported_at: new Date().toISOString(),
      branch: {
        id: branch.id,
        branch_code: branch.branch_code,
        branch_name: branch.branch_name,
      },
      data,
    };
  };

  const saveTextAsFile = async (filename: string, content: string, mimeType: string, successMessage: string) => {
    if (typeof window !== 'undefined' && FileSystem?.documentDirectory == null) {
      const blob = new Blob([content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      alertNotify('エクスポート', successMessage);
      return;
    }

    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!baseDir) throw new Error('保存先ディレクトリを取得できませんでした');
    const fileUri = `${baseDir}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, content, { encoding: 'utf8' });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: 'データを共有' });
    } else {
      alertNotify('エクスポート', `データを保存しました: ${fileUri}`);
    }
  };

  const saveZipAsFile = async (filename: string, zipBytes: Uint8Array, successMessage: string) => {
    if (typeof window !== 'undefined' && FileSystem?.documentDirectory == null) {
      const arrayBuffer = zipBytes.buffer.slice(
        zipBytes.byteOffset,
        zipBytes.byteOffset + zipBytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      alertNotify('エクスポート', successMessage);
      return;
    }

    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!baseDir) throw new Error('保存先ディレクトリを取得できませんでした');
    const fileUri = `${baseDir}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, bytesToBase64(zipBytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, { mimeType: 'application/zip', dialogTitle: 'データZIPを共有' });
    } else {
      alertNotify('エクスポート', `ZIPを保存しました: ${fileUri}`);
    }
  };

  const exportData = async (
    categories: Set<ExportableCategory>,
    options?: { silentSuccess?: boolean },
  ): Promise<boolean> => {
    if (categories.size === 0) return false;
    setExportingData(true);
    try {
      const payload = await buildBackupPayload(categories);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const list = Array.from(categories);
      const csvFiles: { name: string; content: string }[] = [];

      list.forEach((key) => {
        const data = payload.data[key] as Record<string, unknown> | undefined;
        if (!data) return;

        if (key === 'sales') {
          const transactions = (data.transactions as Record<string, unknown>[] | undefined) ?? [];
          const items = (data.transaction_items as Record<string, unknown>[] | undefined) ?? [];
          const pending = (data.pending_transactions as Record<string, unknown>[] | undefined) ?? [];
          csvFiles.push({ name: 'sales_transactions.csv', content: csvFromObjects(transactions) });
          csvFiles.push({ name: 'sales_transaction_items.csv', content: csvFromObjects(items) });
          csvFiles.push({ name: 'sales_pending_transactions.csv', content: csvFromObjects(pending) });
        }

        if (key === 'menu') {
          const menus = (data.menus as Record<string, unknown>[] | undefined) ?? [];
          const categoriesData = (data.menu_categories as Record<string, unknown>[] | undefined) ?? [];
          csvFiles.push({ name: 'menu_menus.csv', content: csvFromObjects(menus) });
          csvFiles.push({ name: 'menu_categories.csv', content: csvFromObjects(categoriesData) });
        }

        if (key === 'visitor') {
          const counts = (data.visitor_counts as Record<string, unknown>[] | undefined) ?? [];
          const pending = (data.pending_visitor_counts as Record<string, unknown>[] | undefined) ?? [];
          const groups = (data.visitor_groups as Record<string, unknown>[] | undefined) ?? [];
          csvFiles.push({ name: 'visitor_counts.csv', content: csvFromObjects(counts) });
          csvFiles.push({ name: 'visitor_pending_counts.csv', content: csvFromObjects(pending) });
          csvFiles.push({ name: 'visitor_groups.csv', content: csvFromObjects(groups) });
        }

        if (key === 'budget') {
          const settings = (data.budget_settings as Record<string, unknown> | undefined) ?? {};
          const expenses = (data.budget_expenses as Record<string, unknown>[] | undefined) ?? [];
          csvFiles.push({ name: 'budget_settings.csv', content: csvFromObjects([settings]) });
          csvFiles.push({ name: 'budget_expenses.csv', content: csvFromObjects(expenses) });
        }

        if (key === 'prep') {
          const prep = (data.prep_ingredients as Record<string, unknown>[] | undefined) ?? [];
          csvFiles.push({ name: 'prep_ingredients.csv', content: csvFromObjects(prep) });
        }
      });

      const nonEmptyCsvFiles = csvFiles.filter((file) => file.content.trim().length > 0);

      if (nonEmptyCsvFiles.length === 0) {
        alertNotify('エクスポート', '出力対象データがありません');
        return false;
      }

      if (nonEmptyCsvFiles.length === 1) {
        const only = nonEmptyCsvFiles[0];
        const filename = `store_backup_${branch.branch_code}_${timestamp}_${only.name}`;
        await saveTextAsFile(filename, only.content, 'text/csv;charset=utf-8;', `${only.name} を出力しました`);
      } else {
        const zipEntries = nonEmptyCsvFiles.map((file) => ({
          name: file.name,
          data: textToBytes(file.content),
        }));
        const zipBytes = createZip(zipEntries);
        const filename = `store_backup_${branch.branch_code}_${timestamp}.zip`;
        await saveZipAsFile(filename, zipBytes, `${nonEmptyCsvFiles.length}件のCSVをZIPで出力しました`);
      }

      if (!options?.silentSuccess) {
        alertNotify('完了', 'データのエクスポートが完了しました');
      }
      return true;
    } catch (error: any) {
      console.error('Data export error:', error);
      alertNotify('エラー', `データのエクスポートに失敗しました: ${error?.message ?? ''}`);
      return false;
    } finally {
      setExportingData(false);
    }
  };

  const payloadFromCsvFiles = (
    files: Array<{ name: string; content: string }>,
  ): StoreBackupPayload | null => {
    const data: Partial<Record<ExportableCategory, unknown>> = {};

    files.forEach((file) => {
      const name = file.name.toLowerCase();
      const rows = csvToObjects(file.content);

      if (name.endsWith('sales_transactions.csv')) {
        const sales = (data.sales as { transactions?: Transaction[]; transaction_items?: TransactionItem[]; pending_transactions?: PendingTransaction[] } | undefined) ?? {};
        sales.transactions = rows.map((row) => ({
          ...(row as unknown as Transaction),
          total_amount: toNumberOr(row.total_amount),
        }));
        data.sales = sales;
      }

      if (name.endsWith('sales_transaction_items.csv')) {
        const sales = (data.sales as { transactions?: Transaction[]; transaction_items?: TransactionItem[]; pending_transactions?: PendingTransaction[] } | undefined) ?? {};
        sales.transaction_items = rows.map((row) => ({
          ...(row as unknown as TransactionItem),
          quantity: toNumberOr(row.quantity),
          unit_price: toNumberOr(row.unit_price),
          subtotal: toNumberOr(row.subtotal),
        }));
        data.sales = sales;
      }

      if (name.endsWith('sales_pending_transactions.csv')) {
        const sales = (data.sales as { transactions?: Transaction[]; transaction_items?: TransactionItem[]; pending_transactions?: PendingTransaction[] } | undefined) ?? {};
        sales.pending_transactions = rows.map((row) => ({
          ...(row as unknown as PendingTransaction),
          total_amount: toNumberOr(row.total_amount),
          synced: toBoolean(row.synced),
          items: parseJsonCell(row.items, [] as PendingTransaction['items']),
        }));
        data.sales = sales;
      }

      if (name.endsWith('menu_menus.csv')) {
        const menu = (data.menu as { menus?: Menu[]; menu_categories?: MenuCategory[] } | undefined) ?? {};
        menu.menus = rows.map((row) => ({
          ...(row as unknown as Menu),
          price: toNumberOr(row.price),
          menu_number: toNumberOr(row.menu_number),
          sort_order: toNumberOr(row.sort_order),
          stock_quantity: toNumberOr(row.stock_quantity),
          stock_management: toBoolean(row.stock_management),
          is_active: row.is_active === '' ? true : toBoolean(row.is_active),
          is_show: row.is_show === '' ? true : toBoolean(row.is_show),
          category_id: row.category_id || null,
        }));
        data.menu = menu;
      }

      if (name.endsWith('menu_categories.csv')) {
        const menu = (data.menu as { menus?: Menu[]; menu_categories?: MenuCategory[] } | undefined) ?? {};
        menu.menu_categories = rows.map((row) => ({
          ...(row as unknown as MenuCategory),
          sort_order: toNumberOr(row.sort_order),
        }));
        data.menu = menu;
      }

      if (name.endsWith('visitor_counts.csv')) {
        const visitor = (data.visitor as { visitor_counts?: PendingVisitorCount[]; pending_visitor_counts?: PendingVisitorCount[]; visitor_groups?: VisitorCounterGroup[] } | undefined) ?? {};
        visitor.visitor_counts = rows.map((row) => ({
          ...(row as unknown as PendingVisitorCount),
          count: toNumberOr(row.count),
          synced: row.synced === '' ? true : toBoolean(row.synced),
        }));
        data.visitor = visitor;
      }

      if (name.endsWith('visitor_pending_counts.csv')) {
        const visitor = (data.visitor as { visitor_counts?: PendingVisitorCount[]; pending_visitor_counts?: PendingVisitorCount[]; visitor_groups?: VisitorCounterGroup[] } | undefined) ?? {};
        visitor.pending_visitor_counts = rows.map((row) => ({
          ...(row as unknown as PendingVisitorCount),
          count: toNumberOr(row.count),
          synced: toBoolean(row.synced),
        }));
        data.visitor = visitor;
      }

      if (name.endsWith('visitor_groups.csv')) {
        const visitor = (data.visitor as { visitor_counts?: PendingVisitorCount[]; pending_visitor_counts?: PendingVisitorCount[]; visitor_groups?: VisitorCounterGroup[] } | undefined) ?? {};
        visitor.visitor_groups = rows as unknown as VisitorCounterGroup[];
        data.visitor = visitor;
      }

      if (name.endsWith('budget_settings.csv')) {
        const budget = (data.budget as { budget_settings?: BudgetSettings; budget_expenses?: BudgetExpense[] } | undefined) ?? {};
        const row = rows[0] ?? {};
        budget.budget_settings = {
          ...(row as unknown as BudgetSettings),
          branch_id: row.branch_id ?? branch.id,
          initial_budget: toNumberOr(row.initial_budget),
          target_sales: toNumberOr(row.target_sales),
        };
        data.budget = budget;
      }

      if (name.endsWith('budget_expenses.csv')) {
        const budget = (data.budget as { budget_settings?: BudgetSettings; budget_expenses?: BudgetExpense[] } | undefined) ?? {};
        budget.budget_expenses = rows.map((row) => ({
          ...(row as unknown as BudgetExpense),
          amount: toNumberOr(row.amount),
          receipt_image: row.receipt_image || null,
          synced: row.synced === '' ? true : toBoolean(row.synced),
        }));
        data.budget = budget;
      }

      if (name.endsWith('prep_ingredients.csv')) {
        const prep = (data.prep as { prep_ingredients?: PrepIngredient[] } | undefined) ?? {};
        prep.prep_ingredients = rows.map((row) => ({
          ...(row as unknown as PrepIngredient),
          current_stock: toNumberOr(row.current_stock),
          minimum_stock: row.minimum_stock === '' ? null : toNumberOr(row.minimum_stock),
        }));
        data.prep = prep;
      }
    });

    if (Object.keys(data).length === 0) return null;

    return {
      version: 1,
      exported_at: new Date().toISOString(),
      branch: { id: branch.id, branch_code: branch.branch_code, branch_name: branch.branch_name },
      data,
    };
  };

  const readPickedFileText = async (asset: DocumentPicker.DocumentPickerAsset): Promise<string> => {
    if (Platform.OS === 'web') {
      const webFile = (asset as DocumentPicker.DocumentPickerAsset & { file?: File }).file;
      if (webFile) return webFile.text();
      if (asset.uri) {
        const response = await fetch(asset.uri);
        return await response.text();
      }
      throw new Error('Webファイルの読み込みに失敗しました');
    }
    return await FileSystem.readAsStringAsync(asset.uri, { encoding: 'utf8' });
  };

  const readPickedFileBase64 = async (asset: DocumentPicker.DocumentPickerAsset): Promise<string> => {
    if (Platform.OS === 'web') {
      const webFile = (asset as DocumentPicker.DocumentPickerAsset & { file?: File }).file;
      if (webFile) {
        const arrayBuffer = await webFile.arrayBuffer();
        return bytesToBase64(new Uint8Array(arrayBuffer));
      }
      if (asset.uri) {
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        return bytesToBase64(new Uint8Array(arrayBuffer));
      }
      throw new Error('Web ZIPファイルの読み込みに失敗しました');
    }
    return await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  };

  const pickImportFile = async () => {
    try {
      setImportError('');
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/zip', 'text/csv', 'application/octet-stream', 'text/plain'],
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;

      const lowerName = (asset.name ?? '').toLowerCase();
      const isZip = lowerName.endsWith('.zip') || (asset.mimeType ?? '').includes('zip');
      let payload: StoreBackupPayload | null = null;

      if (isZip) {
        const base64 = await readPickedFileBase64(asset);
        const zipEntries = extractStoredZipEntries(base64ToBytes(base64));
        const csvFiles = zipEntries
          .filter((entry) => entry.name.toLowerCase().endsWith('.csv'))
          .map((entry) => ({ name: entry.name, content: bytesToText(entry.data) }));
        payload = payloadFromCsvFiles(csvFiles);
      } else {
        const text = await readPickedFileText(asset);
        payload = payloadFromCsvFiles([{ name: asset.name ?? 'import.csv', content: text }]);
      }

      if (!payload) {
        setImportPayload(null);
        setSelectedImportCategories(new Set());
        setImportError('読み込めるバックアップ形式ではありません');
        return;
      }

      const available = (Object.keys(payload.data) as ExportableCategory[]).filter((key) => payload?.data?.[key] != null);
      setImportPayload(payload);
      setSelectedImportCategories(new Set(available));
      setImportSourceName(asset.name ?? 'backup');
      if (payload.branch?.id && payload.branch.id !== branch.id) {
        setImportError(`注意: 別店舗(${payload.branch.branch_name})のバックアップです。現在の店舗(${branch.branch_name})へ取り込みます。`);
      } else {
        setImportError('');
      }
    } catch (error: any) {
      console.error('Data import parse error:', error);
      setImportPayload(null);
      setSelectedImportCategories(new Set());
      setImportError(`ファイル解析に失敗しました: ${error?.message ?? ''}`);
    }
  };

  const importData = async () => {
    if (!importPayload) {
      setImportError('先にインポートファイルを選択してください');
      return;
    }
    if (selectedImportCategories.size === 0) {
      setImportError('取り込むデータを選択してください');
      return;
    }

    setImportingData(true);
    try {
      if (selectedImportCategories.has('menu')) {
        const menuData = (importPayload.data.menu ?? {}) as { menus?: Menu[]; menu_categories?: MenuCategory[] };
        const incomingMenus = (menuData.menus ?? []).map((menu) => ({ ...menu, branch_id: branch.id }));
        const incomingCategories = (menuData.menu_categories ?? []).map((category) => ({ ...category, branch_id: branch.id }));

        if (isSupabaseConfigured()) {
          await supabase.from('menus').delete().eq('branch_id', branch.id);
          await supabase.from('menu_categories').delete().eq('branch_id', branch.id);
          if (incomingCategories.length > 0) await supabase.from('menu_categories').insert(incomingCategories);
          if (incomingMenus.length > 0) await supabase.from('menus').insert(incomingMenus);
        }

        const allMenus = await getMenus();
        const allCategories = await getMenuCategories();
        await saveMenus([...allMenus.filter((menu) => menu.branch_id !== branch.id), ...incomingMenus]);
        await saveMenuCategories([
          ...allCategories.filter((category) => category.branch_id !== branch.id),
          ...incomingCategories,
        ]);
      }

      if (selectedImportCategories.has('sales')) {
        const salesData = (importPayload.data.sales ?? {}) as {
          transactions?: Transaction[];
          transaction_items?: TransactionItem[];
          pending_transactions?: PendingTransaction[];
        };
        const incomingTransactions = (salesData.transactions ?? []).map((tx) => ({ ...tx, branch_id: branch.id }));
        const incomingItems = salesData.transaction_items ?? [];
        const incomingPending = (salesData.pending_transactions ?? []).map((tx) => ({ ...tx, branch_id: branch.id }));

        if (isSupabaseConfigured()) {
          const { data: currentTx } = await supabase.from('transactions').select('id').eq('branch_id', branch.id);
          const currentIds = (currentTx ?? []).map((row) => row.id);
          if (currentIds.length > 0) {
            await supabase.from('transaction_items').delete().in('transaction_id', currentIds);
          }
          await supabase.from('transactions').delete().eq('branch_id', branch.id);
          if (incomingTransactions.length > 0) await supabase.from('transactions').insert(incomingTransactions);
          if (incomingItems.length > 0) await supabase.from('transaction_items').insert(incomingItems);
        }

        await clearAllPendingTransactions(branch.id);
        for (const tx of incomingPending) {
          await savePendingTransaction(tx);
        }
      }

      if (selectedImportCategories.has('visitor')) {
        const visitorData = (importPayload.data.visitor ?? {}) as {
          visitor_counts?: PendingVisitorCount[];
          pending_visitor_counts?: PendingVisitorCount[];
          visitor_groups?: VisitorCounterGroup[];
        };
        const incomingVisitorCounts = (visitorData.visitor_counts ?? []).map((v) => ({ ...v, branch_id: branch.id }));
        const incomingPending = (visitorData.pending_visitor_counts ?? []).map((v) => ({ ...v, branch_id: branch.id }));
        const incomingGroups = visitorData.visitor_groups ?? [];

        if (isSupabaseConfigured()) {
          await supabase.from('visitor_counts').delete().eq('branch_id', branch.id);
          if (incomingVisitorCounts.length > 0) {
            await supabase.from('visitor_counts').insert(incomingVisitorCounts);
          }
        }

        await clearPendingVisitorCountsByBranch(branch.id);
        for (const row of incomingPending) {
          await savePendingVisitorCount(row);
        }
        await saveVisitorGroups(branch.id, incomingGroups);
      }

      if (selectedImportCategories.has('budget')) {
        const budgetData = (importPayload.data.budget ?? {}) as {
          budget_settings?: BudgetSettings;
          budget_expenses?: BudgetExpense[];
        };
        const incomingSettings: BudgetSettings = {
          branch_id: branch.id,
          initial_budget: budgetData.budget_settings?.initial_budget ?? 0,
          target_sales: budgetData.budget_settings?.target_sales ?? 0,
        };
        const incomingExpenses = (budgetData.budget_expenses ?? []).map((expense) => ({
          ...expense,
          branch_id: branch.id,
        }));

        if (isSupabaseConfigured()) {
          await supabase.from('budget_expenses').delete().eq('branch_id', branch.id);
          await supabase.from('budget_settings').delete().eq('branch_id', branch.id);
          await supabase.from('budget_settings').insert(incomingSettings);
          if (incomingExpenses.length > 0) await supabase.from('budget_expenses').insert(incomingExpenses);
        }

        const allExpenses = await getBudgetExpenses();
        await saveBudgetSettings(incomingSettings);
        await saveBudgetExpenses([...allExpenses.filter((expense) => expense.branch_id !== branch.id), ...incomingExpenses]);
      }

      if (selectedImportCategories.has('prep')) {
        const prepData = (importPayload.data.prep ?? {}) as { prep_ingredients?: PrepIngredient[] };
        const incomingPrep = (prepData.prep_ingredients ?? []).map((ingredient) => ({
          ...ingredient,
          branch_id: branch.id,
        }));

        if (isSupabaseConfigured()) {
          await supabase.from('prep_ingredients').delete().eq('branch_id', branch.id);
          if (incomingPrep.length > 0) await supabase.from('prep_ingredients').insert(incomingPrep);
        }
        await savePrepIngredients(branch.id, incomingPrep);
      }

      alertNotify('完了', 'データのインポートが完了しました');
      setShowDataImportModal(false);
      setImportPayload(null);
      setSelectedImportCategories(new Set());
      setImportSourceName('');
      setImportError('');
    } catch (error: any) {
      console.error('Data import error:', error);
      setImportError(`データのインポートに失敗しました: ${error?.message ?? ''}`);
    } finally {
      setImportingData(false);
    }
  };

  const handlePreDeleteWithoutExport = async () => {
    const snapshot = new Set(pendingDeleteCategories);
    setShowPreDeleteExportModal(false);
    setPendingDeleteCategories(new Set());
    await executeDataDeletion(snapshot);
  };

  const handlePreDeleteWithExport = async () => {
    const snapshot = new Set(pendingDeleteCategories);
    const exported = await exportData(snapshot, { silentSuccess: true });
    if (!exported) return;
    setShowPreDeleteExportModal(false);
    setPendingDeleteCategories(new Set());
    await executeDataDeletion(snapshot);
  };

  const handleBackToTop = () => {
      onLogout();
  };

  const maskedLoginCode = branchLoginCode
    ? `${branchLoginCode.slice(0, 1)}${'＊'.repeat(Math.max(0, branchLoginCode.length - 1))}`
    : null;

  const handleCopyLoginCode = async () => {
    if (!branchLoginCode) return;
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(branchLoginCode);
      } else {
        await Clipboard.setStringAsync(branchLoginCode);
      }
      setCopiedLoginCode(true);
      setTimeout(() => setCopiedLoginCode(false), 1600);
    } catch {
      alertNotify('エラー', 'ログインコードのコピーに失敗しました');
    }
  };

  const currentBranchIndex = switchableBranches.findIndex((b) => b.id === branch.id);
  const canSwitchBranch = isOrgPlan && authState.status === 'authenticated' && switchableBranches.length > 1 && currentBranchIndex >= 0;

  const moveBranch = async (direction: -1 | 1) => {
    if (!canSwitchBranch) return;
    const nextIndex = (currentBranchIndex + direction + switchableBranches.length) % switchableBranches.length;
    const nextBranch = switchableBranches[nextIndex];
    if (!nextBranch) return;
    await saveBranch(nextBranch);
    onBranchUpdated?.(nextBranch);
  };

  const branchSwitcher = canSwitchBranch ? (
    <View className="flex-row items-center rounded-full border border-blue-200 bg-blue-50 px-1 py-0.5">
      <TouchableOpacity onPress={() => moveBranch(-1)} className="w-7 h-7 items-center justify-center rounded-full bg-white" activeOpacity={0.8}>
        <Text className="text-blue-700 font-bold">{'<'}</Text>
      </TouchableOpacity>
      <Text className="text-[11px] text-blue-700 font-semibold px-1.5">
        {currentBranchIndex + 1}/{switchableBranches.length}
      </Text>
      <TouchableOpacity onPress={() => moveBranch(1)} className="w-7 h-7 items-center justify-center rounded-full bg-white" activeOpacity={0.8}>
        <Text className="text-blue-700 font-bold">{'>'}</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <SafeAreaView className="flex-1 bg-gray-100" edges={['top']}>
      <Header
        title={branch.branch_name}
        titleLeftElement={branchSwitcher}
        subtitleElement={
          <View className="flex-row items-center gap-2 mt-0.5">
            <Text className="text-sm text-gray-500">支店番号: {branch.branch_code}</Text>
            {maskedLoginCode ? (
              <TouchableOpacity
                onPress={() => setShowLoginCodeModal(true)}
                activeOpacity={0.8}
                className="px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50"
              >
                <Text className="text-[11px] font-medium text-blue-700">ログインコード: {maskedLoginCode}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        rightElement={
          <Button title="トップ画面" onPress={handleBackToTop} variant="secondary" size="sm" />
        }
      />

      {/* Tab Bar */}
      <View className="flex-row bg-white border-b border-gray-200">
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => handleTabChange(tab.key)}
            activeOpacity={0.7}
            className={`flex-1 py-3 items-center border-b-2 ${
              activeTab === tab.key ? 'border-blue-500' : 'border-transparent'
            }`}
          >
            <Text
              className={`text-base font-bold ${
                activeTab === tab.key ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <ScrollView className="flex-1 p-6" contentContainerStyle={{ flexGrow: 1 }}>
        {activeTab === 'main' && (
          <View className="flex-1 gap-4">

            <TouchableOpacity onPress={onNavigateToRegister} activeOpacity={0.8}>
              <Card className="bg-sky-400 p-4">
                <Text className="text-white text-2xl  font-bold text-center">レジ</Text>
                <Text className="text-blue-100 text-center mt-2">注文・会計を行う</Text>
              </Card>
            </TouchableOpacity>

              <TouchableOpacity onPress={onNavigateToMenus} activeOpacity={0.8}>
                <Card className="bg-green-400 p-4">
                  <Text className="text-white text-2xl  font-bold text-center">メニュー登録</Text>
                  <Text className="text-green-100 text-center mt-2">商品・在庫管理</Text>
                </Card>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => withRestrictionCheck('sales_history', onNavigateToHistory)} activeOpacity={0.8}>
                <Card className="bg-orange-400 p-4">
                  <Text className="text-white text-2xl  font-bold text-center">販売履歴</Text>
                  <Text className="text-orange-100 text-center mt-2">売上確認・取消</Text>
                </Card>
              </TouchableOpacity>

          </View>
        )}

        {activeTab === 'sub' && (
          <View className="flex-1 gap-4">

            <TouchableOpacity onPress={onNavigateToCustomerOrder} activeOpacity={0.8}>
              <Card className="bg-teal-500 p-6">
                <Text className="text-white text-2xl font-bold text-center">モバイルオーダー</Text>
                <Text className="text-teal-100 text-center mt-2">この端末を客用注文画面として使用</Text>
              </Card>
            </TouchableOpacity>

            <TouchableOpacity onPress={onNavigateToOrderBoard} activeOpacity={0.8}>
              <Card className="bg-orange-400 p-6">
                <Text className="text-white text-2xl  font-bold text-center">注文受付</Text>
                <Text className="text-amber-100 text-center mt-2">別端末で注文を表示・管理</Text>
              </Card>
            </TouchableOpacity>

            <TouchableOpacity onPress={onNavigateToCounter} activeOpacity={0.8}>
              <Card className="bg-purple-500 px-12 py-6">
                <Text className="text-white text-2xl  font-bold text-center">来客カウンター</Text>
                <Text className="text-purple-100 text-center mt-2">ボタンをタップして来場者数を記録</Text>
              </Card>
            </TouchableOpacity>

            <TouchableOpacity onPress={onNavigateToPrep} activeOpacity={0.8}>
              <Card className="bg-rose-500 px-12 py-6">
                <Text className="text-white text-2xl font-bold text-center">調理の下準備</Text>
                <Text className="text-rose-100 text-center mt-2">材料登録・在庫共有を行う</Text>
              </Card>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'budget' && (
          <View className="flex-1 gap-4">

            <TouchableOpacity onPress={onNavigateToBudgetExpense} activeOpacity={0.8}>
              <Card className="bg-emerald-500 p-6">
                <Text className="text-white text-2xl  font-bold text-center">支出記録</Text>
                <Text className="text-emerald-100 text-center mt-2">予算管理とは別担当が支出を入力</Text>
              </Card>
            </TouchableOpacity>

            <TouchableOpacity onPress={onNavigateToBudgetBreakeven} activeOpacity={0.8}>
              <Card className="bg-violet-500 p-6">
                <Text className="text-white text-2xl  font-bold text-center">損益分岐点の計算</Text>
                <Text className="text-violet-100 text-center mt-2">価格・原価から必要販売数を試算</Text>
              </Card>
            </TouchableOpacity>

            <TouchableOpacity onPress={onNavigateToBudget} activeOpacity={0.8}>
              <Card className="bg-indigo-500 p-6">
                <Text className="text-white text-2xl  font-bold text-center">会計処理</Text>
                <Text className="text-indigo-100 text-center mt-2">予算設定・収支確認・報告書の作成</Text>
              </Card>
            </TouchableOpacity>


          </View>
        )}

        {activeTab === 'settings' && (
          <View className="flex-1 gap-4">

            {/* ===== トップ: カード選択 ===== */}
            {settingsView === 'top' && (
              <>
                <TouchableOpacity onPress={() => setSettingsView('payment')} activeOpacity={0.8}>
                  <Card className="bg-blue-500 p-6">
                    <Text className="text-white text-2xl font-bold text-center">支払い設定</Text>
                    <Text className="text-blue-100 text-center mt-2">レジで使用する支払い方法を選択</Text>
                  </Card>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setSettingsView('admin')} activeOpacity={0.8}>
                  <Card className="bg-gray-600 p-6">
                    <Text className="text-white text-2xl font-bold text-center">管理者設定</Text>
                    <Text className="text-gray-300 text-center mt-2">パスワード・制限・データ管理</Text>
                  </Card>
                </TouchableOpacity>
              </>
            )}

            {/* ===== 支払い設定 ===== */}
            {settingsView === 'payment' && (
              <>
                <TouchableOpacity onPress={() => setSettingsView('top')} activeOpacity={0.7} className="flex-row items-center mb-2">
                  <Text className="text-blue-600 text-base">← 戻る</Text>
                </TouchableOpacity>

                <Text className="text-gray-500 text-sm mb-1">
                  レジ画面に表示する支払い方法を選択してください
                </Text>

                {/* Cash */}
                <TouchableOpacity
                  onPress={() => togglePaymentMethod('cash')}
                  activeOpacity={0.7}
                  className={`flex-row items-center p-4 rounded-xl border-2 bg-white ${
                    paymentMethods.cash ? 'border-green-500 bg-green-50' : 'border-gray-200'
                  }`}
                >
                  <View className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                    paymentMethods.cash ? 'border-green-500 bg-green-500' : 'border-gray-300'
                  }`}>
                    {paymentMethods.cash && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold">現金</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">テンキーで金額入力・お釣り計算</Text>
                  </View>
                </TouchableOpacity>

                {/* Cashless */}
                <TouchableOpacity
                  onPress={() => togglePaymentMethod('cashless')}
                  activeOpacity={0.7}
                  className={`flex-row items-center p-4 rounded-xl border-2 bg-white ${
                    paymentMethods.cashless ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <View className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                    paymentMethods.cashless ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                  }`}>
                    {paymentMethods.cashless && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold">キャッシュレス</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">PayPay等の電子決済</Text>
                  </View>
                </TouchableOpacity>

                {/* Voucher */}
                <TouchableOpacity
                  onPress={() => togglePaymentMethod('voucher')}
                  activeOpacity={0.7}
                  className={`flex-row items-center p-4 rounded-xl border-2 bg-white ${
                    paymentMethods.voucher ? 'border-amber-500 bg-amber-50' : 'border-gray-200'
                  }`}
                >
                  <View className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                    paymentMethods.voucher ? 'border-amber-500 bg-amber-500' : 'border-gray-300'
                  }`}>
                    {paymentMethods.voucher && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold">金券</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">金券・チケットでの支払い</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}

            {/* ===== 管理者設定 ===== */}
            {settingsView === 'admin' && (
              <>
                <TouchableOpacity onPress={() => setSettingsView('top')} activeOpacity={0.7} className="flex-row items-center mb-2">
                  <Text className="text-blue-600 text-base">← 戻る</Text>
                </TouchableOpacity>

                <Card className="bg-slate-900 border border-slate-700 p-4">
                  <Text className="text-slate-100 text-lg font-bold">管理者コンソール</Text>
                  <Text className="text-slate-300 text-xs mt-1">
                    セキュリティ設定とデータ管理をこの画面でまとめて実行できます。
                  </Text>
                </Card>

                <View className="bg-white rounded-2xl border border-gray-200 p-3">
                  <Text className="text-gray-900 font-bold mb-2">セキュリティ</Text>

                  <TouchableOpacity
                    onPress={() => { resetPasswordForm(); setShowPasswordModal(true); }}
                    activeOpacity={0.8}
                    className="flex-row items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 mb-2"
                  >
                    <View className="w-9 h-9 rounded-full bg-slate-200 items-center justify-center">
                      <Text className="text-slate-700 font-bold">PW</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-slate-900 font-semibold">パスワード設定</Text>
                      <Text className="text-slate-500 text-xs">管理者パスワードの変更</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setShowRestrictionsModal(true)}
                    activeOpacity={0.8}
                    className="flex-row items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"
                  >
                    <View className="w-9 h-9 rounded-full bg-amber-200 items-center justify-center">
                      <Text className="text-amber-700 font-bold">制限</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-amber-900 font-semibold">制限管理</Text>
                      <Text className="text-amber-700 text-xs">操作ごとにパスワード保護を設定</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                <View className="bg-white rounded-2xl border border-red-200 p-3">
                  <View className="bg-red-50 rounded-xl px-3 py-2 mb-2">
                    <Text className="text-red-800 font-bold">データ管理</Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      setAdminPasswordInput('');
                      setResetError('');
                      setSelectedDeleteCategories(new Set());
                      setShowDataDeleteModal(true);
                    }}
                    activeOpacity={0.8}
                    className="flex-row items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 mb-2"
                  >
                    <View className="w-9 h-9 rounded-full bg-red-200 items-center justify-center">
                      <Text className="text-red-700 font-bold">削除</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-red-900 font-semibold">データ削除</Text>
                      <Text className="text-red-700 text-xs">選択したデータを一括削除</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setSelectedExportCategories(new Set());
                      setShowDataExportModal(true);
                    }}
                    activeOpacity={0.8}
                    className="flex-row items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 mb-2"
                  >
                    <View className="w-9 h-9 rounded-full bg-emerald-200 items-center justify-center">
                      <Text className="text-emerald-700 font-bold">出力</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-emerald-900 font-semibold">データエクスポート</Text>
                      <Text className="text-emerald-700 text-xs">選択したデータをバックアップ出力</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setImportPayload(null);
                      setSelectedImportCategories(new Set());
                      setImportSourceName('');
                      setImportError('');
                      setShowDataImportModal(true);
                    }}
                    activeOpacity={0.8}
                    className="flex-row items-center gap-3 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-3"
                  >
                    <View className="w-9 h-9 rounded-full bg-cyan-200 items-center justify-center">
                      <Text className="text-cyan-700 font-bold">復元</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-cyan-900 font-semibold">データインポート</Text>
                      <Text className="text-cyan-700 text-xs">バックアップからデータ復元</Text>
                    </View>
                  </TouchableOpacity>

                  {authState.status === 'login_code' && (
                    <TouchableOpacity
                      onPress={async () => {
                        await exitLoginCode();
                        onLogout();
                      }}
                      activeOpacity={0.8}
                      className="flex-row items-center gap-3 rounded-xl border border-red-300 bg-white px-3 py-3 mt-2"
                    >
                      <View className="w-9 h-9 rounded-full bg-red-100 items-center justify-center">
                        <Text className="text-red-700 font-bold">退</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-red-700 font-semibold">ログアウト</Text>
                        <Text className="text-red-500 text-xs">ログインコード利用を終了してトップへ戻る</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

          </View>
        )}
      </ScrollView>

      {/* Password Change Modal */}
      <Modal
        visible={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          resetPasswordForm();
        }}
        title="管理者パスワード変更"
      >
        <Input
          label="新しいパスワード"
          value={newPassword}
          onChangeText={(text) => {
            setNewPassword(text);
            setPasswordError('');
          }}
          placeholder="4文字以上"
        />
        <Input
          label="新しいパスワード（確認）"
          value={confirmPassword}
          onChangeText={(text) => {
            setConfirmPassword(text);
            setPasswordError('');
          }}
          placeholder="もう一度入力"
          error={passwordError}
        />
        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Button
              title="キャンセル"
              onPress={() => {
                setShowPasswordModal(false);
                resetPasswordForm();
              }}
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <Button
              title="変更"
              onPress={handleChangePassword}
              loading={savingPassword}
              disabled={!newPassword.trim() || !confirmPassword.trim()}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showLoginCodeModal}
        onClose={() => {
          setShowLoginCodeModal(false);
          setCopiedLoginCode(false);
        }}
        title="ログインコード"
      >
        <View className="items-center py-2">
          <Text className="text-3xl font-bold tracking-[0.28em] text-gray-900">
            {branchLoginCode ?? '------'}
          </Text>
          <Text className="text-gray-500 text-xs mt-2">
            タップでコピーして、店舗ログインに共有できます
          </Text>
        </View>
        <View className="flex-row gap-3 mt-3">
          <View className="flex-1">
            <Button
              title="閉じる"
              onPress={() => {
                setShowLoginCodeModal(false);
                setCopiedLoginCode(false);
              }}
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <Button
              title={copiedLoginCode ? 'コピー済み' : 'コピー'}
              onPress={handleCopyLoginCode}
              disabled={!branchLoginCode}
            />
          </View>
        </View>
      </Modal>

      {/* Data Delete Modal */}
      <Modal
        visible={showDataDeleteModal}
        onClose={() => {
          setShowDataDeleteModal(false);
          setAdminPasswordInput('');
          setResetError('');
          setSelectedDeleteCategories(new Set());
        }}
        title="データ削除"
      >
        <View className="bg-red-50 p-3 rounded-lg mb-4">
          <Text className="text-red-700 text-sm font-medium text-center">
            この操作は取り消せません
          </Text>
          <Text className="text-red-600 text-xs text-center mt-1">
            選択したデータが完全に削除されます
          </Text>
        </View>

        {/* カテゴリ チェックリスト */}
        <Text className="text-gray-700 text-sm font-semibold mb-2">削除するデータを選択</Text>
        {DATA_CATEGORY_DEFS.map((item) => (
          <TouchableOpacity
            key={item.key}
            onPress={() => toggleDeleteCategory(item.key)}
            activeOpacity={0.7}
            className={`flex-row items-center p-3 rounded-xl border-2 mb-2 ${
              selectedDeleteCategories.has(item.key)
                ? 'border-red-400 bg-red-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <View
              className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                selectedDeleteCategories.has(item.key)
                  ? 'border-red-500 bg-red-500'
                  : 'border-gray-300'
              }`}
            >
              {selectedDeleteCategories.has(item.key) && (
                <Text className="text-white text-xs font-bold">✓</Text>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-gray-900 font-semibold">{item.label}</Text>
              <Text className="text-gray-500 text-xs mt-0.5">{item.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <Input
          label="管理者パスワード"
          value={adminPasswordInput}
          onChangeText={(text) => {
            setAdminPasswordInput(text);
            setResetError('');
          }}
          placeholder="パスワードを入力（デフォルト: 0000）"
          secureTextEntry
          error={resetError}
        />
        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Button
              title="キャンセル"
              onPress={() => {
                setShowDataDeleteModal(false);
                setAdminPasswordInput('');
                setResetError('');
                setSelectedDeleteCategories(new Set());
              }}
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <Button
              title="削除する"
              onPress={handleDataDelete}
              variant="danger"
              loading={resetting}
              disabled={selectedDeleteCategories.size === 0 || !adminPasswordInput.trim()}
            />
          </View>
        </View>
      </Modal>

      {/* Pre Delete Export Confirm Modal */}
      <Modal
        visible={showPreDeleteExportModal}
        onClose={() => {
          setShowPreDeleteExportModal(false);
          setPendingDeleteCategories(new Set());
        }}
        title="削除前の確認"
      >
        <Text className="text-gray-700 text-sm mb-4">
          データをエクスポートしてから削除しますか？
        </Text>
        {pendingDeleteCategories.size > 0 && (
          <View className="bg-gray-50 p-3 rounded-lg mb-3">
            <Text className="text-gray-600 text-xs">
              対象: {Array.from(pendingDeleteCategories).map((key) => DATA_CATEGORY_LABELS[key]).join('、')}
            </Text>
          </View>
        )}
        <View className="bg-amber-50 p-3 rounded-lg mb-4">
          <Text className="text-amber-800 text-xs">
            複数カテゴリを選択している場合は ZIP でダウンロードします。
          </Text>
        </View>
        <View className="gap-2">
          <Button
            title="エクスポートしてから削除"
            onPress={handlePreDeleteWithExport}
            loading={exportingData || resetting}
            disabled={pendingDeleteCategories.size === 0}
          />
          <Button
            title="エクスポートせず削除"
            onPress={handlePreDeleteWithoutExport}
            variant="danger"
            loading={resetting}
            disabled={pendingDeleteCategories.size === 0}
          />
          <Button
            title="キャンセル"
            onPress={() => {
              setShowPreDeleteExportModal(false);
              setPendingDeleteCategories(new Set());
            }}
            variant="secondary"
          />
        </View>
      </Modal>

      {/* Data Export Modal */}
      <Modal
        visible={showDataExportModal}
        onClose={() => {
          setShowDataExportModal(false);
          setSelectedExportCategories(new Set());
        }}
        title="データエクスポート"
      >
        <Text className="text-gray-700 text-sm font-semibold mb-2">出力するデータを選択</Text>
        {DATA_CATEGORY_DEFS.map((item) => (
          <TouchableOpacity
            key={item.key}
            onPress={() => toggleExportCategory(item.key)}
            activeOpacity={0.7}
            className={`flex-row items-center p-3 rounded-xl border-2 mb-2 ${
              selectedExportCategories.has(item.key)
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <View
              className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                selectedExportCategories.has(item.key)
                  ? 'border-emerald-500 bg-emerald-500'
                  : 'border-gray-300'
              }`}
            >
              {selectedExportCategories.has(item.key) && (
                <Text className="text-white text-xs font-bold">✓</Text>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-gray-900 font-semibold">{item.label}</Text>
              <Text className="text-gray-500 text-xs mt-0.5">{item.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <View className="bg-blue-50 rounded-lg p-3 mb-2">
          <Text className="text-blue-700 text-xs">
            1ファイルの場合はCSVで出力、複数ファイルになる場合はCSVをZIPで出力します
          </Text>
        </View>
        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Button
              title="キャンセル"
              onPress={() => {
                setShowDataExportModal(false);
                setSelectedExportCategories(new Set());
              }}
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <Button
              title="エクスポート"
              onPress={async () => {
                const ok = await exportData(selectedExportCategories);
                if (ok) {
                  setShowDataExportModal(false);
                  setSelectedExportCategories(new Set());
                }
              }}
              loading={exportingData}
              disabled={selectedExportCategories.size === 0}
            />
          </View>
        </View>
      </Modal>

      {/* Data Import Modal */}
      <Modal
        visible={showDataImportModal}
        onClose={() => {
          setShowDataImportModal(false);
          setImportPayload(null);
          setSelectedImportCategories(new Set());
          setImportSourceName('');
          setImportError('');
        }}
        title="データインポート"
      >
        <Button title="バックアップファイルを選択" onPress={pickImportFile} variant="secondary" />
        {importSourceName ? (
          <Text className="text-gray-600 text-xs mt-2">選択ファイル: {importSourceName}</Text>
        ) : (
          <Text className="text-gray-400 text-xs mt-2">CSV または CSV入りZIP を選択してください</Text>
        )}

        {importPayload && (
          <>
            <Text className="text-gray-700 text-sm font-semibold mt-4 mb-2">取り込むデータを選択</Text>
            {DATA_CATEGORY_DEFS.filter((item) => importPayload.data[item.key] != null).map((item) => (
              <TouchableOpacity
                key={item.key}
                onPress={() => toggleImportCategory(item.key)}
                activeOpacity={0.7}
                className={`flex-row items-center p-3 rounded-xl border-2 mb-2 ${
                  selectedImportCategories.has(item.key)
                    ? 'border-cyan-400 bg-cyan-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <View
                  className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                    selectedImportCategories.has(item.key)
                      ? 'border-cyan-500 bg-cyan-500'
                      : 'border-gray-300'
                  }`}
                >
                  {selectedImportCategories.has(item.key) && (
                    <Text className="text-white text-xs font-bold">✓</Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-gray-900 font-semibold">{item.label}</Text>
                  <Text className="text-gray-500 text-xs mt-0.5">{item.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {importError ? (
          <View className="bg-amber-50 p-3 rounded-lg mt-2">
            <Text className="text-amber-800 text-xs">{importError}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-3 mt-4">
          <View className="flex-1">
            <Button
              title="キャンセル"
              onPress={() => {
                setShowDataImportModal(false);
                setImportPayload(null);
                setSelectedImportCategories(new Set());
                setImportSourceName('');
                setImportError('');
              }}
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <Button
              title="インポート"
              onPress={importData}
              loading={importingData}
              disabled={!importPayload || selectedImportCategories.size === 0}
            />
          </View>
        </View>
      </Modal>

      {/* Restrictions Management Modal */}
      <Modal
        visible={showRestrictionsModal}
        onClose={() => setShowRestrictionsModal(false)}
        title="制限管理"
      >
        <ScrollView style={{ maxHeight: 480 }}>
          <Text className="text-gray-500 text-sm mb-4">
            チェックした操作には管理者パスワードが必要になります
          </Text>

          {/* Menu Section */}
          <Text className="font-bold text-gray-700 mb-2">メニュー</Text>
          {([
            { key: 'menu_add' as const, label: 'メニューの追加', desc: '新しいメニュー項目の登録' },
            { key: 'menu_edit' as const, label: 'メニューの編集', desc: '既存メニューの価格・名前変更' },
            { key: 'menu_delete' as const, label: 'メニューの削除', desc: 'メニュー項目の削除' },
          ]).map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => toggleRestriction(item.key)}
              activeOpacity={0.7}
              className={`flex-row items-center p-3 rounded-xl border-2 mb-2 ${
                restrictions[item.key] ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
              }`}
            >
              <View
                className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                  restrictions[item.key] ? 'border-red-500 bg-red-500' : 'border-gray-300'
                }`}
              >
                {restrictions[item.key] && <Text className="text-white text-xs font-bold">✓</Text>}
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 font-semibold">{item.label}</Text>
                <Text className="text-gray-500 text-xs mt-0.5">{item.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Sales Section */}
          <Text className="font-bold text-gray-700 mb-2 mt-3">売上</Text>
          {([
            { key: 'sales_cancel' as const, label: '売上の取消（レジ返品）', desc: '販売済み注文のキャンセル' },
            { key: 'sales_history' as const, label: '売上履歴の閲覧', desc: '販売履歴画面へのアクセス' },
            { key: 'sales_reset' as const, label: '売上データの全削除', desc: '全売上データの削除' },
          ]).map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => toggleRestriction(item.key)}
              activeOpacity={0.7}
              className={`flex-row items-center p-3 rounded-xl border-2 mb-2 ${
                restrictions[item.key] ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
              }`}
            >
              <View
                className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                  restrictions[item.key] ? 'border-red-500 bg-red-500' : 'border-gray-300'
                }`}
              >
                {restrictions[item.key] && <Text className="text-white text-xs font-bold">✓</Text>}
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 font-semibold">{item.label}</Text>
                <Text className="text-gray-500 text-xs mt-0.5">{item.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Settings Section */}
          <Text className="font-bold text-gray-700 mb-2 mt-3">設定</Text>
          {([
            { key: 'payment_change' as const, label: '支払い方法の変更', desc: '現金/キャッシュレス/金券のON/OFF' },
            { key: 'settings_access' as const, label: '設定タブへのアクセス', desc: '設定タブ自体へのアクセス' },
          ]).map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => toggleRestriction(item.key)}
              activeOpacity={0.7}
              className={`flex-row items-center p-3 rounded-xl border-2 mb-2 ${
                restrictions[item.key] ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
              }`}
            >
              <View
                className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                  restrictions[item.key] ? 'border-red-500 bg-red-500' : 'border-gray-300'
                }`}
              >
                {restrictions[item.key] && <Text className="text-white text-xs font-bold">✓</Text>}
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 font-semibold">{item.label}</Text>
                <Text className="text-gray-500 text-xs mt-0.5">{item.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View className="mt-4">
          <Button
            title="閉じる"
            onPress={() => setShowRestrictionsModal(false)}
            variant="secondary"
          />
        </View>
      </Modal>

      {/* Admin Guard Modal (generic password prompt for restricted operations) */}
      <Modal
        visible={showAdminGuardModal}
        onClose={closeAdminGuard}
        title="管理者パスワード"
      >
        <Text className="text-gray-600 text-sm mb-3">
          この操作には管理者パスワードが必要です
        </Text>
        <Input
          label="パスワード"
          value={adminGuardInput}
          onChangeText={(text) => {
            setAdminGuardInput(text);
            setAdminGuardError('');
          }}
          secureTextEntry
          placeholder="管理者パスワードを入力"
          error={adminGuardError}
        />
        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Button title="キャンセル" onPress={closeAdminGuard} variant="secondary" />
          </View>
          <View className="flex-1">
            <Button
              title="確認"
              onPress={handleAdminGuardSubmit}
              disabled={!adminGuardInput.trim()}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
