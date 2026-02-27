import React, { createContext, useContext, useMemo, useEffect, useCallback } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { setSyncEnabled } from '../lib/syncMode';
import type { PlanType, SubscriptionStatus } from '../types/database';

type CheckoutPlan = 'store' | 'org_light' | 'org_standard' | 'org_premium';

const ORG_PLANS: PlanType[] = ['org_light', 'org_standard', 'org_premium', 'organization'];

const getMaxStoresByPlan = (plan: PlanType): number => {
  switch (plan) {
    case 'store':
      return 1;
    case 'org_light':
      return 3;
    case 'org_standard':
      return 10;
    case 'org_premium':
      return 30;
    case 'organization': // legacy
      return 10;
    case 'free':
    default:
      return 1;
  }
};

interface SubscriptionContextValue {
  plan: PlanType;
  status: SubscriptionStatus;
  canSync: boolean;
  canAccessHQ: boolean;
  maxStores: number;
  isFreePlan: boolean;
  isStorePlan: boolean;
  isOrgPlan: boolean;
  openCheckout: (plan: CheckoutPlan) => Promise<void>;
  openPortal: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export const useSubscription = (): SubscriptionContextValue => {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
};

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const { authState } = useAuth();

  const subscription = authState.status === 'authenticated' ? authState.subscription : null;

  const plan: PlanType = subscription?.plan_type ?? 'free';
  const status: SubscriptionStatus = subscription?.status ?? 'active';
  const currentPeriodEndMs = subscription?.current_period_end
    ? new Date(subscription.current_period_end).getTime()
    : null;
  const isExpiredByDate =
    currentPeriodEndMs !== null && Number.isFinite(currentPeriodEndMs)
      ? currentPeriodEndMs <= Date.now()
      : false;
  const isActive = (status === 'active' || status === 'trialing') && !isExpiredByDate;

  const isOrgPlan = ORG_PLANS.includes(plan);
  const canSync = isActive && (plan === 'store' || isOrgPlan);
  const canAccessHQ = isActive && isOrgPlan;
  const maxStores = getMaxStoresByPlan(plan);

  // ログインコードの場合はSync有効、デモモードでは無効
  const isLoginCode = authState.status === 'login_code';
  const isDemo = authState.status === 'demo';

  useEffect(() => {
    if (isDemo) {
      setSyncEnabled(false);
    } else {
      setSyncEnabled(canSync || isLoginCode);
    }
  }, [canSync, isLoginCode, isDemo]);

  const resolveValidAccessToken = useCallback(async (): Promise<string | null> => {
    const isJwt = (token: string | null | undefined): token is string =>
      !!token && token.split('.').length === 3;

    // サーバー側でユーザー取得できる状態を先に作る
    let { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session) return null;
      const retry = await supabase.auth.getUser();
      if (retry.error || !retry.data.user) return null;
    }

    let { data: { session } } = await supabase.auth.getSession();
    if (!isJwt(session?.access_token)) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !isJwt(refreshed.session?.access_token)) return null;
      session = refreshed.session;
    }

    return session.access_token;
  }, []);

  const invokeEdgeFunctionWithAuth = useCallback(
    async (functionName: string, accessToken: string, body?: Record<string, unknown>) => {
      if (!supabaseUrl) {
        throw new Error('Supabase設定が不足しています');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body ?? {}),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
            ? payload.message
            : null) ||
          (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : null) ||
          `HTTP ${response.status}`;
        throw new Error(message);
      }

      return payload as { url?: string } | null;
    },
    [supabaseUrl],
  );

  const openCheckout = useCallback(async (targetPlan: CheckoutPlan) => {
    if (authState.status !== 'authenticated') return;

    try {
      const accessToken = await resolveValidAccessToken();
      if (!accessToken) {
        Alert.alert('エラー', 'セッションが切れました。再度ログインしてください。');
        return;
      }

      const data = await invokeEdgeFunctionWithAuth('create-checkout-session', accessToken, { plan: targetPlan });
      if (data?.url) {
        if (Platform.OS === 'web') {
          window.location.href = data.url;
        } else {
          await Linking.openURL(data.url);
        }
      }
    } catch (e) {
      console.error('Failed to create checkout session:', e);
      Alert.alert(
        'エラー',
        'プラン変更の処理に失敗しました。しばらくしてからもう一度お試しください。'
      );
    }
  }, [authState.status, invokeEdgeFunctionWithAuth, resolveValidAccessToken]);

  const openPortal = useCallback(async () => {
    if (authState.status !== 'authenticated') return;

    try {
      const accessToken = await resolveValidAccessToken();
      if (!accessToken) {
        Alert.alert('エラー', 'セッションが切れました。再度ログインしてください。');
        return;
      }

      const data = await invokeEdgeFunctionWithAuth('create-portal-session', accessToken);
      if (data?.url) {
        if (Platform.OS === 'web') {
          window.location.href = data.url;
        } else {
          await Linking.openURL(data.url);
        }
      }
    } catch (e) {
      console.error('Failed to create portal session:', e);
      Alert.alert(
        'エラー',
        'お支払い管理画面の表示に失敗しました。しばらくしてからもう一度お試しください。'
      );
    }
  }, [authState.status, invokeEdgeFunctionWithAuth, resolveValidAccessToken]);

  const value = useMemo(
    () => ({
      plan,
      status,
      canSync,
      canAccessHQ,
      maxStores,
      isFreePlan: plan === 'free',
      isStorePlan: plan === 'store',
      isOrgPlan,
      openCheckout,
      openPortal,
    }),
    [plan, status, canSync, canAccessHQ, maxStores, isOrgPlan, openCheckout, openPortal]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
