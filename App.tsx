import { useState, useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

import './global.css';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { DemoProvider } from './contexts/DemoContext';

import { HQLogin, HQDashboard, HQBranchReports, HQPresentation } from './components/hq';
import { BranchLogin, StoreHome, MenuManagement, Register, SalesHistory, OrderBoard, PrepInventory, BudgetManager } from './components/store';
import { useSync } from './hooks/useSync';
import type { Branch } from './types/database';
import { HQHome } from 'components/hq/HQHome';

import { ManualCounterScreen } from 'components/store/sub/VisitorCounter/ManualCounter+Screen';
import { Home } from 'components/Home';
import { BudgetExpenseRecorder } from 'components/store/budget/BudgetExpenseRecorder';
import { isSupabaseConfigured, supabase } from './lib/supabase';

// 新画面
import { Landing } from './components/Landing';
import { AuthSignIn } from './components/auth/AuthSignIn';
import { LoginCodeEntry } from './components/auth/LoginCodeEntry';
import { AccountDashboard } from './components/account/AccountDashboard';
import { PricingScreen } from './components/account/PricingScreen';
import { MyStores } from './components/account/MyStores';
import { DemoBanner, SyncStatusBanner } from './components/common';

type Screen =
  // 新画面
  | 'landing'
  | 'auth_signin'
  | 'login_code_entry'
  | 'account_dashboard'
  | 'pricing'
  | 'my_stores'
  // 既存画面
  | 'home'
  | 'hq_login'
  | 'hq_home'
  | 'hq_dashboard'
  | 'hq_branch_info'
  | 'hq_presentation'
  | 'store_login'
  | 'store_home'
  | 'store_menus'
  | 'store_register'
  | 'store_history'
  | 'store_counter'
  | 'store_order_board'
  | 'store_prep'
  | 'store_budget'
  | 'store_budget_expense'
  | 'store_budget_breakeven';

function AppContent() {
  const { authState, enterDemo, refreshSubscription } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('landing');
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [hqBranchInfoReturnScreen, setHqBranchInfoReturnScreen] = useState<'hq_home' | 'hq_dashboard'>('hq_home');
  const [hqBranchInfoFocusBranchId, setHqBranchInfoFocusBranchId] = useState<string | null>(null);
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);

  // Initialize sync
  useSync();

  const isUuid = useCallback(
    (value: string): boolean =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    [],
  );

  const resolveBranchForStore = useCallback(
    async (branch: Branch): Promise<Branch | null> => {
      if (!isSupabaseConfigured() || isUuid(branch.id)) return branch;

      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('branch_code', branch.branch_code)
        .maybeSingle();

      if (error || !data) {
        console.error('Failed to resolve branch id from branch_code:', error ?? 'not found');
        return null;
      }

      return data;
    },
    [isUuid],
  );

  const handleBranchLogin = useCallback(async (branch: Branch) => {
    const resolved = await resolveBranchForStore(branch);
    if (!resolved) {
      setCurrentBranch(null);
      setCurrentScreen('store_login');
      return;
    }
    setCurrentBranch(resolved);
    setCurrentScreen('store_home');
  }, [resolveBranchForStore]);

  const handleBranchLogout = useCallback(() => {
    setCurrentBranch(null);
    if (authState.status === 'authenticated') {
      setCurrentScreen('account_dashboard');
    } else if (authState.status === 'demo') {
      setCurrentScreen('landing');
    } else if (authState.status === 'login_code') {
      setCurrentScreen('landing');
    } else {
      setCurrentScreen('landing');
    }
  }, [authState.status]);

  // render中のsetStateを避け、遷移はeffectで行う
  useEffect(() => {
    const resolveLoginCodeBranch = async () => {
      if (
        authState.status !== 'login_code' ||
        (currentScreen !== 'landing' && currentScreen !== 'login_code_entry')
      ) {
        return;
      }
      const resolved = await resolveBranchForStore(authState.branch);
      if (!resolved) return;
      setCurrentBranch(resolved);
      setCurrentScreen('store_home');
    };

    if (authState.status === 'authenticated') {
      if (currentScreen === 'landing' || currentScreen === 'auth_signin') {
        setCurrentScreen('account_dashboard');
      }
    }
    resolveLoginCodeBranch();
  }, [authState, currentScreen, resolveBranchForStore]);

  // Stripe Checkout 完了後のリトライ付きサブスクリプション更新
  const handleCheckoutSuccess = useCallback(async () => {
    setCheckoutProcessing(true);
    try {
      const maxRetries = 5;
      const baseDelay = 1500;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const sub = await refreshSubscription();
        if (sub && sub.plan_type !== 'free') break;
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        }
      }
      setCurrentScreen('my_stores');
    } finally {
      setCheckoutProcessing(false);
    }
  }, [refreshSubscription]);

  // ?checkout=success URL パラメータ検出
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (authState.status !== 'authenticated') return;

    const params = new URLSearchParams(window.location.search);
    const checkoutResult = params.get('checkout');
    if (checkoutResult === 'success') {
      // URL をクリーンアップして再トリガーを防止
      window.history.replaceState({}, '', window.location.origin + window.location.pathname);
      handleCheckoutSuccess();
    }
  }, [authState.status, handleCheckoutSuccess]);

  // ローディング中
  if (authState.status === 'loading') {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  // Checkout処理中
  if (checkoutProcessing) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#22c55e" />
        <Text className="mt-4 text-gray-600">プランを更新しています...</Text>
      </View>
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      // ===== 新画面 =====
      case 'landing':
        return (
          <Landing
            onNavigateToDemo={() => {
              enterDemo();
              setCurrentScreen('home');
            }}
            onNavigateToAuth={() => setCurrentScreen('auth_signin')}
            onNavigateToLoginCode={() => setCurrentScreen('login_code_entry')}
          />
        );

      case 'auth_signin':
        return (
          <AuthSignIn
            onBack={() => setCurrentScreen('landing')}
          />
        );

      case 'login_code_entry':
        return (
          <LoginCodeEntry
            onBack={() => setCurrentScreen('landing')}
          />
        );

      case 'account_dashboard':
        return (
          <AccountDashboard
            onNavigateToStore={() => setCurrentScreen('store_login')}
            onNavigateToHQ={() => setCurrentScreen('hq_home')}
            onNavigateToPricing={() => setCurrentScreen('pricing')}
            onNavigateToMyStores={() => setCurrentScreen('my_stores')}
            onLogout={() => setCurrentScreen('landing')}
          />
        );

      case 'pricing':
        return (
          <PricingScreen
            onBack={() => setCurrentScreen('account_dashboard')}
          />
        );

      case 'my_stores':
        return (
          <MyStores
            onBack={() => setCurrentScreen('account_dashboard')}
            onEnterStore={handleBranchLogin}
          />
        );

      // ===== 既存: Home画面 (デモモード用にも使用) =====
      case 'home':
        return (
          <>
            <DemoBanner />
            <Home
              onNavigateToStore={() => setCurrentScreen('store_login')}
              onNavigateToHQ={() => setCurrentScreen('hq_login')}
            />
          </>
        );

      // ===== 既存: HQ画面 =====
      case 'hq_login':
        return (
          <>
            <DemoBanner />
            <HQLogin
              onLoginSuccess={() => setCurrentScreen('hq_home')}
              onBackToHome={() => {
                if (authState.status === 'authenticated') {
                  setCurrentScreen('account_dashboard');
                } else if (authState.status === 'demo') {
                  setCurrentScreen('home');
                } else {
                  setCurrentScreen('landing');
                }
              }}
            />
          </>
        );

      case 'hq_home':
        return(
          <>
            <DemoBanner />
            <HQHome
              onNavigateSales={() => setCurrentScreen('hq_dashboard')}
              onNavigateBranchInfo={() => {
                setHqBranchInfoReturnScreen('hq_home');
                setHqBranchInfoFocusBranchId(null);
                setCurrentScreen('hq_branch_info');
              }}
              onNavigatePresentation={() => setCurrentScreen('hq_presentation')}
              onLogout={() => {
                if (authState.status === 'authenticated') {
                  setCurrentScreen('account_dashboard');
                } else {
                  setCurrentScreen('landing');
                }
              }}
            />
          </>
        );

      case 'hq_dashboard':
        return (
          <>
            <DemoBanner />
            <HQDashboard
              onNavigateToBranchInfo={(branchId?: string) => {
                setHqBranchInfoReturnScreen('hq_dashboard');
                setHqBranchInfoFocusBranchId(branchId ?? null);
                setCurrentScreen('hq_branch_info');
              }}
              onBack={() => setCurrentScreen('hq_home')}
            />
          </>
        );

      case 'hq_branch_info':
        return (
          <>
            <DemoBanner />
            <HQBranchReports
              focusBranchId={hqBranchInfoFocusBranchId}
              onBack={() => setCurrentScreen(hqBranchInfoReturnScreen)}
            />
          </>
        );

      case 'hq_presentation':
        return (
          <>
            <DemoBanner />
            <HQPresentation
              onBack={() => setCurrentScreen('hq_home')}
            />
          </>
        );

      // ===== 既存: Store画面 =====
      case 'store_login':
        return (
          <>
            <DemoBanner />
            <BranchLogin
              onLoginSuccess={handleBranchLogin}
              onBackToHome={() => {
                if (authState.status === 'authenticated') {
                  setCurrentScreen('account_dashboard');
                } else if (authState.status === 'demo') {
                  setCurrentScreen('home');
                } else {
                  setCurrentScreen('landing');
                }
              }}
            />
          </>
        );

      case 'store_home':
        if (!currentBranch) {
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} />
            <StoreHome
              branch={currentBranch}
              onNavigateToRegister={() => setCurrentScreen('store_register')}
              onNavigateToMenus={() => setCurrentScreen('store_menus')}
              onNavigateToHistory={() => setCurrentScreen('store_history')}
              onNavigateToCounter={() => setCurrentScreen('store_counter')}
              onNavigateToOrderBoard={() => setCurrentScreen('store_order_board')}
              onNavigateToPrep={() => setCurrentScreen('store_prep')}
              onNavigateToBudget={() => setCurrentScreen('store_budget')}
              onNavigateToBudgetExpense={() => setCurrentScreen('store_budget_expense')}
              onNavigateToBudgetBreakeven={() => setCurrentScreen('store_budget_breakeven')}
              onBranchUpdated={(updatedBranch) => setCurrentBranch(updatedBranch)}
              onLogout={handleBranchLogout}
            />
          </>
        );

      case 'store_menus':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} />
            <MenuManagement
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_register':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} />
            <Register
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
              onNavigateToHistory={() => setCurrentScreen('store_history')}
              onNavigateToMenus={()=>setCurrentScreen("store_menus")}
            />
          </>
        );

      case 'store_history':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} />
            <SalesHistory
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_counter':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} />
            <ManualCounterScreen
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_order_board':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} />
            <OrderBoard
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_prep':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} />
            <PrepInventory
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_budget':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} />
            <BudgetManager
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_budget_expense':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} />
            <BudgetExpenseRecorder
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_budget_breakeven':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} />
            <BudgetManager
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
              mode="breakeven"
            />
          </>
        );

      default:
        return (
          <Landing
            onNavigateToDemo={() => setCurrentScreen('home')}
            onNavigateToAuth={() => setCurrentScreen('auth_signin')}
            onNavigateToLoginCode={() => setCurrentScreen('login_code_entry')}
          />
        );
    }
  };

  return (
    <>
      {renderScreen()}
      <StatusBar style="auto" />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <DemoProvider>
            <AppContent />
          </DemoProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
