import * as SecureStore from 'expo-secure-store';

const K = {
  duressPin: 'hearme_duress_pin',
} as const;

export type PinKind = 'normal' | 'duress' | 'invalid';

function reverse(pin: string): string {
  return pin.split('').reverse().join('');
}

function isPalindrome(pin: string): boolean {
  return pin.length > 0 && pin === reverse(pin);
}

export async function saveDuressPin(pin: string) {
  await SecureStore.setItemAsync(K.duressPin, pin);
}

export async function clearDuressPin() {
  try {
    await SecureStore.deleteItemAsync(K.duressPin);
  } catch {
    /* noop */
  }
}

export async function getDuressPin(): Promise<string | null> {
  return SecureStore.getItemAsync(K.duressPin);
}

// A normal PIN that's a palindrome can't have an auto-reverse duress (would collide).
// User must set an explicit duress PIN in that case.
export function autoReversePinFor(normalPin: string): string | null {
  if (!normalPin || isPalindrome(normalPin)) return null;
  return reverse(normalPin);
}

export async function classifyPin(input: string, normalPin: string): Promise<PinKind> {
  if (!input || !normalPin) return 'invalid';
  if (input === normalPin) return 'normal';
  const explicitDuress = await getDuressPin();
  if (explicitDuress && input === explicitDuress) return 'duress';
  const auto = autoReversePinFor(normalPin);
  if (auto && input === auto) return 'duress';
  return 'invalid';
}
