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

export interface BreakevenDraft {
  product_name: string;
  selling_price: string;
  variable_cost: string;
  fixed_cost: string;
  sim_quantity: string;
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

const DEFAULT_PAYMENT_METHODS = { cash: false, cashless: true, voucher: true };

export const getStoreSettings = async (): Promise<StoreSettings> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.STORE_SETTINGS);
  if (data) {
    const parsed = JSON.parse(data);
    const syncEnabled = parsed.sync_enabled ?? true;
    setSyncEnabled(syncEnabled);
    return {
      payment_mode: parsed.payment_mode ?? 'cashless',
      payment_methods: { ...DEFAULT_PAYMENT_METHODS, ...parsed.payment_methods },
      order_board_enabled: parsed.order_board_enabled ?? false,
      sub_screen_mode: parsed.sub_screen_mode ?? false,
      sync_enabled: syncEnabled,
    };
  }
  setSyncEnabled(true);
  return {
    payment_mode: 'cashless',
    payment_methods: DEFAULT_PAYMENT_METHODS,
    order_board_enabled: false,
    sub_screen_mode: false,
    sync_enabled: true,
  };
};

// Order counter storage (sequential order numbers 01-99, resets daily)
export const getNextOrderNumber = async (): Promise<number> => {
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  const data = await AsyncStorage.getItem(STORAGE_KEYS.ORDER_COUNTER);
  let counter = 1;

  if (data) {
    const parsed = JSON.parse(data) as { date: string; counter: number };
    if (parsed.date === today) {
      counter = parsed.counter + 1;
      if (counter > 99) counter = 1;
    }
  }

  await AsyncStorage.setItem(STORAGE_KEYS.ORDER_COUNTER, JSON.stringify({ date: today, counter }));
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
          ? 'online'
          : legacyPaymentMethod === 'amazon'
            ? 'cashless'
            : expense.payment_method,
      recorded_by: expense.recorded_by ?? '',
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
  menu_delete: true,
  sales_cancel: false,
  sales_history: false,
  sales_reset: true,
  payment_change: false,
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
