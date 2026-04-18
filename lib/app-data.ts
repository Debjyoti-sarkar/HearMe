import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EmergencyContact, HearMeSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

const KEYS = {
  contacts: '@hearme/contacts_v1',
  settings: '@hearme/settings_v1',
  localAvatar: '@hearme/local_avatar',
} as const;

export async function loadContacts(): Promise<EmergencyContact[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.contacts);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is EmergencyContact =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as EmergencyContact).id === 'string' &&
        typeof (c as EmergencyContact).name === 'string' &&
        typeof (c as EmergencyContact).phone === 'string',
    );
  } catch {
    return [];
  }
}

export async function saveContacts(contacts: EmergencyContact[]) {
  await AsyncStorage.setItem(KEYS.contacts, JSON.stringify(contacts));
}

export async function loadSettings(): Promise<HearMeSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.settings);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const j = JSON.parse(raw) as Partial<HearMeSettings>;
    return { ...DEFAULT_SETTINGS, ...j };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: HearMeSettings) {
  await AsyncStorage.setItem(KEYS.settings, JSON.stringify(s));
}

export async function saveLocalAvatar(uri: string) {
  await AsyncStorage.setItem(KEYS.localAvatar, uri);
}

export async function loadLocalAvatar(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.localAvatar);
}

export async function clearLocalAvatar() {
  await AsyncStorage.removeItem(KEYS.localAvatar);
}

export async function clearAppData() {
  await AsyncStorage.multiRemove([KEYS.contacts, KEYS.settings, KEYS.localAvatar]);
}
