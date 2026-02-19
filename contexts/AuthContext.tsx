import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, hasSupabaseEnvConfigured } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile, Subscription, Branch } from '../types/database';

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'demo' }
  | { status: 'login_code'; branch: Branch; loginCode: string }
  | {
      status: 'authenticated';
      user: User;
      profile: Profile;
      subscription: Subscription;
    };

interface AuthContextValue {
  authState: AuthState;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  enterDemo: () => void;
  exitDemo: () => void;
  enterWithLoginCode: (branch: Branch, code: string) => void;
  exitLoginCode: () => void;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<Subscription | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const LOGIN_CODE_SESSION_KEY = '@festival_pos/login_code_session';

type LoginCodeSession = {
  branch: Branch;
  loginCode: string;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' });

  const saveLoginCodeSession = useCallback(async (branch: Branch, loginCode: string) => {
    const payload: LoginCodeSession = { branch, loginCode };
    await AsyncStorage.setItem(LOGIN_CODE_SESSION_KEY, JSON.stringify(payload));
  }, []);

  const clearLoginCodeSession = useCallback(async () => {
    await AsyncStorage.removeItem(LOGIN_CODE_SESSION_KEY);
  }, []);

  const restoreLoginCodeSession = useCallback(async (): Promise<LoginCodeSession | null> => {
    try {
      const data = await AsyncStorage.getItem(LOGIN_CODE_SESSION_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data) as Partial<LoginCodeSession>;
      if (!parsed?.branch || !parsed?.loginCode) return null;
      return { branch: parsed.branch as Branch, loginCode: String(parsed.loginCode) };
    } catch {
      return null;
    }
  }, []);

  const generateNextBranchCode = useCallback(async (): Promise<string> => {
    const { data, error } = await supabase
      .from('branches')
      .select('branch_code')
      .order('branch_code', { ascending: true });
    if (error) throw error;

    const maxNumber = (data ?? []).reduce((max, row) => {
      const num = parseInt(String(row.branch_code ?? '').replace('S', ''), 10);
      return Number.isFinite(num) && num > max ? num : max;
    }, 0);
    return `S${String(maxNumber + 1).padStart(3, '0')}`;
  }, []);

  const ensureUserBootstrapData = useCallback(async (user: User) => {
    const profileFallback: Profile = {
      id: user.id,
      email: user.email ?? '',
      display_name: user.user_metadata?.full_name ?? user.email ?? '',
      avatar_url: user.user_metadata?.avatar_url ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    let profile = existingProfile;
    if (!profile) {
      const { data: insertedProfile } = await supabase
        .from('profiles')
        .insert(profileFallback)
        .select('*')
        .single();
      profile = insertedProfile ?? profileFallback;
    }

    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let subscription = existingSubscription;
    if (!subscription) {
      const { data: insertedSubscription } = await supabase
        .from('subscriptions')
        .insert({
          user_id: user.id,
          plan_type: 'free',
          status: 'active',
        })
        .select('*')
        .single();
      subscription = insertedSubscription ?? null;
    }

    const { data: existingBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle();

    let branchId = existingBranch?.id ?? null;
    if (!branchId) {
      const branchCode = await generateNextBranchCode();
      const { data: insertedBranch } = await supabase
        .from('branches')
        .insert({
          branch_code: branchCode,
          branch_name: '店舗1',
          password: '0000',
          sales_target: 0,
          status: 'active',
          owner_id: user.id,
        })
        .select('id')
        .single();
      branchId = insertedBranch?.id ?? null;
    }

    if (branchId) {
      const { data: menu } = await supabase
        .from('menus')
        .select('id')
        .eq('branch_id', branchId)
        .limit(1)
        .maybeSingle();

      if (!menu) {
        let categoryId: string | null = null;
        const { data: existingCategory } = await supabase
          .from('menu_categories')
          .select('id')
          .eq('branch_id', branchId)
          .eq('category_name', 'フード')
          .maybeSingle();

        if (existingCategory?.id) {
          categoryId = existingCategory.id;
        } else {
          const { data: insertedCategory } = await supabase
            .from('menu_categories')
            .insert({
              branch_id: branchId,
              category_name: 'フード',
              sort_order: 0,
            })
            .select('id')
            .single();
          categoryId = insertedCategory?.id ?? null;
        }

        await supabase.from('menus').insert({
          branch_id: branchId,
          menu_name: 'サンプルメニュー',
          price: 500,
          menu_number: 101,
          sort_order: 0,
          category_id: categoryId,
          stock_management: false,
          stock_quantity: 0,
          is_active: true,
          is_show: true,
        });
      }
    }

    const normalizedSubscription: Subscription = subscription ?? {
      id: '',
      user_id: user.id,
      organization_id: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      plan_type: 'free',
      status: 'active',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return {
      profile: (profile as Profile) ?? profileFallback,
      subscription: normalizedSubscription,
    };
  }, [generateNextBranchCode]);

  const fetchProfileAndSubscription = useCallback(async (user: User) => {
    try {
      const { profile, subscription } = await ensureUserBootstrapData(user);

      setAuthState({
        status: 'authenticated',
        user,
        profile,
        subscription,
      });
      await clearLoginCodeSession();
    } catch {
      const { profile, subscription } = await ensureUserBootstrapData(user);
      setAuthState({ status: 'authenticated', user, profile, subscription });
      await clearLoginCodeSession();
    }
  }, [ensureUserBootstrapData, clearLoginCodeSession]);

  useEffect(() => {
    const fallbackToLoginCodeOrUnauthenticated = async () => {
      const restored = await restoreLoginCodeSession();
      if (restored) {
        setAuthState({ status: 'login_code', branch: restored.branch, loginCode: restored.loginCode });
        return;
      }
      setAuthState({ status: 'unauthenticated' });
    };

    if (!hasSupabaseEnvConfigured()) {
      void fallbackToLoginCodeOrUnauthenticated();
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await fetchProfileAndSubscription(session.user);
      } else {
        await fallbackToLoginCodeOrUnauthenticated();
      }
    });

    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void fetchProfileAndSubscription(session.user);
      } else {
        void fallbackToLoginCodeOrUnauthenticated();
      }
    });

    return () => {
      authListener.unsubscribe();
    };
  }, [fetchProfileAndSubscription, restoreLoginCodeSession]);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo =
      Platform.OS === 'web'
        ? window.location.origin
        : 'festival-pos://auth/callback';

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
  }, []);

  const signInWithApple = useCallback(async () => {
    const redirectTo =
      Platform.OS === 'web'
        ? window.location.origin
        : 'festival-pos://auth/callback';

    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo },
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAuthState({ status: 'unauthenticated' });
    await clearLoginCodeSession();
  }, [clearLoginCodeSession]);

  const enterDemo = useCallback(() => {
    setAuthState({ status: 'demo' });
  }, []);

  const exitDemo = useCallback(() => {
    setAuthState({ status: 'unauthenticated' });
  }, []);

  const enterWithLoginCode = useCallback((branch: Branch, code: string) => {
    const normalized = code.toUpperCase().trim();
    setAuthState({ status: 'login_code', branch, loginCode: normalized });
    void saveLoginCodeSession(branch, normalized);
  }, [saveLoginCodeSession]);

  const exitLoginCode = useCallback(() => {
    setAuthState({ status: 'unauthenticated' });
    void clearLoginCodeSession();
  }, [clearLoginCodeSession]);

  const refreshProfile = useCallback(async () => {
    if (authState.status !== 'authenticated') return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authState.user.id)
      .single();
    if (data) {
      setAuthState((prev) =>
        prev.status === 'authenticated' ? { ...prev, profile: data } : prev
      );
    }
  }, [authState]);

  const refreshSubscription = useCallback(async (): Promise<Subscription | null> => {
    if (authState.status !== 'authenticated') return null;
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', authState.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) {
      const { subscription } = await ensureUserBootstrapData(authState.user);
      setAuthState((prev) =>
        prev.status === 'authenticated' ? { ...prev, subscription } : prev
      );
      return subscription;
    }
    setAuthState((prev) =>
      prev.status === 'authenticated' ? { ...prev, subscription: data } : prev
    );
    return data;
  }, [authState, ensureUserBootstrapData]);

  return (
    <AuthContext.Provider
      value={{
        authState,
        signInWithGoogle,
        signInWithApple,
        signOut,
        enterDemo,
        exitDemo,
        enterWithLoginCode,
        exitLoginCode,
        refreshProfile,
        refreshSubscription,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
