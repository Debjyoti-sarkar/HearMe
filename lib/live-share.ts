// Live-share session — end-to-end encrypted location (and optional audio)
// stream sent to trusted contacts.
//
// Architecture:
//   • The user creates a session. We generate a random 32-byte secret. The
//     first 16 bytes identify the Supabase realtime channel; the latter 16
//     bytes are the AES-256-GCM key. The full secret only travels in the URL
//     fragment (#…), which browsers never send to servers.
//   • The user's phone publishes encrypted "tick" messages (location, optional
//     audio chunk, battery, ack of received pings) every N seconds.
//   • The recipient subscribes to the same channel, decrypts, and renders.
//   • Recipients can send "ack" or "are-you-safe?" messages back; the sender's
//     UI shows who opened the link.
//
// What Supabase sees: opaque ciphertext + the channel id. It cannot read
// locations, audio, or the AES key.
//
// What needs to land outside this file to make it user-visible:
//   • A receiver web page or in-app screen that reads the URL fragment, joins
//     the channel, and decrypts. We ship the receive() helper here so any
//     surface (RN screen, HTML page) can use it.

import { gcm } from '@noble/ciphers/aes';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';

import { supabase } from './supabase';

const VERSION = 1;
const TICK_INTERVAL_MS = 5_000;
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const NONCE_BYTES = 12; // AES-GCM standard

type RealtimeChannel = ReturnType<typeof supabase.channel>;

export type LiveTick = {
  v: number;
  t: number;
  lat: number;
  lon: number;
  acc: number | null;
  bat: number | null;
  speed: number | null;
  audio?: string; // base64 audio chunk, optional
};

export type LiveAck = {
  v: number;
  t: number;
  contactId: string;
  contactName: string;
  type: 'opened' | 'safe-check' | 'on-the-way';
};

export type LiveSession = {
  channelId: string;
  /** AES-256 key as hex; NEVER sent to a server. */
  keyHex: string;
  shareUrl: string;
  startedAt: number;
  expiresAt: number;
};

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
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

function encrypt(key: Uint8Array, plaintext: object): string {
  const json = JSON.stringify(plaintext);
  const data = new TextEncoder().encode(json);
  const nonce = new Uint8Array(NONCE_BYTES);
  const random = Crypto.getRandomValues(nonce);
  const cipher = gcm(key, random);
  const ct = cipher.encrypt(data);
  const out = new Uint8Array(NONCE_BYTES + ct.length);
  out.set(random, 0);
  out.set(ct, NONCE_BYTES);
  return bytesToBase64(out);
}

function decrypt<T>(key: Uint8Array, packed: string): T | null {
  try {
    const buf = base64ToBytes(packed);
    if (buf.length <= NONCE_BYTES) return null;
    const nonce = buf.slice(0, NONCE_BYTES);
    const ct = buf.slice(NONCE_BYTES);
    const cipher = gcm(key, nonce);
    const pt = cipher.decrypt(ct);
    const json = new TextDecoder().decode(pt);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

const STATE: {
  session: LiveSession | null;
  channel: RealtimeChannel | null;
  key: Uint8Array | null;
  ticker: ReturnType<typeof setInterval> | null;
  acks: LiveAck[];
  onAck: ((a: LiveAck) => void) | null;
} = {
  session: null,
  channel: null,
  key: null,
  ticker: null,
  acks: [],
  onAck: null,
};

/**
 * Start a new live-share session. Returns the share URL — give that to the
 * trusted contact via SMS / WhatsApp / etc. The fragment portion (after #)
 * carries the AES key and never reaches a server.
 */
export async function startLiveShare(opts?: {
  baseUrl?: string;
  ttlMs?: number;
  onAck?: (ack: LiveAck) => void;
}): Promise<LiveSession> {
  if (STATE.session) await stopLiveShare();
  const channelBytes = Crypto.getRandomBytes(16);
  const keyBytes = Crypto.getRandomBytes(32);
  const channelId = bytesToHex(channelBytes);
  const keyHex = bytesToHex(keyBytes);
  const baseUrl = opts?.baseUrl ?? 'https://hearme.app/live';
  const startedAt = Date.now();
  const expiresAt = startedAt + (opts?.ttlMs ?? SESSION_TTL_MS);

  const session: LiveSession = {
    channelId,
    keyHex,
    shareUrl: `${baseUrl}#${channelId}.${keyHex}`,
    startedAt,
    expiresAt,
  };

  const channel = supabase.channel(`live-${channelId}`, {
    config: { broadcast: { ack: false, self: false } },
  });

  channel.on('broadcast', { event: 'ack' }, ({ payload }: { payload: { c: string } }) => {
    const ack = decrypt<LiveAck>(keyBytes, payload?.c ?? '');
    if (!ack) return;
    STATE.acks.push(ack);
    STATE.onAck?.(ack);
  });

  await channel.subscribe();

  STATE.session = session;
  STATE.channel = channel;
  STATE.key = keyBytes;
  STATE.acks = [];
  STATE.onAck = opts?.onAck ?? null;

  // Foreground location permission for the broadcaster.
  try {
    await Location.requestForegroundPermissionsAsync();
  } catch {
    /* user can deny; we still try */
  }

  STATE.ticker = setInterval(() => {
    void publishTick().catch(() => {
      /* swallow */
    });
  }, TICK_INTERVAL_MS);

  // Send an initial tick immediately so receivers see something.
  void publishTick();

  return session;
}

async function publishTick(): Promise<void> {
  if (!STATE.session || !STATE.channel || !STATE.key) return;
  if (Date.now() > STATE.session.expiresAt) {
    await stopLiveShare();
    return;
  }
  let pos: Location.LocationObject | null = null;
  try {
    pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  } catch {
    /* will publish a tick with null lat/lon */
  }
  const tick: LiveTick = {
    v: VERSION,
    t: Date.now(),
    lat: pos?.coords.latitude ?? Number.NaN,
    lon: pos?.coords.longitude ?? Number.NaN,
    acc: pos?.coords.accuracy ?? null,
    bat: null,
    speed: pos?.coords.speed ?? null,
  };
  const c = encrypt(STATE.key, tick);
  await STATE.channel.send({
    type: 'broadcast',
    event: 'tick',
    payload: { c },
  });
}

export async function stopLiveShare(): Promise<void> {
  if (STATE.ticker) {
    clearInterval(STATE.ticker);
    STATE.ticker = null;
  }
  if (STATE.channel) {
    try {
      await STATE.channel.unsubscribe();
    } catch {
      /* ignore */
    }
    STATE.channel = null;
  }
  STATE.session = null;
  STATE.key = null;
  STATE.acks = [];
  STATE.onAck = null;
}

export function getCurrentLiveSession(): LiveSession | null {
  return STATE.session;
}

export function getAcks(): LiveAck[] {
  return [...STATE.acks];
}

// =====================================================
// Receiver helpers
// =====================================================

export type LiveReceiver = {
  onTick: (cb: (tick: LiveTick) => void) => void;
  ack: (ack: Omit<LiveAck, 'v' | 't'>) => Promise<void>;
  stop: () => Promise<void>;
};

/**
 * Parse a shared URL fragment back into a {channelId, keyHex} pair. Used by
 * the receiver side. The fragment format is `#<channelId>.<keyHex>`.
 */
export function parseShareUrl(url: string): { channelId: string; keyHex: string } | null {
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

/**
 * Subscribe to a live session (receiver side). Decrypts ticks and exposes
 * an ack helper.
 */
export async function joinLiveShare(
  shareUrl: string,
  contact: { id: string; name: string },
): Promise<LiveReceiver | null> {
  const parsed = parseShareUrl(shareUrl);
  if (!parsed) return null;
  const key = hexToBytes(parsed.keyHex);
  let cb: ((tick: LiveTick) => void) | null = null;

  const channel = supabase.channel(`live-${parsed.channelId}`, {
    config: { broadcast: { ack: false, self: false } },
  });

  channel.on('broadcast', { event: 'tick' }, ({ payload }: { payload: { c: string } }) => {
    const tick = decrypt<LiveTick>(key, payload?.c ?? '');
    if (tick) cb?.(tick);
  });

  await channel.subscribe();

  // Auto-send "opened" ack so the sender knows we're watching.
  const openedAck: LiveAck = {
    v: VERSION,
    t: Date.now(),
    contactId: contact.id,
    contactName: contact.name,
    type: 'opened',
  };
  await channel.send({
    type: 'broadcast',
    event: 'ack',
    payload: { c: encrypt(key, openedAck) },
  });

  return {
    onTick: (handler) => {
      cb = handler;
    },
    ack: async (partial) => {
      const ack: LiveAck = { v: VERSION, t: Date.now(), ...partial };
      await channel.send({
        type: 'broadcast',
        event: 'ack',
        payload: { c: encrypt(key, ack) },
      });
    },
    stop: async () => {
      try {
        await channel.unsubscribe();
      } catch {
        /* ignore */
      }
    },
  };
}
