import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import {
  DEMO_BRANCHES,
  DEMO_MENUS,
  DEMO_MENU_CATEGORIES,
  DEMO_TRANSACTIONS,
  DEMO_VISITOR_COUNTS,
  DEMO_BUDGET_SETTINGS,
  DEMO_BUDGET_EXPENSES,
} from '../data/demoData';
import type {
  Branch,
  Menu,
  MenuCategory,
  PendingTransaction,
  PendingVisitorCount,
  BudgetSettings,
  BudgetExpense,
} from '../types/database';

interface DemoContextValue {
  isDemo: boolean;
  demoBranches: Branch[];
  getDemoMenus: (branchId: string) => Menu[];
  getDemoMenuCategories: (branchId: string) => MenuCategory[];
  getDemoTransactions: (branchId: string) => PendingTransaction[];
  getDemoVisitorCounts: (branchId: string) => PendingVisitorCount[];
  getDemoBudgetSettings: (branchId: string) => BudgetSettings;
  getDemoBudgetExpenses: (branchId: string) => BudgetExpense[];
  addDemoTransaction: (branchId: string, tx: PendingTransaction) => void;
  addDemoVisitorCount: (branchId: string, count: PendingVisitorCount) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export const useDemo = (): DemoContextValue => {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used within DemoProvider');
  return ctx;
};

export const DemoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authState } = useAuth();
  const isDemo = authState.status === 'demo';

  const [extraTransactions, setExtraTransactions] = useState<
    Record<string, PendingTransaction[]>
  >({});
  const [extraVisitorCounts, setExtraVisitorCounts] = useState<
    Record<string, PendingVisitorCount[]>
  >({});

  const getDemoMenus = useCallback((branchId: string): Menu[] => {
    return DEMO_MENUS[branchId] ?? [];
  }, []);

  const getDemoMenuCategories = useCallback((branchId: string): MenuCategory[] => {
    return DEMO_MENU_CATEGORIES[branchId] ?? [];
  }, []);

  const getDemoTransactions = useCallback(
    (branchId: string): PendingTransaction[] => {
      const base = DEMO_TRANSACTIONS[branchId] ?? [];
      const extra = extraTransactions[branchId] ?? [];
      return [...base, ...extra];
    },
    [extraTransactions]
  );

  const getDemoVisitorCounts = useCallback(
    (branchId: string): PendingVisitorCount[] => {
      const base = DEMO_VISITOR_COUNTS[branchId] ?? [];
      const extra = extraVisitorCounts[branchId] ?? [];
      return [...base, ...extra];
    },
    [extraVisitorCounts]
  );

  const getDemoBudgetSettings = useCallback((branchId: string): BudgetSettings => {
    return (
      DEMO_BUDGET_SETTINGS[branchId] ?? {
        branch_id: branchId,
        initial_budget: 0,
        target_sales: 0,
      }
    );
  }, []);

  const getDemoBudgetExpenses = useCallback((branchId: string): BudgetExpense[] => {
    return DEMO_BUDGET_EXPENSES[branchId] ?? [];
  }, []);

  const addDemoTransaction = useCallback(
    (branchId: string, tx: PendingTransaction) => {
      setExtraTransactions((prev) => ({
        ...prev,
        [branchId]: [...(prev[branchId] ?? []), tx],
      }));
    },
    []
  );

  const addDemoVisitorCount = useCallback(
    (branchId: string, count: PendingVisitorCount) => {
      setExtraVisitorCounts((prev) => ({
        ...prev,
        [branchId]: [...(prev[branchId] ?? []), count],
      }));
    },
    []
  );

  const value = useMemo(
    () => ({
      isDemo,
      demoBranches: DEMO_BRANCHES,
      getDemoMenus,
      getDemoMenuCategories,
      getDemoTransactions,
      getDemoVisitorCounts,
      getDemoBudgetSettings,
      getDemoBudgetExpenses,
      addDemoTransaction,
      addDemoVisitorCount,
    }),
    [
      isDemo,
      getDemoMenus,
      getDemoMenuCategories,
      getDemoTransactions,
      getDemoVisitorCounts,
      getDemoBudgetSettings,
      getDemoBudgetExpenses,
      addDemoTransaction,
      addDemoVisitorCount,
    ]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
};
