import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Branch, Menu, PendingTransaction, LocalStorage } from '../types/database';

const STORAGE_KEYS = {
  BRANCH: '@festival_pos/branch',
  MENUS: '@festival_pos/menus',
  PENDING_TRANSACTIONS: '@festival_pos/pending_transactions',
  LAST_SYNC_TIME: '@festival_pos/last_sync_time',
  HQ_AUTH: '@festival_pos/hq_auth',
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

// Clear all data
export const clearAllData = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.BRANCH,
    STORAGE_KEYS.MENUS,
    STORAGE_KEYS.PENDING_TRANSACTIONS,
    STORAGE_KEYS.LAST_SYNC_TIME,
    STORAGE_KEYS.HQ_AUTH,
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
