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

  const fetchProfileAndSubscription = useCallback(async (user: User) => {
    try {
      const [profileRes, subRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
      ]);

      const profile: Profile = profileRes.data ?? {
        id: user.id,
        email: user.email ?? '',
        display_name: user.user_metadata?.full_name ?? user.email ?? '',
        avatar_url: user.user_metadata?.avatar_url ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const subscription: Subscription = subRes.data ?? {
        id: '',
        user_id: user.id,
        organization_id: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        plan_type: 'free' as const,
        status: 'active' as const,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setAuthState({
        status: 'authenticated',
        user,
        profile,
        subscription,
      });
    } catch {
      setAuthState({
        status: 'authenticated',
        user,
        profile: {
          id: user.id,
          email: user.email ?? '',
          display_name: user.user_metadata?.full_name ?? user.email ?? '',
          avatar_url: user.user_metadata?.avatar_url ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        subscription: {
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
        },
      });
    }
  }, []);

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
      .single();
    if (data) {
      setAuthState((prev) =>
        prev.status === 'authenticated' ? { ...prev, subscription: data } : prev
      );
    }
  }, [authState]);

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
