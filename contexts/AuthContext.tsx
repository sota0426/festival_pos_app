import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase, hasSupabaseEnvConfigured } from '../lib/supabase';
import { buildNativeAuthBridgeUrl, getWebAppBaseUrl } from '../lib/webAppUrl';
import type { User } from '@supabase/supabase-js';
import type { Profile, Subscription, Branch } from '../types/database';

if (Platform.OS !== 'web' && typeof WebBrowser.maybeCompleteAuthSession === 'function') {
  WebBrowser.maybeCompleteAuthSession();
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'guest' }
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
  enterGuest: () => void;
  exitGuest: () => void;
  enterDemo: () => void;
  exitDemo: () => void;
  enterWithLoginCode: (branch: Branch, code: string) => void;
  exitLoginCode: () => void;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<Subscription | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const LOGIN_CODE_SESSION_KEY = '@festival_pos/login_code_session';
const TRIAL_LENGTH_DAYS = 7;

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
      const prodWebUrl = getWebAppBaseUrl() ?? 'https://festival-pos-app.vercel.app';
      if (typeof window === 'undefined') return prodWebUrl;

      const origin = window.location.origin;
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') return origin;

      // Web本番では常に固定URLへ戻して localhost への誤リダイレクトを防ぐ
      return prodWebUrl;
    }
    return Linking.createURL('auth/callback');
  }, []);

  const extractQueryParam = useCallback((url: string, key: string): string | null => {
    const pattern = new RegExp(`[?&]${key}=([^&#]*)`);
    const matched = pattern.exec(url);
    return matched ? decodeURIComponent(matched[1]) : null;
  }, []);

  const extractHashParam = useCallback((hash: string, key: string): string | null => {
    const hashIndex = hash.indexOf('#');
    const rawHash = hashIndex >= 0 ? hash.slice(hashIndex + 1) : hash;
    const normalized = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
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

  const createTrialPeriod = useCallback(() => {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + TRIAL_LENGTH_DAYS);
    return {
      current_period_start: start.toISOString(),
      current_period_end: end.toISOString(),
    };
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
      const trialPeriod = createTrialPeriod();
      const { data: insertedSubscription } = await supabase
        .from('subscriptions')
        .insert({
          user_id: user.id,
          plan_type: 'free',
          status: 'trialing',
          ...trialPeriod,
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
          branch_number: 1,
          display_order: 1,
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

    const normalizedSubscription: Subscription = subscription ?? {
      id: '',
      user_id: user.id,
      organization_id: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      plan_type: 'free',
      status: 'trialing',
      ...createTrialPeriod(),
      cancel_at_period_end: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return {
      profile: (profile as Profile) ?? profileFallback,
      subscription: normalizedSubscription,
    };
  }, [createTrialPeriod, generateNextBranchCode]);

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

  const consumeAuthRedirectUrl = useCallback(async (url: string): Promise<User | null> => {
    const errorCode = extractQueryParam(url, 'error_code') ?? extractHashParam(url, 'error_code');
    const errorDescription =
      extractQueryParam(url, 'error_description') ?? extractHashParam(url, 'error_description');

    if (errorCode) {
      console.error('[Auth] auth callback error:', { errorCode, errorDescription, url });
      return null;
    }

    const code = extractQueryParam(url, 'code');
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('[Auth] exchangeCodeForSession failed:', error);
        return null;
      }
      return data.session?.user ?? null;
    }

    const accessToken = extractHashParam(url, 'access_token');
    const refreshToken = extractHashParam(url, 'refresh_token');
    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        console.error('[Auth] setSession from callback failed:', error);
        return null;
      }
      return data.user ?? data.session?.user ?? null;
    }

    return null;
  }, [extractHashParam, extractQueryParam]);

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
      const user = await consumeAuthRedirectUrl(href);
      if (user) {
        if (window.location.search.includes('code=')) {
          window.history.replaceState({}, '', `${window.location.origin}${window.location.pathname}`);
        }
        if (window.location.hash.includes('access_token=')) {
          window.history.replaceState({}, '', `${window.location.origin}${window.location.pathname}`);
        }
        return user;
      }

      if (window.location.hash.includes('access_token=')) {
        window.history.replaceState({}, '', `${window.location.origin}${window.location.pathname}`);
      }
      return null;
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

    const handleNativeUrl = async ({ url }: { url: string }) => {
      if (Platform.OS === 'web') return;
      const user = await consumeAuthRedirectUrl(url);
      if (user) {
        await WebBrowser.dismissBrowser();
        await fetchProfileAndSubscription(user);
      }
    };

    const linkingSubscription = Linking.addEventListener('url', (event) => {
      void handleNativeUrl(event);
    });

    if (Platform.OS !== 'web') {
      Linking.getInitialURL().then((url) => {
        if (url) {
          void handleNativeUrl({ url });
        }
      });
    }

    return () => {
      authListener.unsubscribe();
      linkingSubscription.remove();
    };
  }, [consumeAuthRedirectUrl, fetchProfileAndSubscription, restoreLoginCodeSession]);

  const signInWithProvider = useCallback(async (provider: 'google' | 'apple') => {
    const browserReturnUrl = getOAuthRedirectUri();
    const redirectTo =
      Platform.OS === 'web'
        ? browserReturnUrl
        : buildNativeAuthBridgeUrl(browserReturnUrl) ?? browserReturnUrl;
    console.log('[Auth] OAuth redirectTo:', redirectTo);
    const oauthOptions = {
      redirectTo,
      ...(provider === 'google'
        ? {
            queryParams: {
              prompt: 'select_account',
            },
          }
        : {}),
    };

    if (Platform.OS === 'web') {
      await supabase.auth.signInWithOAuth({
        provider,
        options: oauthOptions,
      });
      return;
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { ...oauthOptions, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('OAuth URLの取得に失敗しました');

    const result = await WebBrowser.openAuthSessionAsync(data.url, browserReturnUrl);
    if (result.type !== 'success' || !result.url) {
      if (result.type === 'cancel' || result.type === 'dismiss') {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user) {
          return;
        }
        throw new Error('ログインをキャンセルしました');
      }
      throw new Error('OAuth認証が完了しませんでした');
    }

    const user = await consumeAuthRedirectUrl(result.url);
    if (user) {
      return;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    console.error('[Auth] OAuth callback missing tokens/code', {
      redirectTo,
      browserReturnUrl,
      resultType: result.type,
      resultUrl: result.url,
    });

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      return;
    }

    throw new Error('認証情報を取得できませんでした。iOSシミュレータではブラウザを閉じずに完了してください。');
  }, [consumeAuthRedirectUrl, getOAuthRedirectUri]);

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
    const emailRedirectTo = Platform.OS === 'web' ? getOAuthRedirectUri() : undefined;
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
  }, [getOAuthRedirectUri]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAuthState({ status: 'unauthenticated' });
    await clearLoginCodeSession();
  }, [clearLoginCodeSession]);

  const enterGuest = useCallback(() => {
    setAuthState({ status: 'guest' });
  }, []);

  const exitGuest = useCallback(() => {
    setAuthState({ status: 'unauthenticated' });
  }, []);

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
        enterGuest,
        exitGuest,
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
