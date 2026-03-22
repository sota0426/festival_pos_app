import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';

const copyWithDocumentCommand = (text: string): boolean => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
};

export const copyToClipboard = async (text: string): Promise<void> => {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        if (copyWithDocumentCommand(text)) return;
      }
    } else if (copyWithDocumentCommand(text)) {
      return;
    }
  }

  await Clipboard.setStringAsync(text);
};
