import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { supabase, hasSupabaseEnvConfigured } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile, Subscription, Branch } from '../types/database';

if (Platform.OS !== 'web' && typeof WebBrowser.maybeCompleteAuthSession === 'function') {
  WebBrowser.maybeCompleteAuthSession();
}

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
  hasDemoReturnTarget: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<{ needsEmailConfirmation: boolean; alreadyRegistered: boolean }>;
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
  const [preDemoAuthState, setPreDemoAuthState] = useState<AuthState | null>(null);

  const getOAuthRedirectUri = useCallback((): string => {
    if (Platform.OS === 'web') {
      return typeof window !== 'undefined' ? window.location.origin : '';
    }
    // Expo Go ではカスタムschemeより、現在のhostを使ったexp:// URLの方が復帰が安定する
    if (Constants.appOwnership === 'expo') {
      return Linking.createURL('auth/callback');
    }
    return makeRedirectUri({
      scheme: 'festival-pos',
      path: 'auth/callback',
    });
  }, []);

  const extractQueryParam = useCallback((url: string, key: string): string | null => {
    const pattern = new RegExp(`[?&]${key}=([^&#]*)`);
    const matched = pattern.exec(url);
    return matched ? decodeURIComponent(matched[1]) : null;
  }, []);

  const extractHashParam = useCallback((hash: string, key: string): string | null => {
    const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!normalized) return null;
    const params = new URLSearchParams(normalized);
    const value = params.get(key);
    return value ? decodeURIComponent(value) : null;
  }, []);

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
      display_name:
        user.user_metadata?.display_name ??
        user.user_metadata?.full_name ??
        user.email ??
        '',
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

    const tryRestoreSessionFromWebUrl = async (): Promise<User | null> => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
      const href = window.location.href;
      const code = extractQueryParam(href, 'code');
      const errorCode = extractQueryParam(href, 'error_code') ?? extractHashParam(window.location.hash, 'error_code');
      const errorDescription =
        extractQueryParam(href, 'error_description') ?? extractHashParam(window.location.hash, 'error_description');

      if (errorCode) {
        console.error('[Auth] auth callback error:', { errorCode, errorDescription });
      }

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('[Auth] exchangeCodeForSession failed:', error);
          return null;
        }
        if (window.location.search.includes('code=')) {
          window.history.replaceState({}, '', `${window.location.origin}${window.location.pathname}`);
        }
        return data.session?.user ?? null;
      }

      const accessToken = extractHashParam(window.location.hash, 'access_token');
      const refreshToken = extractHashParam(window.location.hash, 'refresh_token');
      if (!accessToken || !refreshToken) return null;

      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        console.error('[Auth] setSession from URL hash failed:', error);
        return null;
      }
      if (window.location.hash.includes('access_token=')) {
        window.history.replaceState({}, '', `${window.location.origin}${window.location.pathname}`);
      }
      return data.user ?? data.session?.user ?? null;
    };

    if (!hasSupabaseEnvConfigured()) {
      void fallbackToLoginCodeOrUnauthenticated();
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await fetchProfileAndSubscription(session.user);
        return;
      }
      const exchangedUser = await tryRestoreSessionFromWebUrl();
      if (exchangedUser) {
        await fetchProfileAndSubscription(exchangedUser);
        return;
      }
      await fallbackToLoginCodeOrUnauthenticated();
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
  }, [extractHashParam, extractQueryParam, fetchProfileAndSubscription, restoreLoginCodeSession]);

  const signInWithProvider = useCallback(async (provider: 'google' | 'apple') => {
    const redirectTo = getOAuthRedirectUri();
    console.log('[Auth] OAuth redirectTo:', redirectTo);

    if (Platform.OS === 'web') {
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      return;
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('OAuth URLの取得に失敗しました');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) {
      throw new Error('OAuth認証が完了しませんでした');
    }

    const code = extractQueryParam(result.url, 'code');
    if (!code) {
      throw new Error('認証コードを取得できませんでした');
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }, [extractQueryParam, getOAuthRedirectUri]);

  const signInWithGoogle = useCallback(async () => {
    await signInWithProvider('google');
  }, [signInWithProvider]);

  const signInWithApple = useCallback(async () => {
    await signInWithProvider('apple');
  }, [signInWithProvider]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) throw error;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, displayName: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedDisplayName = displayName.trim();
    const emailRedirectTo =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : undefined;
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
        data: {
          display_name: normalizedDisplayName,
          full_name: normalizedDisplayName,
        },
      },
    });
    if (error) throw error;
    const identities = (data.user as any)?.identities;
    const alreadyRegistered = Array.isArray(identities) && identities.length === 0;
    return {
      needsEmailConfirmation: !data.session,
      alreadyRegistered,
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAuthState({ status: 'unauthenticated' });
    await clearLoginCodeSession();
  }, [clearLoginCodeSession]);

  const enterDemo = useCallback(() => {
    setPreDemoAuthState((prev) => {
      if (prev) return prev;
      if (authState.status !== 'demo' && authState.status !== 'loading') {
        return authState;
      }
      return prev;
    });
    setAuthState({ status: 'demo' });
  }, [authState]);

  const exitDemo = useCallback(() => {
    setAuthState(preDemoAuthState ?? { status: 'unauthenticated' });
    setPreDemoAuthState(null);
  }, [preDemoAuthState]);

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
        hasDemoReturnTarget: preDemoAuthState !== null,
        signInWithGoogle,
        signInWithApple,
        signInWithEmail,
        signUpWithEmail,
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
