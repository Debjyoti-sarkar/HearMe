// Phone-tamper detection.
//
// Detects an attacker grabbing the phone — usually accompanied by an obvious
// physical signature even if the app is in the background:
//
//   1) AppState transitions to "background" without a normal foreground
//      gesture (we approximate "normal" by a recent foreground-touch flag
//      the UI sets; in practice a 250 ms grace).
//   2) Accelerometer registers a high-magnitude shock within a few seconds
//      of (1).
//   3) Network reachability drops (signal loss, airplane-mode toggle, or the
//      phone being shoved into a pocket / bag near a Faraday-ish surface).
//
// Hits-of-3 within a 6 s window ⇒ silent SOS. Hits-of-2 ⇒ heightened-alert
// (band haptic + camera capture).

import { Accelerometer } from 'expo-sensors';
import { AppState, type AppStateStatus } from 'react-native';

const WINDOW_MS = 6_000;
const SHOCK_G_THRESHOLD = 2.5; // m/s² above gravity baseline (~9.8) ⇒ ~1.25 g event
const NET_PROBE_INTERVAL_MS = 5_000;
const NET_PROBE_URL = 'https://www.cloudflare.com/cdn-cgi/trace';

export type TamperSignal = 'screen-off' | 'shock' | 'net-loss';

export type TamperVerdict = {
  signals: TamperSignal[];
  confidence: 'low' | 'high';
  firedAt: number;
};

export type TamperBackend = {
  /** Called when 3-of-3 fire within window. Default: nothing — caller wires SOS. */
  onSilentSos: () => void;
  /** Called when 2-of-3 fire — UI shows alert banner. */
  onHeightenedAlert: (verdict: TamperVerdict) => void;
};

const STATE: {
  appSub: { remove: () => void } | null;
  accelSub: { remove: () => void } | null;
  netTimer: ReturnType<typeof setInterval> | null;
  events: { signal: TamperSignal; at: number }[];
  recentForegroundGesture: number;
  online: boolean;
  running: boolean;
  backend: TamperBackend;
} = {
  appSub: null,
  accelSub: null,
  netTimer: null,
  events: [],
  recentForegroundGesture: 0,
  online: true,
  running: false,
  backend: {
    onSilentSos: () => {},
    onHeightenedAlert: () => {},
  },
};

function recordSignal(signal: TamperSignal): void {
  const now = Date.now();
  STATE.events = STATE.events.filter((e) => now - e.at <= WINDOW_MS);
  STATE.events.push({ signal, at: now });
  evaluate();
}

function evaluate(): void {
  const now = Date.now();
  STATE.events = STATE.events.filter((e) => now - e.at <= WINDOW_MS);
  const distinct = new Set(STATE.events.map((e) => e.signal));
  if (distinct.size >= 3) {
    const verdict: TamperVerdict = {
      signals: [...distinct],
      confidence: 'high',
      firedAt: now,
    };
    STATE.backend.onSilentSos();
    STATE.backend.onHeightenedAlert(verdict);
    // Reset to avoid re-firing immediately.
    STATE.events = [];
    return;
  }
  if (distinct.size === 2) {
    STATE.backend.onHeightenedAlert({
      signals: [...distinct],
      confidence: 'low',
      firedAt: now,
    });
  }
}

export function noteForegroundGesture(): void {
  STATE.recentForegroundGesture = Date.now();
}

function onAppStateChange(s: AppStateStatus): void {
  if (s !== 'background' && s !== 'inactive') return;
  // If the user just touched the UI, treat the transition as benign.
  if (Date.now() - STATE.recentForegroundGesture < 1500) return;
  recordSignal('screen-off');
}

function onAccelerometer(x: number, y: number, z: number): void {
  const mag = Math.sqrt(x * x + y * y + z * z);
  // expo-sensors reports g-units (1.0 = gravity). A shock event is anything
  // sharply above 1g — the phone being yanked or thrown.
  const above = Math.abs(mag - 1.0);
  if (above > SHOCK_G_THRESHOLD / 9.8) {
    recordSignal('shock');
  }
}

async function pollNetwork(): Promise<void> {
  let online = false;
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 2000) : null;
    const resp = await fetch(NET_PROBE_URL, { method: 'GET', signal: ctrl?.signal });
    if (t) clearTimeout(t);
    online = resp.ok;
  } catch {
    online = false;
  }
  if (STATE.online && !online) recordSignal('net-loss');
  STATE.online = online;
}

export function startTamperDetection(backend: TamperBackend): void {
  if (STATE.running) return;
  STATE.backend = backend;
  STATE.running = true;
  STATE.appSub = AppState.addEventListener('change', onAppStateChange);
  Accelerometer.setUpdateInterval(100);
  STATE.accelSub = Accelerometer.addListener(({ x, y, z }) => {
    onAccelerometer(x, y, z);
  });
  STATE.netTimer = setInterval(() => {
    void pollNetwork();
  }, NET_PROBE_INTERVAL_MS);
}

export function stopTamperDetection(): void {
  if (!STATE.running) return;
  STATE.running = false;
  STATE.appSub?.remove();
  STATE.accelSub?.remove();
  if (STATE.netTimer) {
    clearInterval(STATE.netTimer);
    STATE.netTimer = null;
  }
  STATE.appSub = null;
  STATE.accelSub = null;
  STATE.events = [];
}

/** Test helper — manually push a signal without waiting for the real source. */
export function injectSignal(signal: TamperSignal): void {
  recordSignal(signal);
}
