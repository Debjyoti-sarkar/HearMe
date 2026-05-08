// Decoy lock screen.
//
// Distinct from disguise (the app pretending to be a calculator) and from
// the duress-PIN feature (a reversed PIN that fires SOS while looking like a
// successful unlock). Decoy lock is a *fake* lock screen the user can flip on
// at any time — shown when they sense a confrontation. Whatever the attacker
// types, the screen rejects it with a plausible "incorrect passcode" UI while
// silently firing SOS in the background.
//
// Decoy mode also:
//   • Drops the cellular signal indicator to "No Service" so the attacker
//     thinks the phone is useless (cosmetic — the radio stays on so SOS sends).
//   • Drains a fake battery that animates from 30 % → 1 % over ~20 s, prompting
//     "low battery, please charge" — a believable reason to hand the phone back.
//
// It's a UI-state machine (this file) plus a screen (app/decoy-lock.tsx)
// that consumes it.

import * as Crypto from 'expo-crypto';

import { sendSosSms } from './emergency-sms';
import { startRelay } from './guardian-relay';
import { loadContacts, loadSettings } from './app-data';

export type DecoyState = {
  active: boolean;
  startedAt: number;
  attemptCount: number;
  fakeBatteryPct: number;
  /** A fresh challenge nonce each time so log-replays can be correlated. */
  nonce: string;
  /** Records every key tap for forensic reconstruction (kept on-device). */
  keystrokes: { key: string; at: number }[];
  /** True after we've fired the silent SOS exactly once. */
  silentSosFired: boolean;
};

export type DecoyEvent =
  | { kind: 'started' }
  | { kind: 'attempt'; attemptCount: number }
  | { kind: 'silent-sos' }
  | { kind: 'battery-tick'; pct: number }
  | { kind: 'released'; reason: 'safeword' | 'manual' };

let listener: ((e: DecoyEvent) => void) | null = null;
let state: DecoyState | null = null;
let batteryTimer: ReturnType<typeof setInterval> | null = null;

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

export function getDecoyState(): DecoyState | null {
  return state;
}

export function onDecoyEvent(cb: (e: DecoyEvent) => void): () => void {
  listener = cb;
  return () => {
    if (listener === cb) listener = null;
  };
}

export function startDecoyLock(): DecoyState {
  if (state?.active) return state;
  state = {
    active: true,
    startedAt: Date.now(),
    attemptCount: 0,
    fakeBatteryPct: 30,
    nonce: bytesToHex(Crypto.getRandomBytes(8)),
    keystrokes: [],
    silentSosFired: false,
  };
  listener?.({ kind: 'started' });
  // Fire silent SOS the moment decoy is engaged — every second matters.
  void fireSilentSos();
  // Drain the fake battery from 30 % → 1 % over ~20 s.
  if (batteryTimer) clearInterval(batteryTimer);
  batteryTimer = setInterval(() => {
    if (!state?.active) return;
    state.fakeBatteryPct = Math.max(1, state.fakeBatteryPct - 1.5);
    listener?.({ kind: 'battery-tick', pct: state.fakeBatteryPct });
  }, 1000);
  return state;
}

export function recordKeystroke(key: string): void {
  if (!state) return;
  state.keystrokes.push({ key, at: Date.now() });
}

/**
 * Decoy-screen attempt. Always returns "incorrect" unless the user types
 * the safe-release sequence (default: long-press of the cancel key three
 * times within 4 s, exposed via {@link releaseDecoy}).
 */
export function recordAttempt(input: string): { incorrect: true } {
  if (!state) return { incorrect: true };
  state.attemptCount += 1;
  state.keystrokes.push({ key: `submit:${input.length}`, at: Date.now() });
  listener?.({ kind: 'attempt', attemptCount: state.attemptCount });
  return { incorrect: true };
}

export function releaseDecoy(reason: 'safeword' | 'manual' = 'manual'): void {
  if (!state) return;
  state.active = false;
  if (batteryTimer) {
    clearInterval(batteryTimer);
    batteryTimer = null;
  }
  listener?.({ kind: 'released', reason });
}

async function fireSilentSos(): Promise<void> {
  if (!state) return;
  if (state.silentSosFired) return;
  state.silentSosFired = true;
  listener?.({ kind: 'silent-sos' });

  try {
    const [contacts, settings] = await Promise.all([
      loadContacts(),
      loadSettings(),
    ]);
    if (contacts.length === 0) return;
    // Prefer guardian-relay if it's available (priority-tiered, ack-aware).
    if (typeof startRelay === 'function') {
      await startRelay(contacts, settings, () => {
        /* fire-and-forget */
      });
      return;
    }
    await sendSosSms(contacts, settings);
  } catch {
    /* swallow — surfacing an error would expose us */
  }
}

/**
 * Returns the fake "no service" carrier string the screen renders. Pure —
 * here so screens can render consistently and tests can assert.
 */
export function fakeCarrier(): string {
  return 'No Service';
}

/** Fake battery + signal info for the decoy status bar. */
export function fakeStatus(): { batteryPct: number; signal: 'none' } {
  return { batteryPct: state?.fakeBatteryPct ?? 30, signal: 'none' };
}
