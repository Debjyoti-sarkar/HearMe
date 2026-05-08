// Force-unlock detection.
//
// An attacker who has the phone may try to push the user's finger to the
// fingerprint sensor or hold the device up to their face. The struggle that
// usually accompanies this is detectable: the accelerometer sees high motion
// variance for the seconds leading into / during the bio prompt, often with
// multiple failed attempts.
//
// This module wraps `expo-local-authentication.authenticateAsync` so any
// caller (app-lock, sensitive screens) gets force-unlock detection for free.
//
// Behaviour:
//   • Sample accel for 2 s before the bio prompt.
//   • If variance > threshold AND failed bio attempts within window ≥ 2,
//     fire silent SOS in the background and (optionally) reject the unlock
//     by returning { success: false, forced: true }.
//   • If variance is normal, behave like the underlying call.

import * as LocalAuthentication from 'expo-local-authentication';
import { Accelerometer } from 'expo-sensors';

import { startRelay } from './guardian-relay';
import { loadContacts, loadSettings } from './app-data';

const PRE_SAMPLE_MS = 2_000;
const SAMPLE_HZ = 30;
const STRUGGLE_VARIANCE = 0.25; // m/s² magnitude variance threshold
const FAILED_ATTEMPT_WINDOW_MS = 60_000;

const FAILS: number[] = [];

export type ForceUnlockResult = {
  success: boolean;
  forced: boolean;
  reason: string;
  motionVariance: number;
  failedAttemptsInWindow: number;
};

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  let s = 0;
  for (const v of values) s += (v - mean) ** 2;
  return s / (values.length - 1);
}

async function sampleMotion(durationMs: number): Promise<number> {
  const mags: number[] = [];
  Accelerometer.setUpdateInterval(1000 / SAMPLE_HZ);
  const sub = Accelerometer.addListener(({ x, y, z }) => {
    mags.push(Math.sqrt(x * x + y * y + z * z));
  });
  await new Promise((r) => setTimeout(r, durationMs));
  sub.remove();
  return variance(mags);
}

async function fireSilentSos(): Promise<void> {
  try {
    const [contacts, settings] = await Promise.all([
      loadContacts(),
      loadSettings(),
    ]);
    if (contacts.length === 0) return;
    void startRelay(contacts, settings, () => {
      /* fire-and-forget */
    });
  } catch {
    /* swallow */
  }
}

/**
 * Drop-in replacement for LocalAuthentication.authenticateAsync that adds
 * force-unlock detection. Caller may pass `rejectIfForced: true` to refuse
 * the unlock; otherwise we fire silent SOS and proceed (so the attacker
 * doesn't realise we noticed).
 */
export async function authenticateGuarded(opts: {
  promptMessage?: string;
  cancelLabel?: string;
  rejectIfForced?: boolean;
}): Promise<ForceUnlockResult> {
  const motionVariance = await sampleMotion(PRE_SAMPLE_MS);
  const failsBefore = FAILS.filter((t) => Date.now() - t < FAILED_ATTEMPT_WINDOW_MS);
  const inputResult = await LocalAuthentication.authenticateAsync({
    promptMessage: opts.promptMessage ?? 'Unlock HearMe',
    cancelLabel: opts.cancelLabel,
  });
  if (!inputResult.success) {
    FAILS.push(Date.now());
    while (FAILS.length > 0 && Date.now() - FAILS[0] > FAILED_ATTEMPT_WINDOW_MS) {
      FAILS.shift();
    }
  }
  const failsNow = FAILS.filter((t) => Date.now() - t < FAILED_ATTEMPT_WINDOW_MS).length;

  // Forced if motion is high AND we've had at least 2 fails in the window.
  const forced = motionVariance > STRUGGLE_VARIANCE && failsNow >= 2;
  if (forced) {
    void fireSilentSos();
  }

  if (forced && opts.rejectIfForced) {
    return {
      success: false,
      forced: true,
      reason: `forced — variance ${motionVariance.toFixed(3)}, ${failsNow} fails`,
      motionVariance,
      failedAttemptsInWindow: failsNow,
    };
  }

  let reason: string;
  if (inputResult.success) {
    reason = forced ? 'unlocked but flagged forced' : 'ok';
  } else {
    const err =
      'error' in inputResult ? (inputResult as { error?: unknown }).error : null;
    reason = typeof err === 'string' && err.length > 0 ? err : 'failed';
  }
  return {
    success: inputResult.success,
    forced,
    reason,
    motionVariance,
    failedAttemptsInWindow: failsNow,
  };
}

/** Snapshot for diagnostics / UI banners. */
export function recentFailedAttempts(windowMs: number = FAILED_ATTEMPT_WINDOW_MS): number {
  return FAILS.filter((t) => Date.now() - t < windowMs).length;
}
