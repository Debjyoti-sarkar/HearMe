import * as Crypto from 'expo-crypto';

import { setPsk, setSessionKey } from './neuroband-storage';

/**
 * NeuroBand pairing protocol — v1.
 *
 * Two-stage:
 *   1. The user types the 12-character PSK printed on the band's strap.
 *   2. The phone derives a 256-bit session key via:
 *        sessionKey = SHA-256( PSK || serial || pairing_nonce )
 *      and stores it in SecureStore. The matching firmware-side derivation
 *      uses the same inputs.
 *
 * v1 protocol authenticates BLE link-layer pairing via PSK passkey entry.
 * The session key derived here is the secret used for v2's AES-CCM frame
 * encryption when that ships. v1 frames travel unencrypted on the BLE link
 * but link-layer encryption is mandatory (rejected if the connection isn't
 * Secure Connections + bonded).
 */

const PSK_LENGTH = 12;
/** Allowed PSK character set: avoid ambiguous glyphs (0/O, 1/I/L). */
const PSK_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class PairingError extends Error {
  constructor(message: string, public code: 'BAD_PSK' | 'CRYPTO_FAIL' | 'NO_SERIAL') {
    super(message);
  }
}

export function normalizePsk(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isPskValid(input: string): boolean {
  const n = normalizePsk(input);
  if (n.length !== PSK_LENGTH) return false;
  for (const ch of n) {
    if (!PSK_ALPHABET.includes(ch)) return false;
  }
  return true;
}

export function formatPsk(input: string): string {
  // Display in 4-4-4 groups for legibility.
  const n = normalizePsk(input);
  return [n.slice(0, 4), n.slice(4, 8), n.slice(8, 12)].filter(Boolean).join('-');
}

/**
 * Derive the session key bound to (PSK, serial, nonce).
 *
 * The nonce defends against a replay where a thief copies a discarded band
 * and re-pairs to the same phone — every pair invocation produces a fresh
 * key. The phone must persist `nonce` alongside the pair record so future
 * sessions can recompute the same key.
 */
export async function deriveSessionKey(
  psk: string,
  serial: string,
  nonce: string,
): Promise<string> {
  if (!isPskValid(psk)) throw new PairingError('Invalid PSK format', 'BAD_PSK');
  if (!serial) throw new PairingError('Missing serial', 'NO_SERIAL');
  try {
    const material = `${normalizePsk(psk)}|${serial}|${nonce}`;
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      material,
      { encoding: Crypto.CryptoEncoding.HEX },
    );
  } catch (e) {
    throw new PairingError(
      e instanceof Error ? e.message : 'Hash failure',
      'CRYPTO_FAIL',
    );
  }
}

export async function generateNonceHex(byteCount = 16): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(byteCount);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Persist PSK + derived session key after a successful pair.
 * Caller is responsible for also writing the NeuroBandPairRecord.
 */
export async function persistPairingSecrets(
  psk: string,
  sessionKeyHex: string,
): Promise<void> {
  await setPsk(normalizePsk(psk));
  await setSessionKey(sessionKeyHex);
}
