// BLE stalker-scan.
//
// Detects unwanted personal trackers (AirTag / SmartTag / Tile / generic
// Find-My / Galaxy SmartThings tags) that have been near the user for long
// enough across enough distinct places to be tracking them.
//
// Detection rule (Apple / Google co-spec):
//   A tracker is "suspicious" when the SAME advertising id has been observed
//   for ≥ 30 minutes total AND across ≥ 2 distinct locations more than 100 m
//   apart.
//
// Identifiers:
//   AirTag and SmartTag rotate their MAC every 15 min when separated from
//   their owner. Apple's Find My broadcast (0xff 0x4c 0x00 0x12 …) carries
//   a payload byte that we use as a stable bucket within the rotation
//   window. For Tile we use the 0x055D manufacturer prefix. Anything that
//   doesn't match a known prefix but persists in our window is still
//   flagged as "unknown persistent tracker".
//
// We persist sightings between scans (AsyncStorage) so the rule fires across
// app sessions, not just within a single foreground.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const STORE_KEY = '@hearme/stalker_sightings_v1';

// Manufacturer IDs (Bluetooth SIG company-id assignments, little-endian on the air).
const APPLE_MFR = 0x004c;
const SAMSUNG_MFR = 0x0075;
const TILE_MFR = 0x055d;
const GOOGLE_MFR = 0x00e0;

const MIN_SUSPICIOUS_DURATION_MS = 30 * 60 * 1000; // 30 min
const MIN_LOCATION_SEPARATION_M = 100;
const SIGHTING_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const SCAN_DURATION_MS = 12_000;
const EARTH_R = 6_371_000;

export type TrackerKind =
  | 'apple-find-my'
  | 'samsung-smart-tag'
  | 'tile'
  | 'google-find-my'
  | 'unknown-persistent';

export type Sighting = {
  /** Stable bucket — a hash of (manufacturer + payload prefix) so MAC rotation
   *  doesn't break correlation within a 15-min window. */
  trackerId: string;
  kind: TrackerKind;
  firstSeenAt: number;
  lastSeenAt: number;
  locations: { lat: number; lon: number; at: number }[];
  /** Device name for the user's reading benefit; not used for matching. */
  name: string | null;
};

export type StalkerVerdict = {
  trackerId: string;
  kind: TrackerKind;
  durationMs: number;
  locationsCount: number;
  spreadMeters: number;
  firstSeenAt: number;
  name: string | null;
};

type BleModule = typeof import('react-native-ble-plx');

let _module: BleModule | null = null;
let _manager: import('react-native-ble-plx').BleManager | null = null;

function loadModule(): BleModule | null {
  if (_module) return _module;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _module = require('react-native-ble-plx') as BleModule;
    return _module;
  } catch {
    _module = null;
    return null;
  }
}

function getManager(): import('react-native-ble-plx').BleManager | null {
  const mod = loadModule();
  if (!mod) return null;
  if (!_manager) _manager = new mod.BleManager();
  return _manager;
}

function decodeBase64(b64: string): Uint8Array {
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

/** Classify a manufacturer-data blob into a tracker kind, or null if unknown. */
export function classifyManufacturerData(bytes: Uint8Array): {
  kind: TrackerKind | null;
  bucket: string;
} {
  if (bytes.length < 2) return { kind: null, bucket: 'short' };
  const mfr = bytes[0] | (bytes[1] << 8);
  // For trackers, the first 1–4 bytes after the company ID are stable enough
  // for a 15-minute correlation window. We hex-stringify them as the bucket.
  const tail = bytes.slice(2, Math.min(bytes.length, 6));
  let tailHex = '';
  for (let i = 0; i < tail.length; i += 1) tailHex += tail[i].toString(16).padStart(2, '0');

  if (mfr === APPLE_MFR) {
    // Apple Find My broadcasts have type byte 0x12 followed by a status byte.
    if (bytes.length >= 4 && bytes[2] === 0x12) {
      return { kind: 'apple-find-my', bucket: `apple:${tailHex}` };
    }
    return { kind: null, bucket: `apple-other:${tailHex}` };
  }
  if (mfr === SAMSUNG_MFR) {
    return { kind: 'samsung-smart-tag', bucket: `samsung:${tailHex}` };
  }
  if (mfr === TILE_MFR) {
    return { kind: 'tile', bucket: `tile:${tailHex}` };
  }
  if (mfr === GOOGLE_MFR) {
    return { kind: 'google-find-my', bucket: `google:${tailHex}` };
  }
  return { kind: null, bucket: `mfr${mfr.toString(16)}:${tailHex}` };
}

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sa =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(sa)));
}

function maxSpread(locs: Sighting['locations']): number {
  let m = 0;
  for (let i = 0; i < locs.length; i += 1) {
    for (let j = i + 1; j < locs.length; j += 1) {
      const d = haversineMeters(locs[i], locs[j]);
      if (d > m) m = d;
    }
  }
  return m;
}

async function loadSightings(): Promise<Sighting[]> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Sighting[];
    const cutoff = Date.now() - SIGHTING_TTL_MS;
    return arr.filter((s) => s.lastSeenAt > cutoff);
  } catch {
    return [];
  }
}

async function saveSightings(s: Sighting[]): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(s));
}

/**
 * Run one stalker-scan pass: scan BLE for SCAN_DURATION_MS, merge sightings
 * into the persistent log, and return any verdicts that crossed the
 * suspicious thresholds during this pass.
 */
export async function runScan(): Promise<{
  newSuspicious: StalkerVerdict[];
  totalSightings: number;
}> {
  const mgr = getManager();
  if (!mgr) {
    return { newSuspicious: [], totalSightings: 0 };
  }
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    return { newSuspicious: [], totalSightings: 0 };
  }

  let here: { lat: number; lon: number } | null = null;
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    /* without location we still scan — but verdicts are weaker */
  }

  const stored = await loadSightings();
  const byId = new Map<string, Sighting>(stored.map((s) => [s.trackerId, s]));
  const wasSuspicious = new Set<string>();
  for (const s of stored) {
    if (verdictFromSighting(s)?.durationMs ?? 0) {
      const v = verdictFromSighting(s);
      if (v) wasSuspicious.add(s.trackerId);
    }
  }
  const newSightingsThisPass = new Set<string>();

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      mgr.stopDeviceScan();
      resolve();
    }, SCAN_DURATION_MS);
    mgr.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
      if (err) {
        clearTimeout(timer);
        mgr.stopDeviceScan();
        resolve();
        return;
      }
      if (!device?.manufacturerData) return;
      let bytes: Uint8Array;
      try {
        bytes = decodeBase64(device.manufacturerData);
      } catch {
        return;
      }
      const { kind, bucket } = classifyManufacturerData(bytes);
      // Only persist signals that look tracker-like. Random phones don't
      // need to be tracked here.
      if (!kind && bytes.length < 6) return;

      const id = bucket;
      const now = Date.now();
      const existing = byId.get(id);
      const sighting: Sighting = existing
        ? { ...existing, lastSeenAt: now }
        : {
            trackerId: id,
            kind: kind ?? 'unknown-persistent',
            firstSeenAt: now,
            lastSeenAt: now,
            locations: [],
            name: device.localName ?? device.name ?? null,
          };
      // Append location if we know one and it's different from the latest.
      if (here) {
        const last = sighting.locations[sighting.locations.length - 1];
        if (!last || haversineMeters(last, here) > 25) {
          sighting.locations.push({ lat: here.lat, lon: here.lon, at: now });
        }
      }
      byId.set(id, sighting);
      newSightingsThisPass.add(id);
    });
  });

  const updated = [...byId.values()];
  await saveSightings(updated);

  const newSuspicious: StalkerVerdict[] = [];
  for (const s of updated) {
    if (!newSightingsThisPass.has(s.trackerId) && wasSuspicious.has(s.trackerId)) continue;
    const v = verdictFromSighting(s);
    if (v && !wasSuspicious.has(s.trackerId)) newSuspicious.push(v);
  }

  return { newSuspicious, totalSightings: updated.length };
}

export function verdictFromSighting(s: Sighting): StalkerVerdict | null {
  const duration = s.lastSeenAt - s.firstSeenAt;
  if (duration < MIN_SUSPICIOUS_DURATION_MS) return null;
  const spread = maxSpread(s.locations);
  const distinctLocations = s.locations.length;
  if (distinctLocations < 2) return null;
  if (spread < MIN_LOCATION_SEPARATION_M) return null;
  return {
    trackerId: s.trackerId,
    kind: s.kind,
    durationMs: duration,
    locationsCount: distinctLocations,
    spreadMeters: spread,
    firstSeenAt: s.firstSeenAt,
    name: s.name,
  };
}

export async function getCurrentSuspicious(): Promise<StalkerVerdict[]> {
  const sightings = await loadSightings();
  const out: StalkerVerdict[] = [];
  for (const s of sightings) {
    const v = verdictFromSighting(s);
    if (v) out.push(v);
  }
  return out;
}

export async function dismissTracker(trackerId: string): Promise<void> {
  const sightings = await loadSightings();
  await saveSightings(sightings.filter((s) => s.trackerId !== trackerId));
}
