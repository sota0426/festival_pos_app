import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Branch, Menu, PendingTransaction, LocalStorage, PendingVisitorCount, StoreSettings, PaymentMode } from '../types/database';

const STORAGE_KEYS = {
  BRANCH: '@festival_pos/branch',
  MENUS: '@festival_pos/menus',
  PENDING_TRANSACTIONS: '@festival_pos/pending_transactions',
  PENDING_VISITOR_COUNTS: '@festival_pos/pending_visitor_counts',
  LAST_SYNC_TIME: '@festival_pos/last_sync_time',
  HQ_AUTH: '@festival_pos/hq_auth',
  STORE_SETTINGS: '@festival_pos/store_settings',
  ORDER_COUNTER: '@festival_pos/order_counter',
};

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

// Store settings storage
export const saveStoreSettings = async (settings: StoreSettings): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.STORE_SETTINGS, JSON.stringify(settings));
};

export const getStoreSettings = async (): Promise<StoreSettings> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.STORE_SETTINGS);
  return data ? { payment_mode: 'cashless', order_board_enabled: false, ...JSON.parse(data) } : { payment_mode: 'cashless', order_board_enabled: false };
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
