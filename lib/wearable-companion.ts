// Wear OS / watchOS companion adapter.
//
// A user without a NeuroBand can still get "press the watch crown to fire
// SOS" + bio-signal verification by pairing their existing Wear OS or Apple
// Watch. The phone-side companion bridge is platform-specific; this module
// is the JS-facing surface plus a clean adapter contract that a native module
// (or two — one per platform) plugs into.
//
// Platform notes:
//   • watchOS — The phone-side app needs WatchConnectivity + a separate
//     watchOS target. From the phone we can:
//       - kick off a watch-side "are you safe?" prompt,
//       - receive triple-press-of-side-button as a silent SOS event,
//       - read HR samples via HKWorkoutSession from a paired Series 4+.
//   • Wear OS — A second companion APK in the Android module. We can:
//       - register an Always-On Tile (long-press for SOS),
//       - receive crown-rotation + double-tap as triggers,
//       - read HR via Health Services API.
//
// Without those modules built, the JS bridge is a no-op that returns
// `{available: false}` from every probe — accurate, never lies.

import type { Verdict } from './neuroband-fusion';

export type WatchPlatform = 'watchos' | 'wearos' | 'unknown';

export type WatchPing = {
  kind: 'sos-pressed' | 'safe-pressed' | 'check-in-pressed' | 'siren-toggled';
  at: number;
  /** From-watch HR sample if the platform exposes one. */
  hr?: number;
};

export type WearableCompanionBackend = {
  platform: WatchPlatform;
  isAvailable(): Promise<boolean>;
  /** Subscribe to events from the watch. */
  subscribe(handlers: {
    onPing: (p: WatchPing) => void;
    onHrSample?: (bpm: number, at: number) => void;
  }): Promise<{ stop: () => Promise<void> }>;
  /** Push a message / haptic to the watch face. */
  showMessage(message: string, opts?: { haptic?: 'success' | 'warn' | 'alarm' }): Promise<void>;
  /** Forward a fusion verdict so the watch can show ✗-✓-✓-✗-✓ marker icons. */
  showVerdict(verdict: Verdict): Promise<void>;
};

const noopBackend: WearableCompanionBackend = {
  platform: 'unknown',
  async isAvailable() {
    return false;
  },
  async subscribe() {
    return { stop: async () => {} };
  },
  async showMessage() {
    /* no-op */
  },
  async showVerdict() {
    /* no-op */
  },
};

let backend: WearableCompanionBackend = noopBackend;

export function registerWearableBackend(b: WearableCompanionBackend): void {
  backend = b;
}

export function getWearablePlatform(): WatchPlatform {
  return backend.platform;
}

export async function isWearableAvailable(): Promise<boolean> {
  return backend.isAvailable();
}

export async function subscribeWatchEvents(handlers: {
  onPing: (p: WatchPing) => void;
  onHrSample?: (bpm: number, at: number) => void;
}): Promise<{ stop: () => Promise<void> }> {
  return backend.subscribe(handlers);
}

export async function showOnWatch(
  message: string,
  opts?: { haptic?: 'success' | 'warn' | 'alarm' },
): Promise<void> {
  return backend.showMessage(message, opts);
}

export async function pushVerdictToWatch(verdict: Verdict): Promise<void> {
  return backend.showVerdict(verdict);
}

/**
 * Native-module recipes.
 *
 * watchOS:
 *   1. Add a watchOS target to the Xcode project. Bundle ID:
 *      `<host-bundle>.watchkitapp`.
 *   2. Implement WCSessionDelegate on both sides. Phone-side:
 *      `WCSession.default.activate(); didReceiveMessage:` → emit onPing.
 *   3. Watch-side complication: long-press fires sosPressed; HKHeartRate
 *      query streams onHrSample.
 *
 * Wear OS:
 *   1. Add a Wear module under android/wear with the same package id
 *      suffix `.wear`.
 *   2. Use WearableListenerService on the phone, MessageClient on the watch.
 *   3. Watch tile + complication; double-tap of haptic input fires sosPressed.
 *
 * Both end with `registerWearableBackend(new <Platform>WearBridge())` from
 * the native bridge. Until then, the JS surface is honest about being
 * unavailable.
 */
export const NATIVE_RECIPE = '__see lib/wearable-companion.ts source for full recipe__';
