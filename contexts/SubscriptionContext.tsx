import React, { createContext, useContext, useMemo, useEffect, useCallback } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { setSyncEnabled } from '../lib/syncMode';
import type { PlanType, SubscriptionStatus } from '../types/database';

type CheckoutPlan = 'store' | 'org_standard' | 'org_premium';

const ORG_PLANS: PlanType[] = ['org_light', 'org_standard', 'org_premium', 'organization'];
const LAST_PLAN_KEY = '@festival_pos/last_plan_type';

const getPlanRank = (value: PlanType): number => {
  switch (value) {
    case 'free':
      return 0;
    case 'store':
      return 1;
    case 'org_light':
      return 2;
    case 'org_standard':
    case 'organization':
      return 3;
    case 'org_premium':
      return 4;
    default:
      return 0;
  }
};

const getMaxStoresByPlan = (plan: PlanType): number => {
  switch (plan) {
    case 'store':
      return Number.POSITIVE_INFINITY;
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
  const canAccessHQ = isActive && (plan === 'store' || isOrgPlan);
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

  useEffect(() => {
    if (authState.status !== 'authenticated') return;

    const enforceDowngradeInactive = async () => {
      const lastPlanRaw = await AsyncStorage.getItem(LAST_PLAN_KEY);
      const lastPlan = (lastPlanRaw ?? null) as PlanType | null;
      const isDowngraded =
        !!lastPlan &&
        getPlanRank(lastPlan) > getPlanRank(plan);

      if (isDowngraded) {
        const { error } = await supabase
          .from('branches')
          .update({ status: 'inactive' })
          .eq('owner_id', authState.user.id);
        if (error) {
          console.error('Failed to set all branches inactive on downgrade:', error);
        }
      }

      await AsyncStorage.setItem(LAST_PLAN_KEY, plan);
    };

    void enforceDowngradeInactive();
  }, [authState, plan]);

  const resolveValidAccessToken = useCallback(async (): Promise<string | null> => {
    const isJwt = (token: string | null | undefined): token is string =>
      !!token && token.split('.').length === 3;

    const isTokenUsable = async (token: string | null | undefined): Promise<boolean> => {
      if (!isJwt(token)) return false;
      const { data, error } = await supabase.auth.getUser(token);
      return !error && !!data.user;
    };

    let { data: { session } } = await supabase.auth.getSession();
    if (await isTokenUsable(session?.access_token)) {
      return session!.access_token;
    }

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !isJwt(refreshed.session?.access_token)) return null;
    if (!(await isTokenUsable(refreshed.session.access_token))) return null;
    return refreshed.session.access_token;
  }, []);

  const invokeEdgeFunctionWithAuth = useCallback(
    async (functionName: string, accessToken: string, body?: Record<string, unknown>) => {
      const toDetailedError = async (error: unknown): Promise<Error> => {
        if (!error || typeof error !== 'object') {
          return new Error(String(error));
        }

        const maybe = error as { context?: Response; message?: string; name?: string };
        if (maybe.context && typeof maybe.context === 'object') {
          const status = maybe.context.status;
          const payload = await maybe.context.clone().json().catch(() => null);
          const detail =
            (payload && typeof payload === 'object' && 'detail' in payload && typeof payload.detail === 'string'
              ? payload.detail
              : null) ||
            (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
              ? payload.error
              : null) ||
            maybe.message ||
            'Edge Function error';
          return new Error(`${functionName} failed: HTTP ${status} - ${detail}`);
        }

        return new Error(maybe.message ?? 'Edge Function error');
      };

      const invokeOnce = async (token: string) => {
        const { data, error } = await supabase.functions.invoke(functionName, {
          body: body ?? {},
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (error) throw await toDetailedError(error);
        return data as { url?: string } | null;
      };

      try {
        return await invokeOnce(accessToken);
      } catch (error) {
        const detailed = await toDetailedError(error);
        const message = detailed.message;
        if (!/invalid jwt/i.test(message)) throw detailed;

        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session) throw detailed;
        return await invokeOnce(refreshed.session.access_token);
      }
    },
    [],
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
