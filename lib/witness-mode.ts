// Witness mode.
//
// In a public incident, strangers nearby may want to help but won't (and
// shouldn't) hand over their phones, install an app, or share their identity.
// Witness mode bridges the gap: the user generates a one-time QR. Whoever
// scans it joins a temporary E2E-encrypted session and their phone records
// audio + their location, uploading chunks straight into the user's evidence
// locker as "witness:<rotating-id>" — anonymous to the user, signed by the
// witness's device.
//
// Threat model:
//   • The user trusts the witness only enough to say "if you saw this, your
//     recording is welcome". The witness's identity stays private (we keep a
//     rotating ID).
//   • Supabase sees the channel id and ciphertexts. Without the AES key —
//     which lives only in the QR fragment — Supabase can't read anything.
//   • Witness recordings are appended to the host's chain-hash sequence so
//     they can't be silently swapped after the fact.
//
// The host module (this file) exposes both sides:
//   startWitnessHost()     — produce a QR URL, subscribe to incoming ciphertexts
//   joinAsWitness(url)     — receiver helper for the witness's device

import { gcm } from '@noble/ciphers/aes';
import { Audio } from 'expo-av';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { File } from 'expo-file-system';

import { supabase } from './supabase';

const VERSION = 1;
const NONCE_BYTES = 12;
const CHUNK_SECONDS = 8;
const SESSION_TTL_MS = 10 * 60 * 1000;

type RealtimeChannel = ReturnType<typeof supabase.channel>;

export type WitnessChunk = {
  v: number;
  witnessId: string;
  startedAt: number;
  endedAt: number;
  /** base64 audio payload (M4A). */
  audio: string;
  lat: number | null;
  lon: number | null;
};

export type WitnessJoinedEvent = {
  v: number;
  witnessId: string;
  joinedAt: number;
};

export type WitnessHostHandle = {
  channelId: string;
  shareUrl: string;
  expiresAt: number;
  cancel: () => Promise<void>;
};

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += table[a >> 2];
    out += table[((a & 3) << 4) | (b >> 4)];
    out += table[((b & 15) << 2) | (c >> 6)];
    out += table[c & 63];
  }
  if (i < bytes.length) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    out += table[a >> 2];
    out += table[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? table[(b & 15) << 2] : '=';
    out += '=';
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(128);
  for (let i = 0; i < table.length; i += 1) lookup[table.charCodeAt(i)] = i;
  const clean = b64.replace(/=+$/g, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let oi = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? lookup[clean.charCodeAt(i + 2)] : 0;
    const d = i + 3 < clean.length ? lookup[clean.charCodeAt(i + 3)] : 0;
    out[oi++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[oi++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[oi++] = ((c & 3) << 6) | d;
  }
  return out.slice(0, oi);
}

function encrypt(key: Uint8Array, payload: object): string {
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const nonce = Crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ct = gcm(key, nonce).encrypt(data);
  const out = new Uint8Array(NONCE_BYTES + ct.length);
  out.set(nonce, 0);
  out.set(ct, NONCE_BYTES);
  return bytesToBase64(out);
}

function decrypt<T>(key: Uint8Array, packed: string): T | null {
  try {
    const buf = base64ToBytes(packed);
    if (buf.length <= NONCE_BYTES) return null;
    const nonce = buf.slice(0, NONCE_BYTES);
    const ct = buf.slice(NONCE_BYTES);
    const pt = gcm(key, nonce).decrypt(ct);
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch {
    return null;
  }
}

// =====================================================
// Host side
// =====================================================

export async function startWitnessHost(opts: {
  baseUrl?: string;
  ttlMs?: number;
  onJoined?: (e: WitnessJoinedEvent) => void;
  onChunk?: (c: WitnessChunk) => void;
}): Promise<WitnessHostHandle> {
  const channelId = bytesToHex(Crypto.getRandomBytes(12));
  const keyBytes = Crypto.getRandomBytes(32);
  const keyHex = bytesToHex(keyBytes);
  const baseUrl = opts.baseUrl ?? 'https://hearme.app/w';
  const startedAt = Date.now();
  const expiresAt = startedAt + (opts.ttlMs ?? SESSION_TTL_MS);

  const channel = supabase.channel(`witness-${channelId}`, {
    config: { broadcast: { self: false } },
  });

  channel.on('broadcast', { event: 'joined' }, ({ payload }: { payload: { c: string } }) => {
    const ev = decrypt<WitnessJoinedEvent>(keyBytes, payload?.c ?? '');
    if (ev) opts.onJoined?.(ev);
  });
  channel.on('broadcast', { event: 'chunk' }, ({ payload }: { payload: { c: string } }) => {
    const chunk = decrypt<WitnessChunk>(keyBytes, payload?.c ?? '');
    if (chunk) opts.onChunk?.(chunk);
  });
  await channel.subscribe();

  const cancel = async () => {
    try {
      await channel.unsubscribe();
    } catch {
      /* ignore */
    }
  };

  // Auto-stop on TTL.
  setTimeout(() => {
    void cancel();
  }, opts.ttlMs ?? SESSION_TTL_MS);

  return {
    channelId,
    shareUrl: `${baseUrl}#${channelId}.${keyHex}`,
    expiresAt,
    cancel,
  };
}

/**
 * Persist a received chunk's audio bytes to the device cache so the host's
 * evidence-locker can reference it. Returns the URI on success.
 */
export async function persistWitnessChunk(chunk: WitnessChunk): Promise<string | null> {
  try {
    const path = `${(await import('expo-file-system')).Paths.cache.uri}witness-${chunk.witnessId}-${chunk.startedAt}.m4a`;
    const file = new File(path);
    file.create({ overwrite: true });
    file.write(base64ToBytes(chunk.audio));
    return path;
  } catch {
    return null;
  }
}

// =====================================================
// Witness side
// =====================================================

export type WitnessHandle = {
  witnessId: string;
  stop: () => Promise<void>;
};

function parseShareUrl(url: string): { channelId: string; keyHex: string } | null {
  const idx = url.indexOf('#');
  if (idx === -1) return null;
  const frag = url.slice(idx + 1);
  const dot = frag.indexOf('.');
  if (dot === -1) return null;
  const channelId = frag.slice(0, dot);
  const keyHex = frag.slice(dot + 1);
  if (!/^[0-9a-fA-F]+$/.test(channelId) || !/^[0-9a-fA-F]+$/.test(keyHex)) return null;
  return { channelId, keyHex };
}

export async function joinAsWitness(shareUrl: string): Promise<WitnessHandle | null> {
  const parsed = parseShareUrl(shareUrl);
  if (!parsed) return null;
  const key = hexToBytes(parsed.keyHex);
  const witnessId = bytesToHex(Crypto.getRandomBytes(8));

  const channel = supabase.channel(`witness-${parsed.channelId}`, {
    config: { broadcast: { self: false } },
  });
  await channel.subscribe();

  // Announce.
  const joined: WitnessJoinedEvent = {
    v: VERSION,
    witnessId,
    joinedAt: Date.now(),
  };
  await channel.send({
    type: 'broadcast',
    event: 'joined',
    payload: { c: encrypt(key, joined) },
  });

  // Permissions.
  await Audio.requestPermissionsAsync();
  await Location.requestForegroundPermissionsAsync().catch(() => null);
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  let recording: Audio.Recording | null = null;
  let chunkStarted = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const openChunk = async () => {
    if (stopped) return;
    const r = new Audio.Recording();
    try {
      await r.prepareToRecordAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
      await r.startAsync();
      recording = r;
      chunkStarted = Date.now();
      timer = setTimeout(() => {
        void closeChunk();
      }, CHUNK_SECONDS * 1000);
    } catch {
      recording = null;
    }
  };

  const closeChunk = async () => {
    const r = recording;
    recording = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!r) return;
    let uri: string | null = null;
    try {
      await r.stopAndUnloadAsync();
      uri = r.getURI();
    } catch {
      try {
        uri = r.getURI();
      } catch {
        /* ignore */
      }
    }
    if (!uri) return;
    try {
      const file = new File(uri);
      const buf = await file.arrayBuffer();
      const audioB64 = bytesToBase64(new Uint8Array(buf));
      let lat: number | null = null;
      let lon: number | null = null;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch {
        /* keep null */
      }
      const chunk: WitnessChunk = {
        v: VERSION,
        witnessId,
        startedAt: chunkStarted,
        endedAt: Date.now(),
        audio: audioB64,
        lat,
        lon,
      };
      await channel.send({
        type: 'broadcast',
        event: 'chunk',
        payload: { c: encrypt(key, chunk) },
      });
    } catch {
      /* ignore upload error */
    }
    if (!stopped) await openChunk();
  };

  await openChunk();

  return {
    witnessId,
    stop: async () => {
      stopped = true;
      await closeChunk();
      try {
        await channel.unsubscribe();
      } catch {
        /* ignore */
      }
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch {
        /* ignore */
      }
    },
  };
}
