import * as SecureStore from 'expo-secure-store';

import { clearAppData } from './app-data';

const K = {
  phone: 'hearme_phone',
  otpOk: 'hearme_otp_ok',
  aadhaarOk: 'hearme_aadhaar_ok',
  uidLast4: 'hearme_uid_last4',
  pin: 'hearme_pin',
  biometric: 'hearme_biometric',
  userType: 'hearme_user_type',
} as const;

export type InitialRoute = '/login' | '/verify-otp' | '/aadhaar' | '/(main)';

export async function resolveInitialRoute(): Promise<InitialRoute> {
  const [phone, otp, aadhaar] = await Promise.all([
    SecureStore.getItemAsync(K.phone),
    SecureStore.getItemAsync(K.otpOk),
    SecureStore.getItemAsync(K.aadhaarOk),
  ]);
  if (phone && otp === '1' && aadhaar === '1') return '/(main)';
  if (phone && otp === '1') return '/aadhaar';
  if (phone) return '/verify-otp';
  return '/login';
}

export async function setPhone(phone: string) {
  await SecureStore.setItemAsync(K.phone, phone);
}

export async function getPhone() {
  return SecureStore.getItemAsync(K.phone);
}

export async function markOtpVerified() {
  await SecureStore.setItemAsync(K.otpOk, '1');
}

export async function markAadhaarVerified(last4: string) {
  await SecureStore.setItemAsync(K.aadhaarOk, '1');
  await SecureStore.setItemAsync(K.uidLast4, last4);
}

async function safeDelete(key: string) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* key may not exist */
  }
}

export async function clearSession() {
  await clearAppData();
  await Promise.all([
    safeDelete(K.phone),
    safeDelete(K.otpOk),
    safeDelete(K.aadhaarOk),
    safeDelete(K.uidLast4),
  ]);
}

export async function getUidLast4() {
  return SecureStore.getItemAsync(K.uidLast4);
}

export async function savePin(pin: string) {
  await SecureStore.setItemAsync(K.pin, pin);
}

export async function getPin() {
  return SecureStore.getItemAsync(K.pin);
}

export async function saveBiometricEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(K.biometric, enabled ? '1' : '0');
}

export async function isBiometricEnabled() {
  return (await SecureStore.getItemAsync(K.biometric)) === '1';
}

export async function setUserType(type: 'new' | 'existing') {
  await SecureStore.setItemAsync(K.userType, type);
}

export async function getUserType(): Promise<'new' | 'existing' | null> {
  const val = await SecureStore.getItemAsync(K.userType);
  if (val === 'new' || val === 'existing') return val;
  return null;
}

export async function isPinOrBiometricSet(): Promise<boolean> {
  const [pin, bio] = await Promise.all([
    SecureStore.getItemAsync(K.pin),
    SecureStore.getItemAsync(K.biometric),
  ]);
  return !!pin || bio === '1';
}
