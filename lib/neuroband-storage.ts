import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import type { BioFrame, MotionClass } from './neuroband-ble';

/**
 * Per-user physiological baselines, computed during the 24-hour calibration
 * window and updated continuously thereafter via Welford's online algorithm.
 *
 * All thresholds in the fusion engine are expressed *relative* to these
 * baselines — that's what makes the 2-of-5 rule generalise across users.
 */
export type NeuroBandBaselines = {
  hrRestMean: number; // bpm, motion=still
  hrRestVar: number;
  hrRestN: number;
  gsrTonicMean: number; // µS, slow-moving baseline
  gsrTonicN: number;
  skinTempMean: number; // °C, 5-minute rolling average
  skinTempN: number;
  semgRestingMean: number; // 0..255 envelope
  semgRestingVar: number;
  semgRestingN: number;
  /** Last update timestamp (epoch ms). */
  updatedAt: number;
};

export const EMPTY_BASELINES: NeuroBandBaselines = {
  hrRestMean: 70,
  hrRestVar: 25,
  hrRestN: 0,
  gsrTonicMean: 2.5,
  gsrTonicN: 0,
  skinTempMean: 33.0,
  skinTempN: 0,
  semgRestingMean: 30,
  semgRestingVar: 100,
  semgRestingN: 0,
  updatedAt: 0,
};

export type NeuroBandPairRecord = {
  serial: string;
  /** BLE peripheral ID — opaque, platform-specific. */
  peripheralId: string;
  /** Device firmware version reported during pairing. */
  firmware: string;
  pairedAt: number;
  /** Last successful frame received, epoch ms. Drives "online" indicator. */
  lastSeenAt: number;
  /** Highest counter value accepted — replay-protection floor. */
  lastCounter: number;
};

const KEYS = {
  baselines: '@hearme/neuroband_baselines_v1',
  pair: '@hearme/neuroband_pair_v1',
  log: '@hearme/neuroband_event_log_v1',
} as const;

const SECURE_KEYS = {
  /** PSK + derived session key — never in AsyncStorage. */
  sessionKey: 'hearme_neuroband_session_key',
  psk: 'hearme_neuroband_psk',
} as const;

// ---------- Baselines ----------

export async function loadBaselines(): Promise<NeuroBandBaselines> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.baselines);
    if (!raw) return { ...EMPTY_BASELINES };
    const j = JSON.parse(raw) as Partial<NeuroBandBaselines>;
    return { ...EMPTY_BASELINES, ...j };
  } catch {
    return { ...EMPTY_BASELINES };
  }
}

export async function saveBaselines(b: NeuroBandBaselines): Promise<void> {
  await AsyncStorage.setItem(KEYS.baselines, JSON.stringify(b));
}

export async function clearBaselines(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.baselines);
}

/**
 * Welford's online mean+variance — numerically stable single-pass update.
 * Applied per BioFrame when motion gating allows.
 */
export function updateBaselines(
  prev: NeuroBandBaselines,
  frame: BioFrame,
): NeuroBandBaselines {
  const next = { ...prev, updatedAt: Date.now() };

  // HR baseline only updates when the user is still or walking — running HR
  // would poison the rest baseline.
  if (frame.motion === 'still' || frame.motion === 'walk') {
    const n = next.hrRestN + 1;
    const delta = frame.hr - next.hrRestMean;
    const mean = next.hrRestMean + delta / n;
    const m2 = next.hrRestVar * Math.max(1, next.hrRestN) + delta * (frame.hr - mean);
    next.hrRestN = n;
    next.hrRestMean = mean;
    next.hrRestVar = m2 / n;
  }

  // GSR tonic baseline — slow EMA, captures the user's resting conductance.
  {
    const n = next.gsrTonicN + 1;
    const alpha = 1 / Math.min(n, 600); // ~10-min effective window at 1 Hz
    next.gsrTonicMean = next.gsrTonicMean + alpha * (frame.gsrUs - next.gsrTonicMean);
    next.gsrTonicN = n;
  }

  // Skin temp — 5-minute EMA.
  {
    const n = next.skinTempN + 1;
    const alpha = 1 / Math.min(n, 300);
    next.skinTempMean =
      next.skinTempMean + alpha * (frame.skinTempC - next.skinTempMean);
    next.skinTempN = n;
  }

  // sEMG resting envelope — only update when motion is still (clenched
  // forearm during a run is normal arousal, not duress).
  if (frame.motion === 'still') {
    const n = next.semgRestingN + 1;
    const delta = frame.semg - next.semgRestingMean;
    const mean = next.semgRestingMean + delta / n;
    const m2 =
      next.semgRestingVar * Math.max(1, next.semgRestingN) +
      delta * (frame.semg - mean);
    next.semgRestingN = n;
    next.semgRestingMean = mean;
    next.semgRestingVar = m2 / n;
  }

  return next;
}

// ---------- Pairing record ----------

export async function loadPairRecord(): Promise<NeuroBandPairRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.pair);
    if (!raw) return null;
    return JSON.parse(raw) as NeuroBandPairRecord;
  } catch {
    return null;
  }
}

export async function savePairRecord(r: NeuroBandPairRecord): Promise<void> {
  await AsyncStorage.setItem(KEYS.pair, JSON.stringify(r));
}

export async function clearPairRecord(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.pair);
  await SecureStore.deleteItemAsync(SECURE_KEYS.sessionKey).catch(() => {});
  await SecureStore.deleteItemAsync(SECURE_KEYS.psk).catch(() => {});
}

// ---------- Secrets (SecureStore) ----------

export async function setPsk(psk: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.psk, psk);
}

export async function getPsk(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_KEYS.psk);
}

export async function setSessionKey(keyHex: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.sessionKey, keyHex);
}

export async function getSessionKey(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_KEYS.sessionKey);
}

// ---------- Event log (debug / threshold tuning) ----------

export type NeuroBandEvent = {
  ts: number;
  kind: 'fire' | 'cancel' | 'cap-tap' | 'paired' | 'unpaired' | 'workout-on' | 'workout-off';
  markers?: number; // bitmap when kind === 'fire'
  hr?: number;
  gsrUs?: number;
  skinTempC?: number;
  motion?: MotionClass;
  note?: string;
};

const MAX_LOG = 200;

export async function appendEvent(e: NeuroBandEvent): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.log);
    const log = raw ? (JSON.parse(raw) as NeuroBandEvent[]) : [];
    log.unshift(e);
    await AsyncStorage.setItem(KEYS.log, JSON.stringify(log.slice(0, MAX_LOG)));
  } catch {
    /* logging is best-effort */
  }
}

export async function loadEvents(): Promise<NeuroBandEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.log);
    return raw ? (JSON.parse(raw) as NeuroBandEvent[]) : [];
  } catch {
    return [];
  }
}

export async function clearEvents(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.log);
}
