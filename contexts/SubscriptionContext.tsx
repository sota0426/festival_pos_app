import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { setSyncEnabled } from '../lib/syncMode';
import type { PlanType, SubscriptionStatus } from '../types/database';

interface SubscriptionContextValue {
  plan: PlanType;
  status: SubscriptionStatus;
  canSync: boolean;
  canAccessHQ: boolean;
  maxStores: number;
  isFreePlan: boolean;
  isStorePlan: boolean;
  isOrgPlan: boolean;
  openCheckout: (plan: 'store' | 'organization') => Promise<void>;
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
  const isActive = status === 'active' || status === 'trialing';

  const canSync = isActive && (plan === 'store' || plan === 'organization');
  const canAccessHQ = isActive && plan === 'organization';
  const maxStores = plan === 'organization' ? Infinity : 1;

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

  const openCheckout = async (targetPlan: 'store' | 'organization') => {
    if (authState.status !== 'authenticated') return;

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { plan: targetPlan },
      });

      if (error) throw error;
      if (data?.url) {
        if (Platform.OS === 'web') {
          window.location.href = data.url;
        } else {
          await Linking.openURL(data.url);
        }
      }
    } catch (e) {
      console.error('Failed to create checkout session:', e);
    }
  };

  const openPortal = async () => {
    if (authState.status !== 'authenticated') return;

    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {});

      if (error) throw error;
      if (data?.url) {
        if (Platform.OS === 'web') {
          window.location.href = data.url;
        } else {
          await Linking.openURL(data.url);
        }
      }
    } catch (e) {
      console.error('Failed to create portal session:', e);
    }
  };

  const value = useMemo(
    () => ({
      plan,
      status,
      canSync,
      canAccessHQ,
      maxStores,
      isFreePlan: plan === 'free',
      isStorePlan: plan === 'store',
      isOrgPlan: plan === 'organization',
      openCheckout,
      openPortal,
    }),
    [plan, status, canSync, canAccessHQ, maxStores, authState.status]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
