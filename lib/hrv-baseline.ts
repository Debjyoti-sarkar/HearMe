// Per-user HRV-based stress baseline.
//
// The fusion engine currently uses a single resting HR baseline. That works
// but ignores the cleanest physiological stress signal available — heart-rate
// variability (HRV, specifically RMSSD). RMSSD is parasympathetic-dominant:
// it drops sharply under acute stress and recovers within minutes. Lower RMSSD
// vs your own circadian-aware baseline is a high-quality "you are stressed"
// signal that the fusion can use to:
//
//   • increase sensitivity (fire on 2-of-5 instead of 3-of-5),
//   • soften thresholds during a workout (HRV drops naturally then),
//   • flag prolonged stress for the safety dashboard.
//
// Baselines are kept per circadian hour bucket because resting HRV varies by
// 30%+ between e.g. 9 AM and midnight. Updates use Welford's online stats
// (numerically stable) and are gated to "still" motion only — running HRV is
// not a useful baseline.

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BioFrame } from './neuroband-ble';

const KEY = '@hearme/hrv_baseline_v1';

export type HourBucket = {
  rmssdMean: number;
  rmssdVar: number;
  n: number;
};

export type HrvBaseline = {
  buckets: HourBucket[]; // length 24
  updatedAt: number;
};

const EMPTY_BUCKET: HourBucket = { rmssdMean: 50, rmssdVar: 200, n: 0 };

export function emptyHrvBaseline(): HrvBaseline {
  return {
    buckets: Array.from({ length: 24 }, () => ({ ...EMPTY_BUCKET })),
    updatedAt: 0,
  };
}

export async function loadHrvBaseline(): Promise<HrvBaseline> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyHrvBaseline();
    const j = JSON.parse(raw) as HrvBaseline;
    if (!Array.isArray(j.buckets) || j.buckets.length !== 24) return emptyHrvBaseline();
    return j;
  } catch {
    return emptyHrvBaseline();
  }
}

export async function saveHrvBaseline(b: HrvBaseline): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(b));
}

/**
 * Update the bucket for the current hour with a fresh BioFrame. Returns the
 * new baseline (caller persists). Pure function.
 */
export function updateHrvBaseline(prev: HrvBaseline, frame: BioFrame): HrvBaseline {
  if (frame.motion !== 'still') return prev;
  if (frame.hrvRmssd <= 0) return prev;
  const hr = new Date(frame.receivedAt).getHours();
  const bucket = prev.buckets[hr] ?? { ...EMPTY_BUCKET };
  const n = bucket.n + 1;
  const delta = frame.hrvRmssd - bucket.rmssdMean;
  const mean = bucket.rmssdMean + delta / n;
  const m2 = bucket.rmssdVar * Math.max(1, bucket.n) + delta * (frame.hrvRmssd - mean);
  const next: HrvBaseline = {
    buckets: prev.buckets.slice() as HourBucket[],
    updatedAt: Date.now(),
  };
  next.buckets[hr] = { rmssdMean: mean, rmssdVar: m2 / n, n };
  return next;
}

export type StressIndex = {
  /** Z-score of current HRV vs this hour's baseline (negative = stressed). */
  z: number;
  /** Compact 0–100 stress score (clipped). */
  score: number;
  /** Calibration progress per hour, 0–1 (1 = ≥360 samples). */
  calibration: number;
};

const SAMPLES_FOR_CALIBRATION = 360;

/**
 * Pure scoring — given the current frame and the loaded baseline, produce a
 * stress score. Score 0 = baseline; 100 = severe (HRV ≥ 3σ below mean).
 */
export function currentStressIndex(
  frame: BioFrame,
  baseline: HrvBaseline,
): StressIndex {
  const hr = new Date(frame.receivedAt).getHours();
  const bucket = baseline.buckets[hr] ?? EMPTY_BUCKET;
  const std = Math.sqrt(Math.max(1, bucket.rmssdVar));
  const z = (frame.hrvRmssd - bucket.rmssdMean) / std;
  // Negative z (HRV below baseline) ⇒ stress. Map to 0–100.
  const score = Math.max(0, Math.min(100, Math.round(-z * 33)));
  const calibration = Math.max(0, Math.min(1, bucket.n / SAMPLES_FOR_CALIBRATION));
  return { z, score, calibration };
}

/**
 * Sensitivity adapter — given a base sensitivity ('low'|'normal'|'high'),
 * raise it one notch when the stress score is high. Returns a new
 * sensitivity to feed into fusion config.
 */
export function adaptSensitivity(
  base: 'low' | 'normal' | 'high',
  stress: StressIndex,
): 'low' | 'normal' | 'high' {
  if (stress.calibration < 0.4) return base; // not enough data yet
  if (stress.score >= 70) {
    if (base === 'low') return 'normal';
    if (base === 'normal') return 'high';
  }
  return base;
}
