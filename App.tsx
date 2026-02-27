import { useState, useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, Modal as RNModal, Platform, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

import './global.css';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { DemoProvider } from './contexts/DemoContext';

import { HQLogin, HQDashboard, HQBranchReports, HQPresentation } from './components/hq';
import { BranchLogin, StoreHome, MenuManagement, Register, SalesHistory, OrderBoard, PrepInventory, CookingManual, BudgetManager } from './components/store';
import { CustomerOrderScreen } from './components/store/main/CustomerOrderScreen';
import { useSync } from './hooks/useSync';
import type { Branch, BudgetExpense, Menu, MenuCategory, PrepIngredient } from './types/database';
import {
  clearKioskMode,
  getBranch as getLocalBranch,
  getBudgetExpenses,
  getKioskModeSync,
  getMenuCategories,
  getMenus,
  getPrepIngredients,
  replaceLocalBranchIdReferences,
  saveKioskMode,
} from './lib/storage';
import { HQHome } from 'components/hq/HQHome';

import { ManualCounterScreen } from 'components/store/sub/VisitorCounter/ManualCounter+Screen';
import { TaskChecklist } from 'components/store/sub/TaskChecklist';
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
  | 'login_code_loading'
  | 'account_dashboard'
  | 'pricing'
  | 'my_stores'
  // 客向けモバイルオーダー (認証不要・公開)
  | 'customer_order'
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
  | 'store_checklist'
  | 'store_cooking_manual'
  | 'store_budget'
  | 'store_budget_expense'
  | 'store_budget_breakeven';

/** 客向けオーダー画面のパラメータ */
interface CustomerOrderParams {
  branchCode: string;
  tableNumber: string | null;
  deviceName: string | null;
  fromDemoKiosk?: boolean;
}

function AppContent() {
  const { authState, enterDemo, exitDemo, hasDemoReturnTarget, refreshSubscription } = useAuth();

  // 客向けオーダーURL (?branch=S001&table=3) またはキオスクモード復元を
  // 初期レンダリング前に検出する。useState のイニシャライザで行うことで画面フラッシュを防ぐ。
  const [customerOrderParams, setCustomerOrderParams] = useState<CustomerOrderParams | null>(() => {
    if (Platform.OS !== 'web') return null;
    try {
      // 優先1: キオスクモード (タブレット固定モード) の復元
      const kiosk = getKioskModeSync();
      if (kiosk) {
        return {
          branchCode: kiosk.branchCode,
          tableNumber: null,
          deviceName: kiosk.deviceName,
          fromDemoKiosk: !!kiosk.demoMode,
        };
      }
      // 優先2: QRコードURLパラメータ
      const params = new URLSearchParams(window.location.search);
      const branchCode = params.get('branch');
      if (!branchCode) return null;
      return {
        branchCode,
        tableNumber: params.get('table'),
        deviceName: null,
        fromDemoKiosk: false,
      };
    } catch {
      return null;
    }
  });

  const [currentScreen, setCurrentScreen] = useState<Screen>(() => {
    if (Platform.OS !== 'web') return 'landing';
    try {
      // キオスクモード復元: リロード後も customer_order 固定
      const kiosk = getKioskModeSync();
      if (kiosk) return 'customer_order';
      // QRコードURLパラメータ
      const params = new URLSearchParams(window.location.search);
      if (params.get('branch')) return 'customer_order';
    } catch {
      // ignore
    }
    return 'landing';
  });
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [hqBranchInfoReturnScreen, setHqBranchInfoReturnScreen] = useState<'hq_home' | 'hq_dashboard'>('hq_home');
  const [hqBranchInfoFocusBranchId, setHqBranchInfoFocusBranchId] = useState<string | null>(null);
  const [myStoresReturnScreen, setMyStoresReturnScreen] = useState<'account_dashboard' | 'hq_home'>('account_dashboard');
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);
  const [demoReturnScreen, setDemoReturnScreen] = useState<Screen | null>(null);
  const [autoOpenKioskPinSettingsOnStoreHome, setAutoOpenKioskPinSettingsOnStoreHome] = useState(false);
  const allowFreeWebInDev = __DEV__;
  const isWebFreeAuthenticatedPlan =
    Platform.OS === 'web' &&
    authState.status === 'authenticated' &&
    authState.subscription.plan_type === 'free' &&
    !allowFreeWebInDev;

  const handleNavigateToAuthEntry = useCallback(() => {
    if (authState.status === 'authenticated') {
      setCurrentScreen('account_dashboard');
      return;
    }
    setCurrentScreen('auth_signin');
  }, [authState.status]);

  // Initialize sync
  const {
    syncNow,
    syncVisitorNow,
    syncDialog,
    closeSyncDialog,
    handleConfirmSync,
    handleConfirmClearLocal,
  } = useSync();

  useEffect(() => {
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      console.log('[DEBUG] session:', data?.session);
      console.log('[DEBUG] session error:', error);
    };
    void checkSession();
  }, []);

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

  const navigateToStoreEntry = useCallback(async () => {
    if (authState.status === 'authenticated') {
      if (authState.subscription.plan_type === 'free') {
        const { data, error } = await supabase
          .from('branches')
          .select('*')
          .eq('owner_id', authState.user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error || !data) {
          console.error('[App] Failed to resolve free plan branch:', error ?? 'not found');
          setCurrentBranch(null);
          setMyStoresReturnScreen('account_dashboard');
          setCurrentScreen('my_stores');
          return;
        }

        setCurrentBranch(data);
        setCurrentScreen('store_home');
        return;
      }

      setMyStoresReturnScreen('account_dashboard');
      setCurrentScreen('my_stores');
      return;
    }
    setCurrentScreen('store_login');
  }, [authState]);

  const handleBranchLogin = useCallback(async (branch: Branch) => {
    const resolved = await resolveBranchForStore(branch);
    if (!resolved) {
      setCurrentBranch(null);
      navigateToStoreEntry();
      return;
    }
    setCurrentBranch(resolved);
    setCurrentScreen('store_home');
  }, [navigateToStoreEntry, resolveBranchForStore]);

  const handleManualSyncFromBanner = useCallback(async () => {
    await syncNow();
    await syncVisitorNow();
  }, [syncNow, syncVisitorNow]);

  const handleBranchLogout = useCallback(() => {
    if (authState.status === 'authenticated') {
      setCurrentBranch(null);
      setCurrentScreen('account_dashboard');
    } else if (authState.status === 'demo') {
      if (hasDemoReturnTarget && demoReturnScreen) {
        exitDemo();
        setCurrentBranch(null);
        // デモ中の「ログイン画面に戻る」は、安全に復帰できる管理者トップへ戻す
        setCurrentScreen('account_dashboard');
      } else {
        setCurrentBranch(null);
        setCurrentScreen('landing');
      }
    } else if (authState.status === 'login_code') {
      setCurrentBranch(null);
      setCurrentScreen('login_code_loading');
    } else {
      setCurrentBranch(null);
      setCurrentScreen('landing');
    }
  }, [authState.status, demoReturnScreen, exitDemo, hasDemoReturnTarget]);

  // render中のsetStateを避け、遷移はeffectで行う
  useEffect(() => {
    const resolveLoginCodeBranch = async () => {
      if (
        authState.status !== 'login_code' ||
        (currentScreen !== 'landing' &&
          currentScreen !== 'login_code_entry' &&
          currentScreen !== 'login_code_loading')
      ) {
        return;
      }
      const resolved = await resolveBranchForStore(authState.branch);
      if (!resolved) {
        console.error('[App] login_code resolve failed: branch could not be resolved', {
          branchId: authState.branch.id,
          branchCode: authState.branch.branch_code,
        });
        return;
      }
      console.log('[App] login_code resolve success: transitioning to store_home', {
        branchId: resolved.id,
        branchCode: resolved.branch_code,
      });
      setCurrentBranch(resolved);
      setCurrentScreen('store_home');
    };

    if (authState.status === 'authenticated') {
      if (currentScreen === 'landing' || currentScreen === 'auth_signin') {
        setCurrentScreen('account_dashboard');
      }
    }
    if (authState.status === 'unauthenticated') {
      if (currentScreen === 'login_code_loading') {
        setCurrentScreen('landing');
      }
    }
    resolveLoginCodeBranch();
  }, [authState, currentScreen, resolveBranchForStore]);

  useEffect(() => {
    if (!isWebFreeAuthenticatedPlan) return;

    const webRestrictedScreens: Screen[] = [
      'store_login',
      'store_home',
      'store_menus',
      'store_register',
      'store_history',
      'store_counter',
      'store_order_board',
      'store_prep',
      'store_checklist',
      'store_cooking_manual',
      'store_budget',
      'store_budget_expense',
      'store_budget_breakeven',
    ];

    if (webRestrictedScreens.includes(currentScreen)) {
      setCurrentBranch(null);
      setCurrentScreen('pricing');
    }
  }, [currentScreen, isWebFreeAuthenticatedPlan]);

  // Stripe Checkout 完了後のリトライ付きサブスクリプション更新
  const handleCheckoutSuccess = useCallback(async () => {
    setCheckoutProcessing(true);
    try {
      let upgradedSubscription = null as Awaited<ReturnType<typeof refreshSubscription>>;
      const maxRetries = 5;
      const baseDelay = 1500;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const sub = await refreshSubscription();
        upgradedSubscription = sub;
        if (sub && sub.plan_type !== 'free') break;
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        }
      }

      // 無料プランで作成していたローカルデータを、アップグレード後のDB店舗へ移行する
      if (
        authState.status === 'authenticated' &&
        authState.subscription.plan_type === 'free' &&
        upgradedSubscription &&
        upgradedSubscription.plan_type !== 'free'
      ) {
        try {
          const localBranch = await getLocalBranch();
          if (localBranch) {
            const { data: dbBranch } = await supabase
              .from('branches')
              .select('*')
              .eq('owner_id', authState.user.id)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle();

            if (dbBranch) {
              const targetBranchId = dbBranch.id;
              const oldLocalBranchId = localBranch.id;
              if (oldLocalBranchId !== targetBranchId) {
                await replaceLocalBranchIdReferences(oldLocalBranchId, targetBranchId);
              }

              const [localMenus, localCategories, localPrepIngredients, localBudgetExpenses] =
                await Promise.all([
                  getMenus(),
                  getMenuCategories(),
                  getPrepIngredients(targetBranchId),
                  getBudgetExpenses(),
                ]);

              await supabase
                .from('branches')
                .update({
                  branch_name: localBranch.branch_name,
                  password: localBranch.password,
                  sales_target: localBranch.sales_target,
                  status: localBranch.status,
                  owner_id: authState.user.id,
                  organization_id: upgradedSubscription.organization_id ?? null,
                })
                .eq('id', targetBranchId);

              // DB側に残っている初期データを消して、ローカルデータを優先反映
              await supabase.from('menus').delete().eq('branch_id', targetBranchId);
              await supabase.from('menu_categories').delete().eq('branch_id', targetBranchId);

              const categoryRows: MenuCategory[] = localCategories.map((c) => ({
                ...c,
                branch_id: targetBranchId,
              }));
              if (categoryRows.length > 0) {
                const { error: categoryUploadError } = await supabase
                  .from('menu_categories')
                  .insert(categoryRows);
                if (categoryUploadError) {
                  console.error('Upgrade migration: failed to upload menu categories', categoryUploadError);
                }
              }

              const menuRows: Menu[] = localMenus.map((m) => ({
                ...m,
                branch_id: targetBranchId,
              }));
              if (menuRows.length > 0) {
                const { error: menuUploadError } = await supabase.from('menus').insert(menuRows);
                if (menuUploadError) {
                  console.error('Upgrade migration: failed to upload menus', menuUploadError);
                }
              }

              const prepRows: PrepIngredient[] = localPrepIngredients.map((i) => ({
                ...i,
                branch_id: targetBranchId,
              }));
              if (prepRows.length > 0) {
                const { error: prepUploadError } = await supabase
                  .from('prep_ingredients')
                  .upsert(prepRows, { onConflict: 'id' });
                if (prepUploadError) {
                  console.error('Upgrade migration: failed to upload prep ingredients', prepUploadError);
                }
              }

              const budgetRows: BudgetExpense[] = localBudgetExpenses
                .filter((e) => e.branch_id === targetBranchId)
                .map((e) => ({ ...e, synced: true }));
              if (budgetRows.length > 0) {
                const { error: expenseUploadError } = await supabase
                  .from('budget_expenses')
                  .upsert(budgetRows, { onConflict: 'id' });
                if (expenseUploadError) {
                  console.error('Upgrade migration: failed to upload budget expenses', expenseUploadError);
                }
              }

              // 未同期売上・来客データは既存同期ロジックへ渡す
              await syncNow();
              await syncVisitorNow();
            }
          }
        } catch (migrationError) {
          console.error('Upgrade migration failed:', migrationError);
        }
      }

      setMyStoresReturnScreen('account_dashboard');
      setCurrentScreen('my_stores');
    } finally {
      setCheckoutProcessing(false);
    }
  }, [authState, refreshSubscription, syncNow, syncVisitorNow]);

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
      // ===== 客向けモバイルオーダー (認証不要・公開) =====
      case 'customer_order':
        if (!customerOrderParams) {
          // パラメータがない場合は Landing へ
          return (
            <Landing
              onNavigateToDemo={() => { enterDemo(); setCurrentScreen('home'); }}
              onNavigateToAuth={handleNavigateToAuthEntry}
              onNavigateToLoginCode={() => setCurrentScreen('login_code_entry')}
            />
          );
        }
        {
          // キオスクモード (タブレット固定) かどうかを判定:
          //   - deviceName がある → タブレットモード → キオスクモード → onBack を渡さない
          //   - tableNumber がある → QRモード → onBack を渡さない (そもそも戻り先がない)
          //   - 両方 null → 念のため onBack なし
          const isKioskMode = !!customerOrderParams.deviceName || !customerOrderParams.tableNumber;
          const handleExitKioskToAdmin = async () => {
            await clearKioskMode();
            setCustomerOrderParams(null);

            if (currentBranch) {
              setCurrentScreen('store_home');
              return;
            }

            if (authState.status === 'authenticated') {
              setCurrentScreen('account_dashboard');
              return;
            }

            if (authState.status === 'login_code') {
              setCurrentScreen('login_code_loading');
              return;
            }

            if (authState.status === 'demo') {
              setCurrentScreen('home');
              return;
            }

            setCurrentScreen('landing');
          };
          return (
            <CustomerOrderScreen
              branchCode={customerOrderParams.branchCode}
              tableNumber={customerOrderParams.tableNumber}
              deviceName={customerOrderParams.deviceName}
              isKioskMode={isKioskMode}
              onBackBeforeKiosk={() => {
                void clearKioskMode();
                setCustomerOrderParams(null);
                setCurrentScreen('store_home');
              }}
              onOpenKioskPinSettings={() => {
                void clearKioskMode();
                setCustomerOrderParams(null);
                setAutoOpenKioskPinSettingsOnStoreHome(true);
                setCurrentScreen('store_home');
              }}
              onReturnToLoggedInFromDemo={
                (authState.status === 'demo' && hasDemoReturnTarget) ||
                (!!customerOrderParams?.fromDemoKiosk && authState.status === 'authenticated')
                  ? () => {
                      void clearKioskMode();
                      setCustomerOrderParams(null);
                      if (authState.status === 'demo') {
                        exitDemo();
                      }
                      setCurrentScreen('account_dashboard');
                    }
                  : undefined
              }
              isDemoMode={
                authState.status === 'demo' ||
                !!customerOrderParams?.fromDemoKiosk
              }
              onExitKiosk={async () => {
                // キオスクモード解除後、状態に応じて安全な画面へ戻す
                await handleExitKioskToAdmin();
              }}
            />
          );
        }

      // ===== 新画面 =====
      case 'landing':
        return (
          <Landing
            onNavigateToDemo={() => {
              setDemoReturnScreen(null);
              enterDemo();
              setCurrentScreen('home');
            }}
            onNavigateToAuth={handleNavigateToAuthEntry}
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

      case 'login_code_loading':
        return (
          <View className="flex-1 justify-center items-center bg-gray-50">
            <ActivityIndicator size="large" color="#22c55e" />
            <Text className="mt-4 text-gray-600">店舗画面を準備しています...</Text>
          </View>
        );

      case 'account_dashboard':
        return (
          <AccountDashboard
            onNavigateToStore={navigateToStoreEntry}
            onNavigateToHQ={() => setCurrentScreen('hq_home')}
            onNavigateToPricing={() => setCurrentScreen('pricing')}
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
            onBack={() => setCurrentScreen(myStoresReturnScreen)}
            onEnterStore={handleBranchLogin}
          />
        );

      // ===== 既存: Home画面 (デモモード用にも使用) =====
      case 'home':
        return (
          <>
            <DemoBanner />
            <Home
              onNavigateToStore={navigateToStoreEntry}
              onNavigateToHQ={() => setCurrentScreen('hq_login')}
              onReturnToLoggedIn={
                authState.status === 'demo' && hasDemoReturnTarget && demoReturnScreen
                  ? () => {
                      exitDemo();
                      setCurrentScreen(demoReturnScreen);
                    }
                  : undefined
              }
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
              onNavigateMyStores={() => {
                setMyStoresReturnScreen('hq_home');
                setCurrentScreen('my_stores');
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
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
            <StoreHome
              branch={currentBranch}
              onNavigateToRegister={() => setCurrentScreen('store_register')}
              onNavigateToMenus={() => setCurrentScreen('store_menus')}
              onNavigateToHistory={() => setCurrentScreen('store_history')}
              onNavigateToCounter={() => setCurrentScreen('store_counter')}
              onNavigateToOrderBoard={() => setCurrentScreen('store_order_board')}
              onNavigateToPrep={() => setCurrentScreen('store_prep')}
              onNavigateToChecklist={() => setCurrentScreen('store_checklist')}
              onNavigateToCookingManual={() => setCurrentScreen('store_cooking_manual')}
              onNavigateToBudget={() => setCurrentScreen('store_budget')}
              onNavigateToBudgetExpense={() => setCurrentScreen('store_budget_expense')}
              onNavigateToBudgetBreakeven={() => setCurrentScreen('store_budget_breakeven')}
              onNavigateToCustomerOrder={async () => {
                // タブレットモード: キオスクモードを localStorage に保存してから遷移。
                // 端末名は CustomerOrderScreen 内で入力・確定後に上書き保存される。
                const params: CustomerOrderParams = {
                  branchCode: currentBranch.branch_code,
                  tableNumber: null,
                  deviceName: null, // CustomerOrderScreen 内で端末名入力後に確定
                  fromDemoKiosk: authState.status === 'demo',
                };
                setCustomerOrderParams(params);
                setCurrentScreen('customer_order');
                // ※ キオスクモードの localStorage 保存は CustomerOrderScreen 側で
                //   端末名確定後に行う (deviceName が確定してから保存したいため)
              }}
              onNavigateToPricing={() => setCurrentScreen('pricing')}
              onNavigateToDemoHome={() => {
                setDemoReturnScreen('store_home');
                enterDemo();
                setCurrentScreen('home');
              }}
              autoOpenKioskPinSettings={autoOpenKioskPinSettingsOnStoreHome}
              onHandledAutoOpenKioskPinSettings={() => setAutoOpenKioskPinSettingsOnStoreHome(false)}
              onBranchUpdated={(updatedBranch) => setCurrentBranch(updatedBranch)}
              onLogout={handleBranchLogout}
            />
          </>
        );

      case 'store_menus':
        if (!currentBranch) {
          navigateToStoreEntry();
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
            <MenuManagement
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_register':
        if (!currentBranch) {
          navigateToStoreEntry();
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
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
          navigateToStoreEntry();
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
            <SalesHistory
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_counter':
        if (!currentBranch) {
          navigateToStoreEntry();
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
            <ManualCounterScreen
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_order_board':
        if (!currentBranch) {
          navigateToStoreEntry();
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
            <OrderBoard
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_prep':
        if (!currentBranch) {
          navigateToStoreEntry();
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
            <PrepInventory
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_checklist':
        if (!currentBranch) {
          navigateToStoreEntry();
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
            <TaskChecklist
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_cooking_manual':
        if (!currentBranch) {
          navigateToStoreEntry();
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
            <CookingManual
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_budget':
        if (!currentBranch) {
          navigateToStoreEntry();
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
            <BudgetManager
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_budget_expense':
        if (!currentBranch) {
          navigateToStoreEntry();
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
            <BudgetExpenseRecorder
              branch={currentBranch}
              onBack={() => setCurrentScreen('store_home')}
            />
          </>
        );

      case 'store_budget_breakeven':
        if (!currentBranch) {
          navigateToStoreEntry();
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
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

      {/* ── 同期確認ダイアログ ──────────────────────────── */}
      <RNModal
        visible={syncDialog.visible && syncDialog.type === 'confirm_sync'}
        transparent
        animationType="fade"
        onRequestClose={closeSyncDialog}
      >
        <TouchableWithoutFeedback onPress={closeSyncDialog}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 400, padding: 20 }}>
                {/* アイコン + タイトル */}
                <View style={{ alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ fontSize: 32, marginBottom: 6 }}>🔄</Text>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1f2937' }}>未同期データがあります</Text>
                </View>
                <Text style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 4 }}>
                  {syncDialog.pendingCount ? `${syncDialog.pendingCount}件` : ''}のローカルデータがSupabaseと未同期です。
                </Text>
                <Text style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
                  今すぐ同期しますか？
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={closeSyncDialog}
                    style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center' }}
                  >
                    <Text style={{ color: '#374151', fontWeight: '600' }}>後で</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleConfirmSync}
                    style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#3b82f6', alignItems: 'center' }}
                  >
                    <Text style={{ color: 'white', fontWeight: '600' }}>同期する</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>

      {/* ── 同期エラー → ローカル削除確認ダイアログ ──────── */}
      <RNModal
        visible={syncDialog.visible && syncDialog.type === 'sync_error_clear'}
        transparent
        animationType="fade"
        onRequestClose={closeSyncDialog}
      >
        <TouchableWithoutFeedback onPress={closeSyncDialog}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 400, padding: 20 }}>
                {/* アイコン + タイトル */}
                <View style={{ alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ fontSize: 32, marginBottom: 6 }}>⚠️</Text>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#dc2626' }}>同期エラーが発生しました</Text>
                </View>
                {/* エラー詳細 */}
                <View style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                  <Text style={{ color: '#b91c1c', fontSize: 12, lineHeight: 18 }}>
                    {syncDialog.errorMessage}
                  </Text>
                </View>
                <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginBottom: 6 }}>
                  DBリセット後などに古いローカルデータが残っている可能性があります。
                </Text>
                <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 20 }}>
                  ローカルの未同期データを削除しますか？{'\n'}（この操作は取り消せません）
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={closeSyncDialog}
                    style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center' }}
                  >
                    <Text style={{ color: '#374151', fontWeight: '600' }}>キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (syncDialog.branchId) {
                        void handleConfirmClearLocal(syncDialog.branchId);
                      }
                    }}
                    style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center' }}
                  >
                    <Text style={{ color: 'white', fontWeight: '600' }}>削除する</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>
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
