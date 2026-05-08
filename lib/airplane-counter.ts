// Airplane-mode counter.
//
// During an active journey, an attacker may toggle airplane mode to silence
// the user's phone. We can't always tell airplane-mode from "lost signal" on
// iOS (no public API), but we *can* detect:
//
//   • Sudden simultaneous loss of cellular AND Wi-Fi reachability — typical
//     of airplane mode being flipped. Pure signal loss usually drops only
//     cellular, not Wi-Fi.
//   • Loss happening within seconds of an accelerometer event (a snatch).
//
// On a hit, the module fires a separate cellular-only SMS escalation via
// any registered alternate-modem backend (e.g. the NeuroBand's optional
// LTE-M module, a Bluetooth-paired cellular dongle, or an on-Wi-Fi Twilio
// REST relay if Wi-Fi is still up).
//
// Without a registered alt-modem backend the module instead flags the event
// + auto-fires the standard guardian-relay so contacts at least see "I lost
// service abruptly" — strictly better than silent.

import { Accelerometer } from 'expo-sensors';

import { startRelay } from './guardian-relay';
import { loadContacts, loadSettings } from './app-data';

const PROBE_CELLULAR_URL = 'https://www.gstatic.com/generate_204';
const PROBE_WIFI_URL = 'https://captive.apple.com/hotspot-detect.html';
const PROBE_INTERVAL_MS = 8_000;
const SHOCK_WINDOW_MS = 5_000;
const SHOCK_G_THRESHOLD = 1.6;

export type AirplaneVerdict = {
  cellularDown: boolean;
  wifiDown: boolean;
  recentShock: boolean;
  /** "high" only when both networks are down AND a recent shock was seen. */
  confidence: 'low' | 'medium' | 'high';
  detectedAt: number;
};

export type AltModemBackend = {
  name: string;
  isAvailable(): Promise<boolean>;
  sendDistress(opts: {
    message: string;
    contactsE164: string[];
    lat: number | null;
    lon: number | null;
  }): Promise<{ ok: boolean; reason?: string }>;
};

const STATE: {
  alt: AltModemBackend | null;
  watcher: ReturnType<typeof setInterval> | null;
  lastShockAt: number;
  cellOnline: boolean;
  wifiOnline: boolean;
  active: boolean;
  onVerdict: ((v: AirplaneVerdict) => void) | null;
  accelSub: { remove: () => void } | null;
} = {
  alt: null,
  watcher: null,
  lastShockAt: 0,
  cellOnline: true,
  wifiOnline: true,
  active: false,
  onVerdict: null,
  accelSub: null,
};

export function registerAltModemBackend(b: AltModemBackend): void {
  STATE.alt = b;
}

async function probe(url: string): Promise<boolean> {
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 3_000) : null;
    const resp = await fetch(url, { method: 'GET', signal: ctrl?.signal });
    if (t) clearTimeout(t);
    return resp.ok || resp.status === 204;
  } catch {
    return false;
  }
}

async function tick(): Promise<void> {
  const [cellNow, wifiNow] = await Promise.all([
    probe(PROBE_CELLULAR_URL),
    probe(PROBE_WIFI_URL),
  ]);

  const justWentDown = STATE.cellOnline && STATE.wifiOnline && !cellNow && !wifiNow;
  const shockNear = Date.now() - STATE.lastShockAt < SHOCK_WINDOW_MS;

  STATE.cellOnline = cellNow;
  STATE.wifiOnline = wifiNow;

  if (!justWentDown) return;

  const verdict: AirplaneVerdict = {
    cellularDown: !cellNow,
    wifiDown: !wifiNow,
    recentShock: shockNear,
    confidence: shockNear ? 'high' : 'medium',
    detectedAt: Date.now(),
  };
  STATE.onVerdict?.(verdict);
  void escalate(verdict);
}

async function escalate(verdict: AirplaneVerdict): Promise<void> {
  // Try the alt-modem first — it's the whole point of this feature.
  try {
    const [contacts, settings] = await Promise.all([
      loadContacts(),
      loadSettings(),
    ]);
    if (STATE.alt && (await STATE.alt.isAvailable())) {
      const numbers = contacts
        .map((c) => c.phone.replace(/\D/g, ''))
        .filter((n) => n.length >= 8);
      if (numbers.length > 0) {
        const body = `EMERGENCY (HearMe airplane-counter, conf ${verdict.confidence}): airplane mode toggled on the host phone. Routing via alt-modem.`;
        const r = await STATE.alt.sendDistress({
          message: body,
          contactsE164: numbers,
          lat: null,
          lon: null,
        });
        if (r.ok) return;
      }
    }
    // Fall through: standard relay (uses the existing OS SMS pipe — works only
    // if cellular is actually present; otherwise it queues for the dead-man).
    if (contacts.length > 0) {
      void startRelay(contacts, settings, () => {
        /* fire-and-forget */
      });
    }
  } catch {
    /* swallow */
  }
}

export function startAirplaneCounter(opts: {
  onVerdict?: (v: AirplaneVerdict) => void;
}): void {
  if (STATE.active) return;
  STATE.active = true;
  STATE.onVerdict = opts.onVerdict ?? null;
  Accelerometer.setUpdateInterval(150);
  STATE.accelSub = Accelerometer.addListener(({ x, y, z }) => {
    const mag = Math.sqrt(x * x + y * y + z * z);
    const above = Math.abs(mag - 1.0) * 9.8;
    if (above > SHOCK_G_THRESHOLD) STATE.lastShockAt = Date.now();
  });
  STATE.watcher = setInterval(() => {
    void tick();
  }, PROBE_INTERVAL_MS);
}

export function stopAirplaneCounter(): void {
  if (!STATE.active) return;
  STATE.active = false;
  if (STATE.watcher) {
    clearInterval(STATE.watcher);
    STATE.watcher = null;
  }
  STATE.accelSub?.remove();
  STATE.accelSub = null;
  STATE.onVerdict = null;
}
