import { Alert, Platform } from 'react-native';

// react-native-web's Alert.alert is a total no-op (does nothing at all), so any
// confirmation or error dialog silently vanishes when testing in a browser.
// This falls back to window.confirm/alert on web and RN's native Alert
// everywhere else.

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAlert(title: string, message: string, buttons: AlertButton[]): void {
  if (Platform.OS === 'web') {
    const confirmButton = buttons.find(b => b.style !== 'cancel') ?? buttons[buttons.length - 1];
    const ok = window.confirm(message ? `${title}\n\n${message}` : title);
    if (ok) confirmButton?.onPress?.();
    return;
  }
  Alert.alert(title, message, buttons as any);
}
