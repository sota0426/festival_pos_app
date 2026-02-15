import { useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';

import { HQLogin, HQDashboard, BranchManagement, HQBranchReports, HQPresentation } from './components/hq';
import { BranchLogin, StoreHome, MenuManagement, Register, SalesHistory, OrderBoard, BudgetManager } from './components/store';
import { useSync } from './hooks/useSync';
import type { Branch } from './types/database';
import { HQHome } from 'components/hq/HQHome';
import { hasSupabaseEnvConfigured } from "./lib/supabase"

import { ManualCounterScreen } from 'components/store/sub/VisitorCounter/ManualCounter+Screen';
import { MissingEnvScreen } from 'components/MissingEnvScreen';
import { Home } from 'components/Home';
import { BudgetExpenseRecorder } from 'components/store/budget/BudgetExpenseRecorder';

type Screen =
  | 'home'
  | 'hq_login'
  | 'hq_home'
  | 'hq_dashboard'
  | 'hq_branch_info'
  | 'hq_branches'
  | 'hq_presentation'
  | 'store_login'
  | 'store_home'
  | 'store_menus'
  | 'store_register'
  | 'store_history'
  | 'store_counter'
  | 'store_order_board'
  | 'store_budget'
  | 'store_budget_expense'
  | 'store_budget_breakeven';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [hqBranchInfoReturnScreen, setHqBranchInfoReturnScreen] = useState<'hq_home' | 'hq_dashboard'>('hq_home');
  const [hqBranchInfoFocusBranchId, setHqBranchInfoFocusBranchId] = useState<string | null>(null);

  // Initialize sync
  useSync();

  const handleBranchLogin = useCallback((branch: Branch) => {
    setCurrentBranch(branch);
    setCurrentScreen('store_home');
  }, []);

  const handleBranchLogout = useCallback(() => {
    setCurrentBranch(null);
    setCurrentScreen('home');
  }, []);

  if(!hasSupabaseEnvConfigured()){
    return <MissingEnvScreen />
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return (
          <Home
            onNavigateToStore={() => setCurrentScreen('store_login')}
            onNavigateToHQ={() => setCurrentScreen('hq_login')}
          />
        );

      // HQ Screens
      case 'hq_login':
        return (
          <HQLogin
            onLoginSuccess={() => setCurrentScreen('hq_home')}
            onBackToHome={() => setCurrentScreen('home')}
          />
        );

      case 'hq_home':
        return(
          <HQHome
            onNavigateSales={() => setCurrentScreen('hq_dashboard')}
            onNavigateBranchInfo={() => {
              setHqBranchInfoReturnScreen('hq_home');
              setHqBranchInfoFocusBranchId(null);
              setCurrentScreen('hq_branch_info');
            }}
            onNavigateManagementStore={()=>setCurrentScreen('hq_branches')}
            onNavigatePresentation={() => setCurrentScreen('hq_presentation')}
            onLogout={() => setCurrentScreen('home')}
          />  
        );     

      case 'hq_dashboard':
        return (
          <HQDashboard
            onNavigateToBranches={() => setCurrentScreen('hq_branches')}
            onNavigateToBranchInfo={(branchId?: string) => {
              setHqBranchInfoReturnScreen('hq_dashboard');
              setHqBranchInfoFocusBranchId(branchId ?? null);
              setCurrentScreen('hq_branch_info');
            }}
            onBack={() => setCurrentScreen('hq_home')}
          />
        );

      case 'hq_branch_info':
        return (
          <HQBranchReports
            focusBranchId={hqBranchInfoFocusBranchId}
            onBack={() => setCurrentScreen(hqBranchInfoReturnScreen)}
            onBackToHQ={() => setCurrentScreen('hq_home')}
          />
        );

      case 'hq_branches':
        return (
        <BranchManagement 
          onBack={() => setCurrentScreen('hq_home')} 
        />
        );

      case 'hq_presentation':
        return (
          <HQPresentation
            onBack={() => setCurrentScreen('hq_home')}
          />
        );

      // Store Screens
      case 'store_login':
        return (
          <BranchLogin
            onLoginSuccess={handleBranchLogin}
            onBackToHome={() => setCurrentScreen('home')}
          />
        );

      case 'store_home':
        if (!currentBranch) {
          return null;
        }
        return (
          <StoreHome
            branch={currentBranch}
            onNavigateToRegister={() => setCurrentScreen('store_register')}
            onNavigateToMenus={() => setCurrentScreen('store_menus')}
            onNavigateToHistory={() => setCurrentScreen('store_history')}
            onNavigateToCounter={() => setCurrentScreen('store_counter')}

            onNavigateToOrderBoard={() => setCurrentScreen('store_order_board')}
            onNavigateToBudget={() => setCurrentScreen('store_budget')}
            onNavigateToBudgetExpense={() => setCurrentScreen('store_budget_expense')}
            onNavigateToBudgetBreakeven={() => setCurrentScreen('store_budget_breakeven')}
            onLogout={handleBranchLogout}
          />
        );

      case 'store_menus':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <MenuManagement
            branch={currentBranch}
            onBack={() => setCurrentScreen('store_home')}
          />
        );

      case 'store_register':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <Register
            branch={currentBranch}
            onBack={() => setCurrentScreen('store_home')}
            onNavigateToHistory={() => setCurrentScreen('store_history')}
            onNavigateToMenus={()=>setCurrentScreen("store_menus")}
          />
        );

      case 'store_history':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <SalesHistory
            branch={currentBranch}
            onBack={() => setCurrentScreen('store_home')}
          />
        );

      case 'store_counter':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <ManualCounterScreen
            branch={currentBranch}
            onBack={() => setCurrentScreen('store_home')}
          />
        );

      case 'store_order_board':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <OrderBoard
            branch={currentBranch}
            onBack={() => setCurrentScreen('store_home')}
          />
        );

      case 'store_budget':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <BudgetManager
            branch={currentBranch}
            onBack={() => setCurrentScreen('store_home')}
          />
        );
      case 'store_budget_expense':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <BudgetExpenseRecorder
            branch={currentBranch}
            onBack={() => setCurrentScreen('store_home')}
          />
        );
      case 'store_budget_breakeven':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <BudgetManager
            branch={currentBranch}
            onBack={() => setCurrentScreen('store_home')}
            mode="breakeven"
          />
        );

      default:
        return (
          <Home
            onNavigateToHQ={() => setCurrentScreen('hq_login')}
            onNavigateToStore={() => setCurrentScreen('store_login')}
          />
        );
    }
  };

  return (
    <SafeAreaProvider>
      {renderScreen()}
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
