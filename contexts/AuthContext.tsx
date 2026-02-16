import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { supabase, hasSupabaseEnvConfigured } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
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
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' });

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
        await supabase.from('menus').insert({
          branch_id: branchId,
          menu_name: 'サンプルメニュー',
          price: 500,
          menu_number: 101,
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
    } catch {
      const { profile, subscription } = await ensureUserBootstrapData(user);
      setAuthState({ status: 'authenticated', user, profile, subscription });
    }
  }, [ensureUserBootstrapData]);

  useEffect(() => {
    if (!hasSupabaseEnvConfigured()) {
      setAuthState({ status: 'unauthenticated' });
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfileAndSubscription(session.user);
      } else {
        setAuthState({ status: 'unauthenticated' });
      }
    });

    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchProfileAndSubscription(session.user);
      } else {
        setAuthState({ status: 'unauthenticated' });
      }
    });

    return () => {
      authListener.unsubscribe();
    };
  }, [fetchProfileAndSubscription]);

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
  }, []);

  const enterDemo = useCallback(() => {
    setAuthState({ status: 'demo' });
  }, []);

  const exitDemo = useCallback(() => {
    setAuthState({ status: 'unauthenticated' });
  }, []);

  const enterWithLoginCode = useCallback((branch: Branch, code: string) => {
    setAuthState({ status: 'login_code', branch, loginCode: code });
  }, []);

  const exitLoginCode = useCallback(() => {
    setAuthState({ status: 'unauthenticated' });
  }, []);

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

  const refreshSubscription = useCallback(async () => {
    if (authState.status !== 'authenticated') return;
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
      return;
    }
    setAuthState((prev) =>
      prev.status === 'authenticated' ? { ...prev, subscription: data } : prev
    );
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
