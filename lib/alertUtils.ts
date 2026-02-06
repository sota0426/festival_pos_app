import { Platform, Alert, Vibration } from 'react-native';

/**
 * Cross-platform notification alert.
 * On native: uses Alert.alert
 * On web: uses window.alert
 */
export const alertNotify = (title: string, message?: string): void => {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message, [{ text: 'OK' }]);
  }
};

/**
 * Cross-platform confirmation dialog.
 * On native: uses Alert.alert with Cancel + Confirm buttons
 * On web: uses window.confirm
 */
export const alertConfirm = (
  title: string,
  message: string,
  onConfirm: () => void,
  confirmText: string = 'OK',
  cancelText: string = 'キャンセル'
): void => {
  if (Platform.OS === 'web') {
    const result = window.confirm(`${title}\n\n${message}`);
    if (result) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel' },
      { text: confirmText, style: 'destructive', onPress: onConfirm },
    ]);
  }
};

/**
 * Cross-platform vibration that safely no-ops on web.
 */
export const safeVibrate = (duration: number = 50): void => {
  if (Platform.OS !== 'web') {
    try {
      Vibration.vibrate(duration);
    } catch {
      // Vibration not available
    }
  }
};
