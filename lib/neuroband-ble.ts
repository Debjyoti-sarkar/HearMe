import { Platform } from 'react-native';

import {
  loadPairRecord,
  savePairRecord,
  type NeuroBandPairRecord,
} from './neuroband-storage';

/**
 * NeuroBand BLE bridge.
 *
 * The band exposes a single GATT service ("HearMe Bio Service") with four
 * characteristics. We subscribe to bio_frame (1 Hz notify) and silent_trigger
 * (sparse notify), and write to command for haptic / OTA hand-off.
 *
 * Implementation strategy:
 *  - `react-native-ble-plx` is loaded *lazily* inside a try/catch. In Expo Go
 *    or any build that doesn't include the native module, the import fails
 *    silently and we automatically fall back to the mock simulator. This lets
 *    you build the entire UI + fusion engine before flashing any firmware.
 *  - Once you run `expo prebuild` and a custom dev client, the same code
 *    talks to real hardware with no edits.
 */

// ---------- GATT identifiers ----------
// Generated under the HearMe-reserved 128-bit base UUID
//   16-bit short: 8001..8004 → service UUID …8000

export const HEARME_SERVICE_UUID = 'a89f3000-e5b8-4f7c-9e02-9b0c54a4e201';
export const BIO_FRAME_CHAR_UUID = 'a89f8001-e5b8-4f7c-9e02-9b0c54a4e201';
export const SILENT_TRIGGER_CHAR_UUID = 'a89f8002-e5b8-4f7c-9e02-9b0c54a4e201';
export const COMMAND_CHAR_UUID = 'a89f8003-e5b8-4f7c-9e02-9b0c54a4e201';
export const DEVICE_INFO_CHAR_UUID = 'a89f8004-e5b8-4f7c-9e02-9b0c54a4e201';

// ---------- Frame types ----------

export type MotionClass = 'still' | 'walk' | 'run' | 'fall' | 'unknown';

export type BioFrame = {
  /** 16-bit rolling sequence number (per-connection). */
  seq: number;
  hr: number;
  hrvRmssd: number;
  spo2: number;
  /** Skin conductance in microsiemens (µS). */
  gsrUs: number;
  /** Skin temperature in °C. */
  skinTempC: number;
  motion: MotionClass;
  /** sEMG envelope, 0..255 normalized. */
  semg: number;
  /** Battery percent, 0..100. */
  battery: number;
  flags: {
    charging: boolean;
    tamper: boolean;
    lowBattery: boolean;
  };
  /** Monotonic 32-bit counter — replay protection. */
  counter: number;
  /** Firmware minor version reported in this frame. */
  fwMinor: number;
  /** Phone-side wall-clock timestamp when the frame arrived. */
  receivedAt: number;
};

export type SilentTrigger = {
  tripleTap: boolean;
  autoFired: boolean;
  tamper: boolean;
  receivedAt: number;
};

export type ConnectionState =
  | 'disabled'
  | 'idle'
  | 'scanning'
  | 'pairing'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type ScanResult = {
  peripheralId: string;
  name: string | null;
  rssi: number;
  /** First 4 chars of advertised serial — band shows this in pairing UI. */
  serialPrefix: string | null;
};

// ---------- Frame decoder ----------

const MOTION_LOOKUP: MotionClass[] = ['still', 'walk', 'run', 'fall', 'unknown'];

/**
 * Decode the 20-byte BioFrame defined in the integration spec.
 * Throws on malformed input — caller should treat that as a dropped frame.
 */
export function decodeBioFrame(bytes: Uint8Array): BioFrame {
  if (bytes.length < 20) {
    throw new Error(`BioFrame too short: ${bytes.length}`);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const seq = dv.getUint16(0, true);
  const hr = dv.getUint8(2);
  const hrvRmssd = dv.getUint8(3);
  const spo2 = dv.getUint8(4);
  const gsrRaw = dv.getUint16(5, true);
  const tempRaw = dv.getInt16(7, true);
  const motionByte = dv.getUint8(9);
  const semg = dv.getUint8(10);
  const battery = dv.getUint8(11);
  const flags = dv.getUint8(12);
  const counter = dv.getUint32(13, true);
  const fwMinor = dv.getUint8(17);

  return {
    seq,
    hr,
    hrvRmssd,
    spo2,
    gsrUs: gsrRaw / 100,
    skinTempC: tempRaw / 10,
    motion: MOTION_LOOKUP[motionByte] ?? 'unknown',
    semg,
    battery,
    flags: {
      charging: (flags & 0x01) !== 0,
      tamper: (flags & 0x02) !== 0,
      lowBattery: (flags & 0x04) !== 0,
    },
    counter,
    fwMinor,
    receivedAt: Date.now(),
  };
}

/** Encode a BioFrame back to bytes — used by the mock simulator and tests. */
export function encodeBioFrame(f: BioFrame): Uint8Array {
  const bytes = new Uint8Array(20);
  const dv = new DataView(bytes.buffer);
  dv.setUint16(0, f.seq & 0xffff, true);
  dv.setUint8(2, Math.max(0, Math.min(255, Math.round(f.hr))));
  dv.setUint8(3, Math.max(0, Math.min(255, Math.round(f.hrvRmssd))));
  dv.setUint8(4, Math.max(0, Math.min(255, Math.round(f.spo2))));
  dv.setUint16(5, Math.max(0, Math.min(65535, Math.round(f.gsrUs * 100))), true);
  dv.setInt16(7, Math.max(-32768, Math.min(32767, Math.round(f.skinTempC * 10))), true);
  dv.setUint8(9, Math.max(0, MOTION_LOOKUP.indexOf(f.motion)));
  dv.setUint8(10, Math.max(0, Math.min(255, Math.round(f.semg))));
  dv.setUint8(11, Math.max(0, Math.min(100, Math.round(f.battery))));
  let flags = 0;
  if (f.flags.charging) flags |= 0x01;
  if (f.flags.tamper) flags |= 0x02;
  if (f.flags.lowBattery) flags |= 0x04;
  dv.setUint8(12, flags);
  dv.setUint32(13, f.counter >>> 0, true);
  dv.setUint8(17, f.fwMinor);
  return bytes;
}

export function decodeSilentTrigger(bytes: Uint8Array): SilentTrigger {
  const b = bytes[0] ?? 0;
  return {
    tripleTap: (b & 0x01) !== 0,
    autoFired: (b & 0x02) !== 0,
    tamper: (b & 0x04) !== 0,
    receivedAt: Date.now(),
  };
}

// ---------- Subscription contract ----------

export type BioSubscription = {
  remove: () => void;
};

export type BioListeners = {
  onFrame: (frame: BioFrame) => void;
  onTrigger: (trigger: SilentTrigger) => void;
  onState: (state: ConnectionState, info?: string) => void;
};

// ---------- Lazy load of react-native-ble-plx ----------
//
// We don't `import` the library at module top-level because (a) it requires
// native code that isn't present in Expo Go, and (b) we want the rest of the
// app to keep working in mock mode regardless. Instead we attempt a require
// inside a try/catch. If it fails, we expose a flag that the UI uses to nudge
// the user toward a custom dev client build.

type BlePlxModule = typeof import('react-native-ble-plx');

let _blePlx: BlePlxModule | null = null;
let _blePlxLoadAttempted = false;
let _blePlxLoadError: string | null = null;

function getBlePlx(): BlePlxModule | null {
  if (_blePlxLoadAttempted) return _blePlx;
  _blePlxLoadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _blePlx = require('react-native-ble-plx') as BlePlxModule;
    return _blePlx;
  } catch (e) {
    _blePlxLoadError = e instanceof Error ? e.message : String(e);
    _blePlx = null;
    return null;
  }
}

export function isBleNativeAvailable(): boolean {
  return getBlePlx() !== null;
}

export function getBleLoadError(): string | null {
  // Force a load attempt so the error string is populated.
  getBlePlx();
  return _blePlxLoadError;
}

// ---------- Real BLE adapter ----------

let _manager: import('react-native-ble-plx').BleManager | null = null;

function getManager(): import('react-native-ble-plx').BleManager | null {
  const mod = getBlePlx();
  if (!mod) return null;
  if (_manager) return _manager;
  _manager = new mod.BleManager();
  return _manager;
}

export async function scanForBands(
  onFound: (r: ScanResult) => void,
  timeoutMs = 8000,
): Promise<void> {
  const mgr = getManager();
  if (!mgr) throw new Error('BLE not available — run a custom dev client build.');

  return new Promise<void>((resolve, reject) => {
    const seen = new Set<string>();
    const timer = setTimeout(() => {
      mgr.stopDeviceScan();
      resolve();
    }, timeoutMs);

    mgr.startDeviceScan(
      [HEARME_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          clearTimeout(timer);
          mgr.stopDeviceScan();
          reject(error);
          return;
        }
        if (!device || seen.has(device.id)) return;
        seen.add(device.id);
        const md = device.manufacturerData; // base64 of our serial advert
        let serialPrefix: string | null = null;
        if (md) {
          try {
            const raw = atob(md);
            serialPrefix = raw.slice(0, 4);
          } catch {
            serialPrefix = null;
          }
        }
        onFound({
          peripheralId: device.id,
          name: device.name ?? device.localName ?? null,
          rssi: device.rssi ?? -127,
          serialPrefix,
        });
      },
    );
  });
}

export async function connectAndSubscribe(
  peripheralId: string,
  listeners: BioListeners,
): Promise<{ subscription: BioSubscription; pair: NeuroBandPairRecord }> {
  const mgr = getManager();
  if (!mgr) throw new Error('BLE not available — run a custom dev client build.');

  listeners.onState('pairing');
  const device = await mgr.connectToDevice(peripheralId, {
    requestMTU: 64,
    autoConnect: true,
  });
  await device.discoverAllServicesAndCharacteristics();

  // Read serial / fw version from device_info char.
  const info = await device.readCharacteristicForService(
    HEARME_SERVICE_UUID,
    DEVICE_INFO_CHAR_UUID,
  );
  let serial = '';
  let firmware = '0.0';
  if (info.value) {
    try {
      const raw = atob(info.value);
      const fwMajor = raw.charCodeAt(0);
      const fwMinor = raw.charCodeAt(1);
      firmware = `${fwMajor}.${fwMinor}`;
      serial = raw.slice(2).replace(/[^\x20-\x7e]/g, '').trim();
    } catch {
      /* ignore */
    }
  }

  const existing = await loadPairRecord();
  const pair: NeuroBandPairRecord = {
    serial: serial || existing?.serial || peripheralId,
    peripheralId,
    firmware,
    pairedAt: existing?.pairedAt ?? Date.now(),
    lastSeenAt: Date.now(),
    lastCounter: existing?.peripheralId === peripheralId ? existing.lastCounter : 0,
  };
  await savePairRecord(pair);

  // BioFrame notify
  const frameSub = device.monitorCharacteristicForService(
    HEARME_SERVICE_UUID,
    BIO_FRAME_CHAR_UUID,
    (err, char) => {
      if (err || !char?.value) return;
      try {
        const raw = atob(char.value);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const frame = decodeBioFrame(bytes);
        // Replay protection — drop frames whose counter has already been seen.
        if (frame.counter <= pair.lastCounter) return;
        pair.lastCounter = frame.counter;
        pair.lastSeenAt = frame.receivedAt;
        listeners.onFrame(frame);
      } catch {
        /* malformed frame — drop */
      }
    },
  );

  // Silent-trigger notify
  const triggerSub = device.monitorCharacteristicForService(
    HEARME_SERVICE_UUID,
    SILENT_TRIGGER_CHAR_UUID,
    (err, char) => {
      if (err || !char?.value) return;
      try {
        const raw = atob(char.value);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        listeners.onTrigger(decodeSilentTrigger(bytes));
      } catch {
        /* ignore */
      }
    },
  );

  // Persist counter periodically so we don't lose replay state on crash.
  const counterPersist = setInterval(() => {
    void savePairRecord(pair);
  }, 30_000);

  // Reconnect on disconnect.
  const disconnectSub = device.onDisconnected((err) => {
    listeners.onState(
      'reconnecting',
      err ? err.reason ?? err.message : 'link lost',
    );
    // ble-plx with autoConnect=true will auto-reconnect; we only surface state.
  });

  listeners.onState('connected');

  return {
    pair,
    subscription: {
      remove: () => {
        clearInterval(counterPersist);
        frameSub.remove();
        triggerSub.remove();
        disconnectSub.remove();
        device.cancelConnection().catch(() => {});
        listeners.onState('idle');
      },
    },
  };
}

export async function sendHapticBuzz(): Promise<void> {
  const mgr = getManager();
  if (!mgr) return;
  const pair = await loadPairRecord();
  if (!pair) return;
  try {
    const device = await mgr.connectToDevice(pair.peripheralId);
    await device.discoverAllServicesAndCharacteristics();
    // Command 0x01 = haptic buzz. base64('AQ==') = 0x01
    await device.writeCharacteristicWithResponseForService(
      HEARME_SERVICE_UUID,
      COMMAND_CHAR_UUID,
      'AQ==',
    );
  } catch {
    /* best-effort */
  }
}

// ---------- Mock simulator ----------
//
// Generates a synthetic BioFrame stream that looks plausibly like a wrist
// reading. Drives a state machine with three modes:
//   - calm:    HR 65-72, GSR 2-3 µS, motion still, skin temp ~33 °C
//   - active:  HR 90-110, GSR 3-5 µS, motion walk/run
//   - duress:  HR 110-130, GSR 6-12 µS, motion still, skin temp drop, semg high
// You can poke the mode from the NeuroBand screen to validate fusion.

export type MockMode = 'calm' | 'active' | 'duress';
let _mockMode: MockMode = 'calm';
export function setMockMode(m: MockMode): void {
  _mockMode = m;
}
export function getMockMode(): MockMode {
  return _mockMode;
}

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function mockFrame(seq: number, counter: number): BioFrame {
  const m = _mockMode;
  const motion: MotionClass =
    m === 'active' ? (Math.random() > 0.4 ? 'walk' : 'run') : 'still';
  const hr =
    m === 'duress' ? rand(110, 130) : m === 'active' ? rand(90, 115) : rand(64, 76);
  const gsrUs =
    m === 'duress' ? rand(6, 12) : m === 'active' ? rand(3, 5) : rand(2, 3);
  const skinTempC =
    m === 'duress' ? rand(31.6, 32.4) : rand(32.8, 33.6);
  const semg = m === 'duress' ? rand(140, 220) : rand(20, 60);
  return {
    seq: seq & 0xffff,
    hr: Math.round(hr),
    hrvRmssd: Math.round(rand(15, 60)),
    spo2: m === 'duress' ? Math.round(rand(91, 96)) : Math.round(rand(96, 99)),
    gsrUs: +gsrUs.toFixed(2),
    skinTempC: +skinTempC.toFixed(2),
    motion,
    semg: Math.round(semg),
    battery: 78,
    flags: { charging: false, tamper: false, lowBattery: false },
    counter,
    fwMinor: 1,
    receivedAt: Date.now(),
  };
}

export function startMockStream(listeners: BioListeners): BioSubscription {
  listeners.onState('connected', 'mock');
  let seq = 0;
  let counter = 1;
  const interval = setInterval(() => {
    listeners.onFrame(mockFrame(seq++, counter++));
  }, 1000);
  return {
    remove: () => {
      clearInterval(interval);
      listeners.onState('idle');
    },
  };
}

// ---------- Permissions helper ----------

export type PermissionResult = { ok: boolean; reason?: string };

/**
 * Requests the runtime BLE permissions needed on Android 12+. iOS handles
 * this through the Info.plist usage description — no runtime prompt needed
 * beyond what the OS shows on first manager creation.
 */
export async function requestBlePermissions(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') return { ok: true };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PermissionsAndroid } = require('react-native') as typeof import('react-native');
    const p = PermissionsAndroid.PERMISSIONS;
    const needed = [
      p.BLUETOOTH_SCAN,
      p.BLUETOOTH_CONNECT,
      // Required on Android < 12 only, but harmless to ask on newer.
      p.ACCESS_FINE_LOCATION,
    ].filter(Boolean);
    const result = await PermissionsAndroid.requestMultiple(needed);
    const denied = Object.entries(result).filter(
      ([, v]) => v !== PermissionsAndroid.RESULTS.GRANTED,
    );
    if (denied.length === 0) return { ok: true };
    return { ok: false, reason: `Denied: ${denied.map(([k]) => k).join(', ')}` };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'unknown' };
  }
}

export function destroyManager(): void {
  if (_manager) {
    _manager.destroy();
    _manager = null;
  }
}
