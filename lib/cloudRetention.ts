import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const LAST_RETENTION_RUN_KEY = '@festival_pos/last_retention_cleanup_at';
const RETENTION_DAYS = 365;
const RETENTION_RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

const getCutoffIso = (): string => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  return cutoff.toISOString();
};

const shouldRunCleanup = async (): Promise<boolean> => {
  const lastRun = await AsyncStorage.getItem(LAST_RETENTION_RUN_KEY);
  if (!lastRun) return true;
  const lastRunMs = new Date(lastRun).getTime();
  if (!Number.isFinite(lastRunMs)) return true;
  return Date.now() - lastRunMs >= RETENTION_RUN_INTERVAL_MS;
};

const saveCleanupRunAt = async (): Promise<void> => {
  await AsyncStorage.setItem(LAST_RETENTION_RUN_KEY, new Date().toISOString());
};

const buildBranchQuery = (userId: string, organizationId?: string | null) => {
  const query = supabase.from('branches').select('id');
  if (organizationId) {
    return query.or(`owner_id.eq.${userId},organization_id.eq.${organizationId}`);
  }
  return query.eq('owner_id', userId);
};

export const runCloudRetentionCleanup = async (
  userId: string,
  organizationId?: string | null,
): Promise<void> => {
  if (!(await shouldRunCleanup())) return;

  const cutoffIso = getCutoffIso();

  try {
    const { data: branches, error: branchError } = await buildBranchQuery(userId, organizationId);
    if (branchError) throw branchError;

    const branchIds = (branches ?? []).map((branch) => branch.id);
    if (branchIds.length === 0) {
      await saveCleanupRunAt();
      return;
    }

    const { data: oldTransactions, error: txFetchError } = await supabase
      .from('transactions')
      .select('id')
      .in('branch_id', branchIds)
      .lt('created_at', cutoffIso);
    if (txFetchError) throw txFetchError;

    const transactionIds = (oldTransactions ?? []).map((tx) => tx.id);
    if (transactionIds.length > 0) {
      const { error: itemDeleteError } = await supabase
        .from('transaction_items')
        .delete()
        .in('transaction_id', transactionIds);
      if (itemDeleteError) throw itemDeleteError;

      const { error: txDeleteError } = await supabase
        .from('transactions')
        .delete()
        .in('id', transactionIds);
      if (txDeleteError) throw txDeleteError;
    }

    const { error: expenseDeleteError } = await supabase
      .from('budget_expenses')
      .delete()
      .in('branch_id', branchIds)
      .lt('created_at', cutoffIso);
    if (expenseDeleteError) throw expenseDeleteError;

    const { data: oldRequests, error: requestFetchError } = await supabase
      .from('mobile_order_requests')
      .select('id')
      .in('branch_id', branchIds)
      .lt('created_at', cutoffIso);
    if (requestFetchError) throw requestFetchError;

    const requestIds = (oldRequests ?? []).map((request) => request.id);
    if (requestIds.length > 0) {
      const { error: requestItemDeleteError } = await supabase
        .from('mobile_order_request_items')
        .delete()
        .in('request_id', requestIds);
      if (requestItemDeleteError) throw requestItemDeleteError;

      const { error: requestDeleteError } = await supabase
        .from('mobile_order_requests')
        .delete()
        .in('id', requestIds);
      if (requestDeleteError) throw requestDeleteError;
    }

    await saveCleanupRunAt();
  } catch (error) {
    console.error('Cloud retention cleanup failed:', error);
  }
};
