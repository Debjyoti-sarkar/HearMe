// Off-grid mode.
//
// When sustained network loss is detected during an active journey, switch
// to alternate transports for keeping contacts informed. The transport
// surface is a pluggable adapter so any of:
//
//   • Meshtastic (LoRa over BLE)            — realistic to ship; backend is wired
//   • Garmin inReach                        — proprietary BLE SDK
//   • Apple Emergency SOS via Satellite     — no app-side trigger, side-button only
//   • Sat phone Bluetooth pair              — vendor-specific
//
// can drop in. Without any registered backend we fall back to the safest
// thing that doesn't pretend: show a banner prompting the user to use the
// device-OS satellite SOS path (iOS) or to physically reach a known landline.
//
// The watchdog is offered separately from the transport — apps can use the
// watchdog alone to merely raise a red banner, or wire a transport and
// auto-relay on loss.

import { Platform } from 'react-native';

const PROBE_URL = 'https://www.cloudflare.com/cdn-cgi/trace';
const PROBE_INTERVAL_MS = 15_000;
const SUSTAINED_LOSS_MS = 60_000;

export type OffgridTransport = {
  name: string;
  /**
   * Send a short status message + optional location to the user's contacts
   * via this transport. Implementations should batch / chunk as needed.
   */
  sendDistress(opts: {
    message: string;
    lat: number | null;
    lon: number | null;
  }): Promise<{ ok: boolean; reason?: string }>;
  /** Best-effort connectivity check — does this transport think it can reach. */
  isAvailable(): Promise<boolean>;
};

export type OffgridBanner =
  | { kind: 'online' }
  | {
      kind: 'offline';
      lostAt: number;
      durationMs: number;
      transports: { name: string; available: boolean }[];
    };

const STATE: {
  watchdog: ReturnType<typeof setInterval> | null;
  online: boolean;
  lostAt: number | null;
  transports: OffgridTransport[];
  onBanner: ((b: OffgridBanner) => void) | null;
} = {
  watchdog: null,
  online: true,
  lostAt: null,
  transports: [],
  onBanner: null,
};

export function registerOffgridTransport(t: OffgridTransport): void {
  STATE.transports.push(t);
}

async function probe(): Promise<boolean> {
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 4_000) : null;
    const resp = await fetch(PROBE_URL, { method: 'GET', signal: ctrl?.signal });
    if (t) clearTimeout(t);
    return resp.ok;
  } catch {
    return false;
  }
}

async function emitBanner(): Promise<void> {
  if (!STATE.onBanner) return;
  if (STATE.online) {
    STATE.onBanner({ kind: 'online' });
    return;
  }
  const lostAt = STATE.lostAt ?? Date.now();
  const transports = await Promise.all(
    STATE.transports.map(async (t) => ({
      name: t.name,
      available: await t.isAvailable().catch(() => false),
    })),
  );
  STATE.onBanner({
    kind: 'offline',
    lostAt,
    durationMs: Date.now() - lostAt,
    transports,
  });
}

/**
 * Try every registered transport in order. Returns the first success, or a
 * `noTransport` failure if none worked.
 */
export async function relayDistress(opts: {
  message: string;
  lat: number | null;
  lon: number | null;
}): Promise<{ ok: boolean; via?: string; reason?: string }> {
  if (STATE.transports.length === 0) {
    return { ok: false, reason: 'noTransport' };
  }
  let lastReason: string | undefined;
  for (const t of STATE.transports) {
    if (!(await t.isAvailable())) continue;
    const r = await t.sendDistress(opts);
    if (r.ok) return { ok: true, via: t.name };
    lastReason = r.reason;
  }
  return { ok: false, reason: lastReason ?? 'allUnavailable' };
}

/** Universal-link helper — on iOS the user can be prompted to hold side button. */
export function osSatelliteHelpText(): string {
  if (Platform.OS === 'ios') {
    return 'No cellular or Wi-Fi reachable. iPhone 14 and later support Emergency SOS via Satellite — press and hold the side button + a volume button until the SOS slider appears, or open the Messages app to text 911.';
  }
  return 'No cellular or Wi-Fi reachable. If you have a satellite communicator (Garmin inReach, Iridium GO, etc.), pair it now. Otherwise, move toward a road or open sky and try again.';
}

export function startOffgridWatchdog(opts: {
  onBanner: (b: OffgridBanner) => void;
  onSustainedLoss?: () => void;
}): void {
  if (STATE.watchdog) return;
  STATE.onBanner = opts.onBanner;
  STATE.watchdog = setInterval(() => {
    void (async () => {
      const online = await probe();
      const wasOnline = STATE.online;
      STATE.online = online;
      if (online) {
        STATE.lostAt = null;
        if (!wasOnline) await emitBanner();
        return;
      }
      if (!STATE.lostAt) {
        STATE.lostAt = Date.now();
        await emitBanner();
        return;
      }
      // Already offline — emit a refreshed banner only when crossing the
      // sustained-loss boundary, then call the alarm hook once.
      const dur = Date.now() - STATE.lostAt;
      if (wasOnline) await emitBanner();
      if (dur >= SUSTAINED_LOSS_MS && wasOnline === false) {
        opts.onSustainedLoss?.();
        await emitBanner();
      }
    })();
  }, PROBE_INTERVAL_MS);
}

export function stopOffgridWatchdog(): void {
  if (STATE.watchdog) {
    clearInterval(STATE.watchdog);
    STATE.watchdog = null;
  }
  STATE.onBanner = null;
  STATE.online = true;
  STATE.lostAt = null;
}

// =====================================================
// Default transport: Meshtastic / LoRa adapter.
//
// Meshtastic devices expose a BLE GATT service. Hooking that requires a
// custom build with the Meshtastic protobufs. We define the integration
// surface here so a follow-up commit that ships the protobuf parser can
// drop straight in.
// =====================================================

export type MeshtasticConfig = {
  bleServiceUuid: string;
  toRadioCharUuid: string;
  fromRadioCharUuid: string;
};

export const MESHTASTIC_DEFAULTS: MeshtasticConfig = {
  bleServiceUuid: '6ba1b218-15a8-461f-9fa8-5dcae273eafd',
  toRadioCharUuid: 'f75c76d2-129e-4dad-a1dd-7866124401e7',
  fromRadioCharUuid: '2c55e69e-4993-11ed-b878-0242ac120002',
};

/**
 * Build a transport stub for Meshtastic. The real BLE bridge ships in a
 * follow-up commit; this returns a transport that *honestly* reports it is
 * unavailable until the bridge is wired, so we never claim a success that
 * didn't happen.
 */
export function buildMeshtasticTransport(): OffgridTransport {
  return {
    name: 'meshtastic',
    isAvailable: async () => false,
    sendDistress: async () => ({
      ok: false,
      reason: 'meshtastic-bridge-not-installed',
    }),
  };
}
