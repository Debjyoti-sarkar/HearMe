// Isolation score.
//
// Combines five cheap signals into a 0–100 score for "how alone is this user
// right now". A higher score means: less crowd, less light, less ambient
// sound, slow / stationary, late hour. The score feeds:
//   • the NeuroBand fusion engine (raises sensitivity at 60+),
//   • the journey-monitor (offers to start auto-checkin at 70+),
//   • a home-screen widget so the user knows when the app is "more alert".
//
// Inputs are collected by `gatherInputs()`; the scoring rule is the pure
// `scoreIsolation()` so it's testable without side-effects.

import { Audio } from 'expo-av';
import { LightSensor } from 'expo-sensors';
import { Platform } from 'react-native';

type BleModule = typeof import('react-native-ble-plx');

let _module: BleModule | null = null;
let _manager: import('react-native-ble-plx').BleManager | null = null;

function getManager(): import('react-native-ble-plx').BleManager | null {
  if (_manager) return _manager;
  try {
    if (!_module) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _module = require('react-native-ble-plx') as BleModule;
    }
    _manager = new _module.BleManager();
    return _manager;
  } catch {
    return null;
  }
}

export type IsolationInputs = {
  /** Distinct BLE devices observed in a short scan window. */
  bleNeighborCount: number;
  /** Average ambient dBFS over a short window (negative number). */
  ambientDbfs: number | null;
  /** Lux from ambient light sensor (Android). */
  lux: number | null;
  /** Speed in m/s — 0 means stationary. */
  speedMps: number | null;
  /** 24-hour clock hour. 0–23. */
  hour: number;
  /** True if the user is on a known safe-zone location. Reduces score. */
  inSafeZone: boolean;
};

export type IsolationScore = {
  total: number; // 0–100
  contributions: Record<keyof IsolationInputs, number>;
  level: 'low' | 'medium' | 'high';
};

/** Pure scoring function — no I/O. */
export function scoreIsolation(inputs: IsolationInputs): IsolationScore {
  // Each contribution is 0–30; total clipped to 100.
  const c: Record<keyof IsolationInputs, number> = {
    bleNeighborCount: 0,
    ambientDbfs: 0,
    lux: 0,
    speedMps: 0,
    hour: 0,
    inSafeZone: 0,
  };

  // BLE neighbours: 0 → 25, 1 → 20, 2 → 15, 3 → 10, 4 → 5, 5+ → 0.
  c.bleNeighborCount = Math.max(0, 25 - 5 * inputs.bleNeighborCount);

  // Ambient: quieter than -55 dBFS = 20, -45 = 10, -35 = 0.
  if (inputs.ambientDbfs != null) {
    if (inputs.ambientDbfs < -55) c.ambientDbfs = 20;
    else if (inputs.ambientDbfs < -45) c.ambientDbfs = 10;
    else c.ambientDbfs = 0;
  } else {
    c.ambientDbfs = 5;
  }

  // Lux: <5 = 20, <50 = 10, else 0.
  if (inputs.lux != null) {
    if (inputs.lux < 5) c.lux = 20;
    else if (inputs.lux < 50) c.lux = 10;
    else c.lux = 0;
  } else {
    c.lux = 5; // unknown — small bias toward "alert"
  }

  // Speed: 0 is "stationary, possibly waiting alone" — up-weighted.
  // A walking pace (1–1.5 m/s) is fine; >5 m/s means in vehicle (less weight).
  if (inputs.speedMps != null) {
    if (inputs.speedMps < 0.2) c.speedMps = 15;
    else if (inputs.speedMps < 1.5) c.speedMps = 10;
    else if (inputs.speedMps > 5) c.speedMps = 2;
    else c.speedMps = 5;
  }

  // Hour: late night and very early morning add weight.
  const h = inputs.hour;
  if (h >= 22 || h < 5) c.hour = 15;
  else if (h >= 20 || h < 7) c.hour = 8;
  else c.hour = 0;

  // Known safe-zone subtracts.
  c.inSafeZone = inputs.inSafeZone ? -25 : 0;

  const raw = Object.values(c).reduce((s, v) => s + v, 0);
  const total = Math.max(0, Math.min(100, Math.round(raw)));
  const level: IsolationScore['level'] = total >= 70 ? 'high' : total >= 40 ? 'medium' : 'low';

  return { total, contributions: c, level };
}

// =====================================================
// Input gathering
// =====================================================

async function scanBleNeighbors(timeoutMs = 4_000): Promise<number> {
  const mgr = getManager();
  if (!mgr) return -1;
  return new Promise<number>((resolve) => {
    const seen = new Set<string>();
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      mgr.stopDeviceScan();
      resolve(seen.size);
    };
    const timer = setTimeout(finish, timeoutMs);
    try {
      mgr.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
        if (err) {
          clearTimeout(timer);
          finish();
          return;
        }
        if (device) seen.add(device.id);
      });
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

async function probeAmbientDbfs(timeoutMs = 1_500): Promise<number | null> {
  try {
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) return null;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync({
      ...Audio.RecordingOptionsPresets.LOW_QUALITY,
      isMeteringEnabled: true,
    });
    await rec.startAsync();
    let sum = 0;
    let n = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const status = await rec.getStatusAsync();
      const m = (status as { metering?: number }).metering;
      if (typeof m === 'number') {
        sum += m;
        n += 1;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    try {
      await rec.stopAndUnloadAsync();
    } catch {
      /* ignore */
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch {
      /* ignore */
    }
    return n > 0 ? sum / n : null;
  } catch {
    return null;
  }
}

async function probeLux(timeoutMs = 700): Promise<number | null> {
  if (Platform.OS !== 'android') return null;
  return new Promise<number | null>((resolve) => {
    let lux: number | null = null;
    let sub: { remove: () => void } | null = null;
    const t = setTimeout(() => {
      sub?.remove();
      resolve(lux);
    }, timeoutMs);
    try {
      sub = LightSensor.addListener((reading) => {
        if (typeof reading.illuminance === 'number') {
          lux = reading.illuminance;
        }
        clearTimeout(t);
        sub?.remove();
        resolve(lux);
      });
      LightSensor.setUpdateInterval(200);
    } catch {
      clearTimeout(t);
      resolve(null);
    }
  });
}

export async function gatherInputs(opts?: {
  speedMps?: number;
  inSafeZone?: boolean;
}): Promise<IsolationInputs> {
  const [bleNeighborCount, ambientDbfs, lux] = await Promise.all([
    scanBleNeighbors().catch(() => -1),
    probeAmbientDbfs().catch(() => null),
    probeLux().catch(() => null),
  ]);
  const hour = new Date().getHours();
  return {
    bleNeighborCount: Math.max(0, bleNeighborCount),
    ambientDbfs,
    lux,
    speedMps: opts?.speedMps ?? null,
    hour,
    inSafeZone: opts?.inSafeZone ?? false,
  };
}

/** One-shot convenience that gathers inputs and returns the score. */
export async function computeIsolation(opts?: {
  speedMps?: number;
  inSafeZone?: boolean;
}): Promise<IsolationScore> {
  return scoreIsolation(await gatherInputs(opts));
}
