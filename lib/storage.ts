import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Branch,
  Menu,
  MenuCategory,
  PendingTransaction,
  LocalStorage,
  PendingVisitorCount,
  StoreSettings,
  BudgetExpense,
  BudgetSettings,
  VisitorCounterGroup,
  RestrictionSettings,
  PrepIngredient,
  BranchRecorder,
  BranchRecorderConfig,
  RecorderAccessLog,
} from '../types/database';
import { setSyncEnabled } from './syncMode';

const STORAGE_KEYS = {
  BRANCH: '@festival_pos/branch',
  MENUS: '@festival_pos/menus',
  PENDING_TRANSACTIONS: '@festival_pos/pending_transactions',
  PENDING_VISITOR_COUNTS: '@festival_pos/pending_visitor_counts',
  LAST_SYNC_TIME: '@festival_pos/last_sync_time',
  HQ_AUTH: '@festival_pos/hq_auth',
  STORE_SETTINGS: '@festival_pos/store_settings',
  ORDER_COUNTER: '@festival_pos/order_counter',
  BUDGET_SETTINGS: '@festival_pos/budget_settings',
  BUDGET_EXPENSES: '@festival_pos/budget_expenses',
  MENU_CATEGORIES: '@festival_pos/menu_categories',
  ADMIN_PASSWORD: '@festival_pos/admin_password',
  RESTRICTIONS: '@festival_pos/restrictions',
};
const VISITOR_GROUPS_KEY_PREFIX = '@festival_pos/visitor_groups';
const PREP_INGREDIENTS_KEY_PREFIX = '@festival_pos/prep_ingredients';
const BREAKEVEN_DRAFT_KEY_PREFIX = '@festival_pos/breakeven_draft';
const EXPENSE_RECORDER_KEY_PREFIX = '@festival_pos/expense_recorder';
const BRANCH_RECORDERS_KEY_PREFIX = '@festival_pos/branch_recorders';
const RECORDER_ACCESS_LOGS_KEY_PREFIX = '@festival_pos/recorder_access_logs';
const RECORDER_CONFIG_KEY_PREFIX = '@festival_pos/recorder_config';
const ORDER_COUNTER_KEY_PREFIX = '@festival_pos/order_counter';
const DEVICE_ID_KEY = '@festival_pos/device_id';

export interface BreakevenDraft {
  product_name: string;
  selling_price: string;
  variable_cost: string;
  fixed_cost: string;
  sim_quantity: string;
  sim_mode?: 'quantity' | 'profit';
  sim_profit_target?: string;
  show_analysis: boolean;
  show_simulation: boolean;
}

// Branch storage
export const saveBranch = async (branch: Branch): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.BRANCH, JSON.stringify(branch));
};

export const getBranch = async (): Promise<Branch | null> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.BRANCH);
  return data ? JSON.parse(data) : null;
};

export const clearBranch = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEYS.BRANCH);
};

// Menu storage
export const saveMenus = async (menus: Menu[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.MENUS, JSON.stringify(menus));
};

export const getMenus = async (): Promise<Menu[]> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.MENUS);
  return data ? JSON.parse(data) : [];
};

export const updateMenuStock = async (menuId: string, newQuantity: number): Promise<void> => {
  const menus = await getMenus();
  const updatedMenus = menus.map((menu) =>
    menu.id === menuId ? { ...menu, stock_quantity: newQuantity, updated_at: new Date().toISOString() } : menu
  );
  await saveMenus(updatedMenus);
};

// Menu categories storage
export const saveMenuCategories = async (categories: MenuCategory[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.MENU_CATEGORIES, JSON.stringify(categories));
};

export const getMenuCategories = async (): Promise<MenuCategory[]> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.MENU_CATEGORIES);
  return data ? JSON.parse(data) : [];
};

// Pending transactions storage
export const savePendingTransaction = async (transaction: PendingTransaction): Promise<void> => {
  const transactions = await getPendingTransactions();
  transactions.push(transaction);
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_TRANSACTIONS, JSON.stringify(transactions));
};

export const getPendingTransactions = async (): Promise<PendingTransaction[]> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_TRANSACTIONS);
  return data ? JSON.parse(data) : [];
};

export const savePendingTransactions = async (transactions: PendingTransaction[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_TRANSACTIONS, JSON.stringify(transactions));
};

export const clearSyncedTransactions = async (): Promise<void> => {
  const transactions = await getPendingTransactions();
  const unsyncedTransactions = transactions.filter((t) => !t.synced);
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_TRANSACTIONS, JSON.stringify(unsyncedTransactions));
};

export const markTransactionSynced = async (transactionId: string): Promise<void> => {
  const transactions = await getPendingTransactions();
  const updatedTransactions = transactions.map((t) =>
    t.id === transactionId ? { ...t, synced: true } : t
  );
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_TRANSACTIONS, JSON.stringify(updatedTransactions));
};

// Served transaction IDs storage (提供完了した注文のIDを記録)
const SERVED_IDS_KEY = '@festival_pos/served_transaction_ids';

export const addServedTransactionId = async (transactionId: string): Promise<void> => {
  const ids = await getServedTransactionIds();
  if (!ids.includes(transactionId)) {
    ids.push(transactionId);
    await AsyncStorage.setItem(SERVED_IDS_KEY, JSON.stringify(ids));
  }
};

export const getServedTransactionIds = async (): Promise<string[]> => {
  const data = await AsyncStorage.getItem(SERVED_IDS_KEY);
  return data ? JSON.parse(data) : [];
};

// Sync time storage
export const saveLastSyncTime = async (): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIME, new Date().toISOString());
};

export const getLastSyncTime = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME);
};

// HQ Authentication storage
export const saveHQAuth = async (isAuthenticated: boolean): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.HQ_AUTH, JSON.stringify(isAuthenticated));
};

export const getHQAuth = async (): Promise<boolean> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.HQ_AUTH);
  return data ? JSON.parse(data) : false;
};

export const clearHQAuth = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEYS.HQ_AUTH);
};

// Visitor count storage
export const savePendingVisitorCount = async (visitorCount: PendingVisitorCount): Promise<void> => {
  const counts = await getPendingVisitorCounts();
  counts.push(visitorCount);
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_VISITOR_COUNTS, JSON.stringify(counts));
};

export const getPendingVisitorCounts = async (): Promise<PendingVisitorCount[]> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_VISITOR_COUNTS);
  return data ? JSON.parse(data) : [];
};

export const savePendingVisitorCounts = async (counts: PendingVisitorCount[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_VISITOR_COUNTS, JSON.stringify(counts));
};

const toLocalDateKey = (iso: string): string => {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const clearSyncedVisitorCounts = async (): Promise<void> => {
  const counts = await getPendingVisitorCounts();
  const unsyncedCounts = counts.filter((c) => !c.synced);
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_VISITOR_COUNTS, JSON.stringify(unsyncedCounts));
};

export const markVisitorCountSynced = async (countId: string): Promise<void> => {
  const counts = await getPendingVisitorCounts();
  const updatedCounts = counts.map((c) =>
    c.id === countId ? { ...c, synced: true } : c
  );
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_VISITOR_COUNTS, JSON.stringify(updatedCounts));
};

export const markVisitorCountsSynced = async (countIds: string[]): Promise<void> => {
  if (countIds.length === 0) return;
  const idSet = new Set(countIds);
  const counts = await getPendingVisitorCounts();
  const updatedCounts = counts.map((count) =>
    idSet.has(count.id) ? { ...count, synced: true } : count
  );
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_VISITOR_COUNTS, JSON.stringify(updatedCounts));
};

export const clearPendingVisitorCountsByBranch = async (branchId: string): Promise<void> => {
  const counts = await getPendingVisitorCounts();
  const remaining = counts.filter((count) => count.branch_id !== branchId);
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_VISITOR_COUNTS, JSON.stringify(remaining));
};

export const clearPendingVisitorCountsByBranchAndDate = async (
  branchId: string,
  dateKey: string,
): Promise<void> => {
  const counts = await getPendingVisitorCounts();
  const remaining = counts.filter((count) => {
    if (count.branch_id !== branchId) return true;
    return toLocalDateKey(count.timestamp) !== dateKey;
  });
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_VISITOR_COUNTS, JSON.stringify(remaining));
};

export const saveVisitorGroups = async (branchId: string, groups: VisitorCounterGroup[]): Promise<void> => {
  await AsyncStorage.setItem(`${VISITOR_GROUPS_KEY_PREFIX}/${branchId}`, JSON.stringify(groups));
};

export const getVisitorGroups = async (branchId: string): Promise<VisitorCounterGroup[]> => {
  const data = await AsyncStorage.getItem(`${VISITOR_GROUPS_KEY_PREFIX}/${branchId}`);
  return data ? JSON.parse(data) : [];
};

export const savePrepIngredients = async (branchId: string, ingredients: PrepIngredient[]): Promise<void> => {
  await AsyncStorage.setItem(`${PREP_INGREDIENTS_KEY_PREFIX}/${branchId}`, JSON.stringify(ingredients));
};

export const getPrepIngredients = async (branchId: string): Promise<PrepIngredient[]> => {
  const data = await AsyncStorage.getItem(`${PREP_INGREDIENTS_KEY_PREFIX}/${branchId}`);
  return data ? JSON.parse(data) : [];
};

export const saveBreakevenDraft = async (branchId: string, draft: BreakevenDraft): Promise<void> => {
  await AsyncStorage.setItem(`${BREAKEVEN_DRAFT_KEY_PREFIX}/${branchId}`, JSON.stringify(draft));
};

export const getBreakevenDraft = async (branchId: string): Promise<BreakevenDraft | null> => {
  const data = await AsyncStorage.getItem(`${BREAKEVEN_DRAFT_KEY_PREFIX}/${branchId}`);
  return data ? JSON.parse(data) : null;
};

// Store settings storage
export const saveStoreSettings = async (settings: StoreSettings): Promise<void> => {
  setSyncEnabled(settings.sync_enabled ?? true);
  await AsyncStorage.setItem(STORAGE_KEYS.STORE_SETTINGS, JSON.stringify(settings));
};

const DEFAULT_PAYMENT_METHODS = { cash: true, cashless: true, voucher: true };

export const getStoreSettings = async (): Promise<StoreSettings> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.STORE_SETTINGS);
  if (data) {
    const parsed = JSON.parse(data);
    const syncEnabled = parsed.sync_enabled ?? true;
    setSyncEnabled(syncEnabled);
    return {
      payment_mode: parsed.payment_mode ?? 'cashless',
      payment_methods: { ...DEFAULT_PAYMENT_METHODS, ...parsed.payment_methods },
      cashless_label: String(parsed.cashless_label ?? 'PayPay').trim() || 'PayPay',
      order_board_enabled: parsed.order_board_enabled ?? false,
      sub_screen_mode: parsed.sub_screen_mode ?? false,
      sync_enabled: syncEnabled,
    };
  }
  setSyncEnabled(true);
  return {
    payment_mode: 'cashless',
    payment_methods: DEFAULT_PAYMENT_METHODS,
    cashless_label: 'PayPay',
    order_board_enabled: false,
    sub_screen_mode: false,
    sync_enabled: true,
  };
};

// Order counter storage (sequential order numbers 01-99, resets daily, per branch)
export const getNextOrderNumber = async (branchId?: string): Promise<number> => {
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  const scopedKey = branchId ? `${ORDER_COUNTER_KEY_PREFIX}/${branchId}` : STORAGE_KEYS.ORDER_COUNTER;
  const data = await AsyncStorage.getItem(scopedKey);
  let counter = 1;

  if (data) {
    const parsed = JSON.parse(data) as { date: string; counter: number };
    if (parsed.date === today) {
      counter = parsed.counter + 1;
      if (counter > 99) counter = 1;
    }
  }

  await AsyncStorage.setItem(scopedKey, JSON.stringify({ date: today, counter }));
  return counter;
};

// Clear all data
export const clearAllData = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.BRANCH,
    STORAGE_KEYS.MENUS,
    STORAGE_KEYS.PENDING_TRANSACTIONS,
    STORAGE_KEYS.PENDING_VISITOR_COUNTS,
    STORAGE_KEYS.LAST_SYNC_TIME,
    STORAGE_KEYS.HQ_AUTH,
    STORAGE_KEYS.STORE_SETTINGS,
    STORAGE_KEYS.ORDER_COUNTER,
  ]);
  const allKeys = await AsyncStorage.getAllKeys();
  const recorderKeys = allKeys.filter((key) => key.startsWith(`${EXPENSE_RECORDER_KEY_PREFIX}/`));
  if (recorderKeys.length > 0) {
    await AsyncStorage.multiRemove(recorderKeys);
  }
  const prepIngredientKeys = allKeys.filter((key) => key.startsWith(`${PREP_INGREDIENTS_KEY_PREFIX}/`));
  if (prepIngredientKeys.length > 0) {
    await AsyncStorage.multiRemove(prepIngredientKeys);
  }
  const recorderProfileKeys = allKeys.filter((key) => key.startsWith(`${BRANCH_RECORDERS_KEY_PREFIX}/`));
  if (recorderProfileKeys.length > 0) {
    await AsyncStorage.multiRemove(recorderProfileKeys);
  }
  const recorderLogKeys = allKeys.filter((key) => key.startsWith(`${RECORDER_ACCESS_LOGS_KEY_PREFIX}/`));
  if (recorderLogKeys.length > 0) {
    await AsyncStorage.multiRemove(recorderLogKeys);
  }
  const recorderConfigKeys = allKeys.filter((key) => key.startsWith(`${RECORDER_CONFIG_KEY_PREFIX}/`));
  if (recorderConfigKeys.length > 0) {
    await AsyncStorage.multiRemove(recorderConfigKeys);
  }
};

// Budget settings storage
export const saveBudgetSettings = async (settings: BudgetSettings): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.BUDGET_SETTINGS, JSON.stringify(settings));
};

export const getBudgetSettings = async (branchId: string): Promise<BudgetSettings> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.BUDGET_SETTINGS);
  if (data) {
    const parsed = JSON.parse(data) as BudgetSettings;
    if (parsed.branch_id === branchId) return parsed;
  }
  return { branch_id: branchId, initial_budget: 0, target_sales: 0 };
};

// Budget expenses storage
export const saveBudgetExpenses = async (expenses: BudgetExpense[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.BUDGET_EXPENSES, JSON.stringify(expenses));
};

export const saveBudgetExpense = async (expense: BudgetExpense): Promise<void> => {
  const expenses = await getBudgetExpenses();
  expenses.push(expense);
  await saveBudgetExpenses(expenses);
};

export const getBudgetExpenses = async (): Promise<BudgetExpense[]> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.BUDGET_EXPENSES);
  if (!data) return [];
  const parsed = JSON.parse(data) as BudgetExpense[];
  return parsed.map((expense) => {
    const legacyPaymentMethod = (expense as unknown as { payment_method?: string }).payment_method;
    return {
      ...expense,
      payment_method:
        legacyPaymentMethod === 'paypay'
          ? 'cashless'
          : legacyPaymentMethod === 'amazon'
            ? 'bank_transfer'
            : legacyPaymentMethod === 'online'
              ? 'bank_transfer'
            : expense.payment_method,
      recorded_by: expense.recorded_by ?? '',
      is_reimbursed: (expense as unknown as { is_reimbursed?: boolean }).is_reimbursed ?? false,
    };
  });
};

export const deleteBudgetExpense = async (expenseId: string): Promise<void> => {
  const expenses = await getBudgetExpenses();
  const filtered = expenses.filter((e) => e.id !== expenseId);
  await saveBudgetExpenses(filtered);
};

export const saveDefaultExpenseRecorder = async (
  branchId: string,
  recorderName: string,
): Promise<void> => {
  await AsyncStorage.setItem(`${EXPENSE_RECORDER_KEY_PREFIX}/${branchId}`, recorderName);
};

export const getDefaultExpenseRecorder = async (branchId: string): Promise<string> => {
  const data = await AsyncStorage.getItem(`${EXPENSE_RECORDER_KEY_PREFIX}/${branchId}`);
  return data ?? '';
};

export const saveBranchRecorders = async (branchId: string, recorders: BranchRecorder[]): Promise<void> => {
  await AsyncStorage.setItem(`${BRANCH_RECORDERS_KEY_PREFIX}/${branchId}`, JSON.stringify(recorders));
};

export const getBranchRecorders = async (branchId: string): Promise<BranchRecorder[]> => {
  const data = await AsyncStorage.getItem(`${BRANCH_RECORDERS_KEY_PREFIX}/${branchId}`);
  return data ? (JSON.parse(data) as BranchRecorder[]) : [];
};

export const saveRecorderAccessLogs = async (branchId: string, logs: RecorderAccessLog[]): Promise<void> => {
  await AsyncStorage.setItem(`${RECORDER_ACCESS_LOGS_KEY_PREFIX}/${branchId}`, JSON.stringify(logs));
};

export const getRecorderAccessLogs = async (branchId: string): Promise<RecorderAccessLog[]> => {
  const data = await AsyncStorage.getItem(`${RECORDER_ACCESS_LOGS_KEY_PREFIX}/${branchId}`);
  return data ? (JSON.parse(data) as RecorderAccessLog[]) : [];
};

export const saveBranchRecorderConfig = async (
  branchId: string,
  config: BranchRecorderConfig,
): Promise<void> => {
  await AsyncStorage.setItem(`${RECORDER_CONFIG_KEY_PREFIX}/${branchId}`, JSON.stringify(config));
};

export const getBranchRecorderConfig = async (branchId: string): Promise<BranchRecorderConfig> => {
  const data = await AsyncStorage.getItem(`${RECORDER_CONFIG_KEY_PREFIX}/${branchId}`);
  if (!data) {
    return {
      branch_id: branchId,
      registration_mode: 'open',
      updated_at: new Date().toISOString(),
    };
  }
  const parsed = JSON.parse(data) as Partial<BranchRecorderConfig>;
  return {
    branch_id: branchId,
    registration_mode: parsed.registration_mode === 'open' ? 'open' : 'restricted',
    updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : new Date().toISOString(),
  };
};

export const getOrCreateDeviceId = async (): Promise<string> => {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
};

// Admin password storage
const DEFAULT_ADMIN_PASSWORD = '0000';

export const getAdminPassword = async (): Promise<string> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_PASSWORD);
  return data ?? DEFAULT_ADMIN_PASSWORD;
};

export const saveAdminPassword = async (password: string): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_PASSWORD, password);
};

export const verifyAdminPassword = async (input: string): Promise<boolean> => {
  const stored = await getAdminPassword();
  return input === stored;
};

// Clear all pending transactions for a branch
export const clearAllPendingTransactions = async (branchId: string): Promise<void> => {
  const transactions = await getPendingTransactions();
  const remaining = transactions.filter((t) => t.branch_id !== branchId);
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_TRANSACTIONS, JSON.stringify(remaining));
};

// Restriction settings storage
const DEFAULT_RESTRICTIONS: RestrictionSettings = {
  menu_add: false,
  menu_edit: false,
  menu_delete: false,
  sales_cancel: false,
  sales_history: false,
  sales_reset: true,
  payment_change: false,
  recorder_manage: false,
  data_manage: false,
  settings_access: false,
};

export const saveRestrictions = async (r: RestrictionSettings): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.RESTRICTIONS, JSON.stringify(r));
};

export const getRestrictions = async (): Promise<RestrictionSettings> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.RESTRICTIONS);
  return data ? { ...DEFAULT_RESTRICTIONS, ...JSON.parse(data) } : DEFAULT_RESTRICTIONS;
};

// Get all local storage data
export const getLocalStorage = async (): Promise<LocalStorage> => {
  const [branch, menus, pending_transactions, last_sync_time] = await Promise.all([
    getBranch(),
    getMenus(),
    getPendingTransactions(),
    getLastSyncTime(),
  ]);

  return {
    branch,
    menus,
    pending_transactions,
    last_sync_time,
  };
};

// 無料→有料移行時に、ローカル保存の branch_id をクラウド側 branch_id に合わせる
export const replaceLocalBranchIdReferences = async (
  oldBranchId: string,
  newBranchId: string,
): Promise<void> => {
  if (!oldBranchId || !newBranchId || oldBranchId === newBranchId) return;

  const [branch, menus, categories, pendingTransactions, pendingVisitorCounts, budgetSettings, budgetExpenses] =
    await Promise.all([
      getBranch(),
      getMenus(),
      getMenuCategories(),
      getPendingTransactions(),
      getPendingVisitorCounts(),
      getBudgetSettings(oldBranchId),
      getBudgetExpenses(),
    ]);

  if (branch && branch.id === oldBranchId) {
    await saveBranch({ ...branch, id: newBranchId });
  }

  await saveMenus(
    menus.map((menu) => (menu.branch_id === oldBranchId ? { ...menu, branch_id: newBranchId } : menu))
  );
  await saveMenuCategories(
    categories.map((category) =>
      category.branch_id === oldBranchId ? { ...category, branch_id: newBranchId } : category
    )
  );
  await savePendingTransactions(
    pendingTransactions.map((tx) => (tx.branch_id === oldBranchId ? { ...tx, branch_id: newBranchId } : tx))
  );
  await savePendingVisitorCounts(
    pendingVisitorCounts.map((count) => (count.branch_id === oldBranchId ? { ...count, branch_id: newBranchId } : count))
  );

  if (budgetSettings.branch_id === oldBranchId) {
    await saveBudgetSettings({ ...budgetSettings, branch_id: newBranchId });
  }
  await saveBudgetExpenses(
    budgetExpenses.map((expense) =>
      expense.branch_id === oldBranchId ? { ...expense, branch_id: newBranchId } : expense
    )
  );

  const [visitorGroups, prepIngredients, defaultExpenseRecorder, recorders, recorderLogs, recorderConfig] =
    await Promise.all([
      getVisitorGroups(oldBranchId),
      getPrepIngredients(oldBranchId),
      getDefaultExpenseRecorder(oldBranchId),
      getBranchRecorders(oldBranchId),
      getRecorderAccessLogs(oldBranchId),
      getBranchRecorderConfig(oldBranchId),
    ]);

  if (visitorGroups.length > 0) {
    await saveVisitorGroups(
      newBranchId,
      visitorGroups.map((g) => ({ ...g, branch_id: newBranchId }))
    );
    await AsyncStorage.removeItem(`${VISITOR_GROUPS_KEY_PREFIX}/${oldBranchId}`);
  }

  if (prepIngredients.length > 0) {
    await savePrepIngredients(
      newBranchId,
      prepIngredients.map((i) => ({ ...i, branch_id: newBranchId }))
    );
    await AsyncStorage.removeItem(`${PREP_INGREDIENTS_KEY_PREFIX}/${oldBranchId}`);
  }

  if (defaultExpenseRecorder) {
    await saveDefaultExpenseRecorder(newBranchId, defaultExpenseRecorder);
    await AsyncStorage.removeItem(`${EXPENSE_RECORDER_KEY_PREFIX}/${oldBranchId}`);
  }

  if (recorders.length > 0) {
    await saveBranchRecorders(newBranchId, recorders.map((r) => ({ ...r, branch_id: newBranchId })));
    await AsyncStorage.removeItem(`${BRANCH_RECORDERS_KEY_PREFIX}/${oldBranchId}`);
  }

  if (recorderLogs.length > 0) {
    await saveRecorderAccessLogs(
      newBranchId,
      recorderLogs.map((log) => ({ ...log, branch_id: newBranchId }))
    );
    await AsyncStorage.removeItem(`${RECORDER_ACCESS_LOGS_KEY_PREFIX}/${oldBranchId}`);
  }

  if (recorderConfig.branch_id === oldBranchId) {
    await saveBranchRecorderConfig(newBranchId, { ...recorderConfig, branch_id: newBranchId });
    await AsyncStorage.removeItem(`${RECORDER_CONFIG_KEY_PREFIX}/${oldBranchId}`);
  }
};
