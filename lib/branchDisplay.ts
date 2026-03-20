import type { Branch } from '../types/database';

const toFallbackOrder = (branchCode?: string | null): number => {
  const raw = String(branchCode ?? '').replace(/\D/g, '');
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 9999;
};

export const getBranchDisplayOrder = (branch: Pick<Branch, 'branch_number' | 'display_order' | 'branch_code'>): number => {
  if (typeof branch.branch_number === 'number' && Number.isFinite(branch.branch_number) && branch.branch_number > 0) {
    return branch.branch_number;
  }
  if (typeof branch.display_order === 'number' && Number.isFinite(branch.display_order) && branch.display_order > 0) {
    return branch.display_order;
  }
  return toFallbackOrder(branch.branch_code);
};

export const formatBranchDisplayCode = (branch: Pick<Branch, 'branch_number' | 'display_order' | 'branch_code'>): string => {
  return `店舗${String(getBranchDisplayOrder(branch)).padStart(2, '0')}`;
};

export const formatBranchDisplayTitle = (
  branch: Pick<Branch, 'branch_number' | 'display_order' | 'branch_code' | 'branch_name'>
): string => {
  return `${formatBranchDisplayCode(branch)} - ${branch.branch_name}`;
};

export const compareBranchesByDisplayOrder = (
  a: Pick<Branch, 'branch_number' | 'display_order' | 'branch_code' | 'created_at'>,
  b: Pick<Branch, 'branch_number' | 'display_order' | 'branch_code' | 'created_at'>,
): number => {
  const orderDiff = getBranchDisplayOrder(a) - getBranchDisplayOrder(b);
  if (orderDiff !== 0) return orderDiff;
  const codeDiff = String(a.branch_code ?? '').localeCompare(String(b.branch_code ?? ''));
  if (codeDiff !== 0) return codeDiff;
  return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
};

export const sortBranchesByDisplayOrder = <
  T extends Pick<Branch, 'branch_number' | 'display_order' | 'branch_code' | 'created_at'>
>(
  branches: T[],
): T[] => [...branches].sort(compareBranchesByDisplayOrder);

export const normalizeBranchDisplayOrders = <
  T extends Pick<Branch, 'branch_number' | 'display_order' | 'branch_code' | 'created_at'>
>(
  branches: T[],
): T[] =>
  sortBranchesByDisplayOrder(branches).map((branch, index) => ({
    ...branch,
    branch_number: index + 1,
    display_order: index + 1,
  }));

export const assignBranchNumbersInCurrentOrder = <
  T extends Pick<Branch, 'branch_number' | 'display_order' | 'branch_code' | 'created_at'>
>(
  branches: T[],
): T[] =>
  branches.map((branch, index) => ({
    ...branch,
    branch_number: index + 1,
    display_order: index + 1,
  }));
