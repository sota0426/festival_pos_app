import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_SETTINGS_KEY = '@festival_pos/store_settings';

let syncEnabled = true;
let syncModeHydrationPromise: Promise<void> | null = null;

export const setSyncEnabled = (enabled: boolean): void => {
  syncEnabled = enabled;
};

export const getSyncEnabled = (): boolean => {
  return syncEnabled;
};

export const hydrateSyncMode = async (): Promise<void> => {
  try {
    const data = await AsyncStorage.getItem(STORE_SETTINGS_KEY);
    if (!data) {
      syncEnabled = true;
      return;
    }
    const parsed = JSON.parse(data) as { sync_enabled?: boolean };
    syncEnabled = parsed.sync_enabled ?? true;
  } catch {
    syncEnabled = true;
  }
};

export const ensureSyncModeHydrated = (): Promise<void> => {
  if (!syncModeHydrationPromise) {
    syncModeHydrationPromise = hydrateSyncMode();
  }
  return syncModeHydrationPromise;
};

void ensureSyncModeHydrated();
