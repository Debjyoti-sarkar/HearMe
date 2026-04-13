import AsyncStorage from '@react-native-async-storage/async-storage';

export type AlertRecord = {
  id: string;
  type: 'sos' | 'shake' | 'crash' | 'manual';
  timestamp: string;
  location: string | null;
  safetyCode: string;
  contactsNotified: number;
  status: 'sent' | 'failed' | 'cancelled';
};

const KEY = '@hearme/alert_history_v1';

export async function loadAlertHistory(): Promise<AlertRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as AlertRecord[];
  } catch {
    return [];
  }
}

export async function saveAlertRecord(record: AlertRecord): Promise<void> {
  const history = await loadAlertHistory();
  history.unshift(record);
  // Keep last 50 alerts
  const trimmed = history.slice(0, 50);
  await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
}

export async function clearAlertHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
