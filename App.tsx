import { useState, useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, Modal as RNModal, Platform, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

import './global.css';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { DemoProvider } from './contexts/DemoContext';

import { HQDashboard, HQBranchReports } from './components/hq';
import { BranchLogin, StoreHome, MenuManagement, Register, SalesHistory, OrderBoard, MobileOrderDashboard, PrepInventory, BudgetManager } from './components/store';
import { useSync } from './hooks/useSync';
import type { Branch, BudgetExpense, Menu, MenuCategory, PrepIngredient } from './types/database';
import {
  getBranch as getLocalBranch,
  getBudgetExpenses,
  getMenuCategories,
  getMenus,
  getPrepIngredients,
  replaceLocalBranchIdReferences,
} from './lib/storage';
import { HQHome } from 'components/hq/HQHome';

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
import { DEMO_BRANCHES } from './data/demoData';
import { MobileOrderClient } from './components/customer/MobileOrderClient';

type Screen =
  // 新画面
  | 'landing'
  | 'auth_signin'
  | 'login_code_entry'
  | 'login_code_loading'
  | 'account_dashboard'
  | 'pricing'
  | 'my_stores'
  | 'mobile_order_client'
  // 既存画面
  | 'home'
  | 'hq_home'
  | 'hq_dashboard'
  | 'hq_branch_info'
  | 'store_login'
  | 'store_home'
  | 'store_menus'
  | 'store_register'
  | 'store_history'
  | 'store_order_board'
  | 'store_mobile_order'
  | 'store_prep'
  | 'store_budget'
  | 'store_budget_expense';

function AppContent() {
  const { authState, enterDemo, exitDemo, hasDemoReturnTarget, refreshSubscription } = useAuth();

  const [currentScreen, setCurrentScreen] = useState<Screen>(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mobile_order') === '1' && params.get('branch')) {
        return 'mobile_order_client';
      }
      if (params.get('login_code')) {
        return 'login_code_entry';
      }
    }
    return 'landing';
  });
  const [mobileOrderBranchId] = useState<string | null>(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('branch');
  });
  const [prefillLoginCode] = useState<string | null>(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('login_code');
  });
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [hqBranchInfoReturnScreen, setHqBranchInfoReturnScreen] = useState<'hq_home' | 'hq_dashboard'>('hq_home');
  const [hqBranchInfoFocusBranchId, setHqBranchInfoFocusBranchId] = useState<string | null>(null);
  const [myStoresReturnScreen, setMyStoresReturnScreen] = useState<'account_dashboard' | 'hq_home'>('account_dashboard');
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);
  const [demoReturnScreen, setDemoReturnScreen] = useState<Screen | null>(null);

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

    if (authState.status === 'demo') {
      const demoBranch = DEMO_BRANCHES[0] ?? null;
      if (demoBranch) {
        setCurrentBranch(demoBranch);
        setCurrentScreen('store_home');
        return;
      }
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
  }, [syncNow]);

  const handleBranchLogout = useCallback(() => {
    if (authState.status === 'authenticated') {
      setCurrentBranch(null);
      setCurrentScreen('account_dashboard');
    } else if (authState.status === 'demo') {
      if (hasDemoReturnTarget && demoReturnScreen) {
        exitDemo();
        setCurrentBranch(null);
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

              // 未同期売上データは既存同期ロジックへ渡す
              await syncNow();
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
  }, [authState, refreshSubscription, syncNow]);

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
      case 'mobile_order_client':
        if (!mobileOrderBranchId) {
          return (
            <View className="flex-1 justify-center items-center bg-white">
              <Text className="text-gray-600">無効なモバイルオーダーURLです</Text>
            </View>
          );
        }
        return <MobileOrderClient branchId={mobileOrderBranchId} />;

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
            initialCode={prefillLoginCode}
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
              onNavigateToHQ={() => setCurrentScreen('hq_home')}
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
              onNavigateToOrderBoard={() => setCurrentScreen('store_order_board')}
              onNavigateToMobileOrder={() => setCurrentScreen('store_mobile_order')}
              onNavigateToPrep={() => setCurrentScreen('store_prep')}
              onNavigateToBudget={() => setCurrentScreen('store_budget')}
              onNavigateToBudgetExpense={() => setCurrentScreen('store_budget_expense')}
              onNavigateToPricing={() => setCurrentScreen('pricing')}
              onNavigateToDemoHome={() => {
                setDemoReturnScreen('store_home');
                enterDemo();
                setCurrentScreen('home');
              }}
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

      case 'store_mobile_order':
        if (!currentBranch) {
          navigateToStoreEntry();
          return null;
        }
        return (
          <>
            <DemoBanner />
            <SyncStatusBanner branchId={currentBranch.id} onSyncNow={handleManualSyncFromBanner} />
            <MobileOrderDashboard
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
