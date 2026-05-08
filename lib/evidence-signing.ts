// Cryptographic chain-of-custody hardening for the evidence locker.
//
// The existing chain-hash sequence (evidence-cloud.ts) makes the *order* of
// items tamper-evident. This module adds two layers of public-verifiability:
//
// 1) Device-bound Ed25519 signature on the session's final chainHash. The
//    signing key is generated on first use and persisted in expo-secure-store
//    (Keychain on iOS / EncryptedSharedPreferences on Android). The matching
//    public key is uploaded to Supabase so any verifier can check that the
//    bytes the server holds were produced by *this* device.
//
// 2) OpenTimestamps anchor on the chainHash. We submit the SHA-256 digest of
//    the chainHash to a public OTS calendar over HTTP and receive a binary
//    "incomplete attestation" receipt. Within ~6 hours OTS bundles this into a
//    Bitcoin block — anyone with the receipt + the chainHash can later prove
//    "this evidence existed by block N" without trusting HearMe at all.
//
// Together: an item edit invalidates contentHash → chainHash → signature, and
// any back-dating is caught by the OTS Bitcoin anchor.
//
// Dependencies: @noble/ed25519 (~10 KB, pure JS, audited). No native module.

import * as ed from '@noble/ed25519';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { supabase, isSupabaseConfigured } from './supabase';

const SK_STORE_KEY = 'hearme.evidence.signingKey.v1';

// Configure noble-ed25519's hash dependency to expo-crypto's SHA-512.
//
// noble-ed25519's hash-injection point moved across versions:
//   v1.x        ed.utils.sha512(msg)
//   v2.0–2.0.x  ed.hashes.sha512(msg)
//   v2.1+       ed.etc.sha512Async(...msgs)
// We don't know which version `npm install` resolved to, so we set whichever
// shape exists. We also accept either single-arg or variadic-arg invocation
// (v2.1+ calls with multiple Uint8Arrays that we must concat before hashing).
async function expoSha512(...messages: Uint8Array[]): Promise<Uint8Array> {
  let total = 0;
  for (const m of messages) total += m.length;
  // expo-crypto.digest is typed for BufferSource — copy into a fresh
  // ArrayBuffer-backed view so the type narrows cleanly.
  const view = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const m of messages) {
    view.set(m, offset);
    offset += m.length;
  }
  const buf = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA512, view);
  return new Uint8Array(buf);
}

(() => {
  // Wire the hash into whichever extension point the bundled noble version
  // exposes. Setting properties on missing parents would throw — guard each.
  const edAny = ed as unknown as {
    etc?: {
      sha512Async?: (...m: Uint8Array[]) => Promise<Uint8Array>;
      sha512Sync?: (...m: Uint8Array[]) => Uint8Array;
    };
    hashes?: { sha512?: (m: Uint8Array) => Promise<Uint8Array> };
    utils?: { sha512?: (m: Uint8Array) => Promise<Uint8Array> | Uint8Array };
  };
  if (edAny.etc) {
    edAny.etc.sha512Async = expoSha512;
  }
  if (edAny.hashes) {
    edAny.hashes.sha512 = (m: Uint8Array) => expoSha512(m);
  }
  if (edAny.utils && typeof edAny.utils.sha512 !== 'function') {
    edAny.utils.sha512 = (m: Uint8Array) => expoSha512(m);
  }
})();

export type SignedSession = {
  chainHash: string;
  signature: string; // hex
  publicKey: string; // hex
  signedAt: string;
};

export type OtsReceipt = {
  calendar: string;
  receiptBase64: string;
  submittedAt: string;
  upgradedAt: string | null;
  bitcoinBlockHeight: number | null;
};

// Pre-shared list of public OTS calendars. We try them in order; first hit wins.
const OTS_CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://alice.btc.calendar.catallaxy.com',
];

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Avoid pulling in Buffer; build base64 manually so this works in pure RN.
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += table[a >> 2];
    out += table[((a & 0x03) << 4) | (b >> 4)];
    out += table[((b & 0x0f) << 2) | (c >> 6)];
    out += table[c & 0x3f];
  }
  if (i < bytes.length) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    out += table[a >> 2];
    out += table[((a & 0x03) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? table[(b & 0x0f) << 2] : '=';
    out += '=';
  }
  return out;
}

/** Generate (or return cached) per-device Ed25519 keypair. */
async function getOrCreateKeyPair(): Promise<{ sk: Uint8Array; pk: Uint8Array }> {
  const existing = await SecureStore.getItemAsync(SK_STORE_KEY);
  if (existing) {
    const sk = hexToBytes(existing);
    const pk = await ed.getPublicKeyAsync(sk);
    return { sk, pk };
  }
  // 32 random bytes from expo-crypto = an Ed25519 seed.
  const sk = await Crypto.getRandomBytesAsync(32);
  await SecureStore.setItemAsync(SK_STORE_KEY, bytesToHex(sk), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  const pk = await ed.getPublicKeyAsync(sk);
  return { sk, pk };
}

/** Sign a session's chainHash with the device key. Pure crypto — no I/O. */
export async function signChainHash(chainHash: string): Promise<SignedSession> {
  if (!chainHash) throw new Error('signChainHash: empty chainHash');
  const { sk, pk } = await getOrCreateKeyPair();
  const msg = new TextEncoder().encode(chainHash);
  const sig = await ed.signAsync(msg, sk);
  return {
    chainHash,
    signature: bytesToHex(sig),
    publicKey: bytesToHex(pk),
    signedAt: new Date().toISOString(),
  };
}

export async function verifyChainSignature(
  chainHash: string,
  signatureHex: string,
  publicKeyHex: string,
): Promise<boolean> {
  try {
    const ok = await ed.verifyAsync(
      hexToBytes(signatureHex),
      new TextEncoder().encode(chainHash),
      hexToBytes(publicKeyHex),
    );
    return ok;
  } catch {
    return false;
  }
}

/**
 * Submit chainHash to a public OpenTimestamps calendar. Returns the binary
 * receipt (base64-encoded) so it can be stored alongside the session.
 *
 * Each calendar speaks a tiny REST surface: POST <calendar>/digest with the
 * raw 32-byte SHA-256 in the body. Response body = the binary OTS proof.
 */
export async function anchorToOpenTimestamps(
  chainHash: string,
): Promise<OtsReceipt | null> {
  if (!chainHash) return null;
  // OTS expects the raw digest of the message we are timestamping. Our
  // chainHash is already SHA-256 hex — convert back to 32 raw bytes.
  const digest = hexToBytes(chainHash);
  if (digest.length !== 32) return null;

  for (const cal of OTS_CALENDARS) {
    try {
      const resp = await fetch(`${cal}/digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: digest as unknown as BodyInit,
      });
      if (!resp.ok) continue;
      const buf = new Uint8Array(await resp.arrayBuffer());
      if (buf.length === 0) continue;
      return {
        calendar: cal,
        receiptBase64: bytesToBase64(buf),
        submittedAt: new Date().toISOString(),
        upgradedAt: null,
        bitcoinBlockHeight: null,
      };
    } catch {
      // try next calendar
    }
  }
  return null;
}

/**
 * Persist signature + OTS receipt for a session. Adds a row to
 * `evidence_signatures` (see supabase/evidence-signatures.sql). Idempotent:
 * row keyed on session_id.
 */
export async function persistSessionAttestation(
  sessionId: string,
  attestation: { signed: SignedSession; receipt: OtsReceipt | null },
): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'Supabase not configured' };
  const { data: userResp, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userResp?.user) return { ok: false, reason: 'Not signed in' };
  const { error } = await supabase.from('evidence_signatures').upsert(
    {
      session_id: sessionId,
      user_id: userResp.user.id,
      chain_hash: attestation.signed.chainHash,
      signature: attestation.signed.signature,
      public_key: attestation.signed.publicKey,
      signed_at: attestation.signed.signedAt,
      ots_calendar: attestation.receipt?.calendar ?? null,
      ots_receipt_base64: attestation.receipt?.receiptBase64 ?? null,
      ots_submitted_at: attestation.receipt?.submittedAt ?? null,
      ots_upgraded_at: attestation.receipt?.upgradedAt ?? null,
      ots_bitcoin_block: attestation.receipt?.bitcoinBlockHeight ?? null,
    },
    { onConflict: 'session_id' },
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** One-shot "sign + anchor + persist" used by syncSessionAsync. */
export async function attestSession(
  sessionId: string,
  chainHash: string,
): Promise<{ signed: SignedSession; receipt: OtsReceipt | null }> {
  const signed = await signChainHash(chainHash);
  const receipt = await anchorToOpenTimestamps(chainHash);
  await persistSessionAttestation(sessionId, { signed, receipt });
  return { signed, receipt };
}

/** Public-key export so verifiers can validate signatures off-device. */
export async function exportPublicKey(): Promise<string> {
  const { pk } = await getOrCreateKeyPair();
  return bytesToHex(pk);
}
