import { Platform } from 'react-native';

const DEFAULT_WEB_APP_URL = 'https://festival-pos-app.vercel.app';

const normalizeBaseUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
};

export const getWebAppBaseUrl = (): string | null => {
  const configuredUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_WEB_BASE_URL);
  if (configuredUrl) return configuredUrl;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return normalizeBaseUrl(window.location.origin);
    }
  }

  return DEFAULT_WEB_APP_URL;
};

export const buildWebLoginUrl = (code: string | null | undefined): string | null => {
  if (!code) return null;
  const baseUrl = getWebAppBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}?login_code=${encodeURIComponent(code)}`;
};

export const buildMobileOrderUrl = (branchId: string | null | undefined): string | null => {
  if (!branchId) return null;
  const baseUrl = getWebAppBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}?mobile_order=1&branch=${encodeURIComponent(branchId)}`;
};

export const buildCheckoutStatusUrl = (
  status: 'success' | 'cancel',
  nativeReturnTo?: string | null,
): string | null => {
  const baseUrl = getWebAppBaseUrl();
  if (!baseUrl) return null;

  const params = new URLSearchParams({ checkout: status });
  if (nativeReturnTo) {
    params.set('native_app', '1');
    params.set('return_to', nativeReturnTo);
  }

  return `${baseUrl}?${params.toString()}`;
};

export const buildNativeAuthBridgeUrl = (nativeReturnTo: string | null | undefined): string | null => {
  const baseUrl = getWebAppBaseUrl();
  if (!baseUrl || !nativeReturnTo) return null;

  const params = new URLSearchParams({
    native_auth: '1',
    return_to: nativeReturnTo,
  });

  return `${baseUrl}?${params.toString()}`;
};
