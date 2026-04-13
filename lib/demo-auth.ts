import * as SecureStore from 'expo-secure-store';

const KEY = 'hearme_demo_auth';

export async function isDemoAuthenticated() {
  const value = await SecureStore.getItemAsync(KEY);
  return value === '1';
}

export async function enableDemoAuth() {
  await SecureStore.setItemAsync(KEY, '1');
}

export async function clearDemoAuth() {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* ignore */
  }
}
