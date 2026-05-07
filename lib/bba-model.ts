/**
 * BBA (Behavioral Biometric Authentication) Model — TypeScript inference
 *
 * Ports the trained PhishSafe BBA model into the HearMe app:
 *   Input(19) -> Dense(8, relu) -> Dense(1, sigmoid)
 *
 * Weights and the StandardScaler stats are extracted from the original
 * Keras model (model_light.h5) and scaler (scaler.joblib) and shipped as
 * a JSON asset (assets/bba-model.json). Inference runs on-device — no
 * native module required, no network call.
 *
 * The model returns a fraud probability in [0, 1]. When it crosses the
 * threshold (default 0.45 from the original BBA pipeline), the host app
 * should treat the session as compromised and re-verify the user.
 */
import bbaWeights from '../assets/bba-model.json';

import type { BehaviorSession } from './behavior-tracker';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type DenseLayer = {
  kind: 'dense';
  activation: 'relu' | 'sigmoid';
  kernel: number[][]; // [in_features][out_features]
  bias: number[];
};

type ModelBlob = {
  version: number;
  feature_names: string[];
  scaler: { mean: number[]; scale: number[] };
  layers: DenseLayer[];
  threshold: number;
};

const MODEL = bbaWeights as unknown as ModelBlob;

export type BbaPrediction = {
  /** Fraud probability in [0, 1]. */
  probability: number;
  /** True when probability > threshold — caller should re-verify the user. */
  unusual: boolean;
  /** The threshold the prediction was compared against. */
  threshold: number;
  /** Raw 19-dim feature vector that was fed to the network (post-scaling). */
  scaledFeatures: number[];
  /** Diagnostic — the unscaled feature values, in canonical order. */
  rawFeatures: number[];
};

/* ------------------------------------------------------------------ */
/*  Feature extraction                                                  */
/* ------------------------------------------------------------------ */

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

function std(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  return Math.sqrt(s / arr.length);
}

/**
 * Map a HearMe tap zone label to a (x, y) coordinate on a 3x3 grid.
 * Mirrors the BBA training pipeline (zone_to_xy in extract_json_to_csv.py),
 * which used { left:0, center:1, right:2 } and { top:0, middle:1, bottom:2 }.
 * HearMe's zones use a 2x2 grid + center; we map them to the closest 3x3 cell.
 */
function zoneToXY(zone: string): { x: number; y: number } {
  switch (zone) {
    case 'top-left':
      return { x: 0, y: 0 };
    case 'top-right':
      return { x: 2, y: 0 };
    case 'bottom-left':
      return { x: 0, y: 2 };
    case 'bottom-right':
      return { x: 2, y: 2 };
    case 'center':
    default:
      return { x: 1, y: 1 };
  }
}

/**
 * Build the 19-dim feature vector from a behaviour session.
 * Bank-specific features (fd_broken, loan_taken, time_from_login_to_*)
 * are not applicable to a personal-safety app, so they are zero-filled —
 * matching the training pipeline's `df.fillna(0, inplace=True)` step.
 */
export function extractFeatures(session: BehaviorSession): number[] {
  const now = Date.now();
  const sessionDurationMs = session.endTime
    ? session.durationMs
    : now - session.startTime;
  const sessionDurationSec = Math.max(0, sessionDurationMs / 1000);

  const tapDurations = session.tapEvents.map((t) => t.durationMs);
  const tapFreq =
    sessionDurationSec > 0 ? session.tapEvents.length / sessionDurationSec : 0;

  const swipeSpeeds = session.swipeEvents.map((s) => s.speedPxPerMs);
  const swipeDistances = session.swipeEvents.map((s) => s.distancePx);

  const tapZonesXY = session.tapEvents.map((t) => zoneToXY(t.zone));
  const tapZoneX = mean(tapZonesXY.map((p) => p.x));
  const tapZoneY = mean(tapZonesXY.map((p) => p.y));

  // HearMe doesn't track per-screen swipe origin zones — fall back to the
  // overall tap-zone centroid, which is what the BBA pipeline does when it
  // can't find a screen-matched tap.
  const swipeZoneX = tapZoneX;
  const swipeZoneY = tapZoneY;

  const screenDurations = Object.values(session.screenDurations).filter(
    (d): d is number => typeof d === 'number' && Number.isFinite(d) && d > 0,
  );

  const features: number[] = [
    sessionDurationSec, // 0  session_duration_seconds
    mean(tapDurations), // 1  mean_tap_duration_ms
    std(tapDurations), // 2  std_tap_duration_ms
    tapFreq, // 3  tap_frequency_per_sec
    mean(swipeSpeeds), // 4  mean_swipe_speed
    std(swipeSpeeds), // 5  std_swipe_speed
    mean(swipeDistances), // 6  mean_swipe_distance
    std(swipeDistances), // 7  std_swipe_distance
    tapZoneX, // 8  tap_zone_x
    tapZoneY, // 9  tap_zone_y
    swipeZoneX, // 10 swipe_zone_x
    swipeZoneY, // 11 swipe_zone_y
    mean(screenDurations), // 12 mean_screen_duration
    std(screenDurations), // 13 std_screen_duration
    0, // 14 fd_broken
    0, // 15 loan_taken
    0, // 16 time_from_login_to_fd
    0, // 17 time_from_login_to_loan
    0, // 18 time_from_login_transaction
  ];

  return features;
}

/* ------------------------------------------------------------------ */
/*  Inference                                                           */
/* ------------------------------------------------------------------ */

function scale(features: number[]): number[] {
  const { mean: mu, scale: sigma } = MODEL.scaler;
  const out = new Array<number>(features.length);
  for (let i = 0; i < features.length; i++) {
    const s = sigma[i] || 1;
    out[i] = (features[i] - mu[i]) / s;
  }
  return out;
}

function relu(v: number): number {
  return v > 0 ? v : 0;
}

function sigmoid(v: number): number {
  // numerically stable sigmoid
  if (v >= 0) {
    const e = Math.exp(-v);
    return 1 / (1 + e);
  }
  const e = Math.exp(v);
  return e / (1 + e);
}

function applyDense(input: number[], layer: DenseLayer): number[] {
  const inDim = layer.kernel.length;
  const outDim = layer.bias.length;
  const out = new Array<number>(outDim);
  for (let j = 0; j < outDim; j++) {
    let acc = layer.bias[j];
    for (let i = 0; i < inDim; i++) {
      acc += input[i] * layer.kernel[i][j];
    }
    out[j] = layer.activation === 'relu' ? relu(acc) : sigmoid(acc);
  }
  return out;
}

/**
 * Run BBA inference on a behaviour session. Returns the fraud probability
 * and whether it crossed the unusual-activity threshold.
 *
 * Optional `threshold` overrides the default packaged with the model
 * (handy for tuning sensitivity from settings without rebuilding the asset).
 */
export function predict(
  session: BehaviorSession,
  threshold?: number,
): BbaPrediction {
  const raw = extractFeatures(session);
  const scaled = scale(raw);

  let activations = scaled;
  for (const layer of MODEL.layers) {
    activations = applyDense(activations, layer);
  }

  const probability = activations[0] ?? 0;
  const t = threshold ?? MODEL.threshold;
  return {
    probability,
    unusual: probability > t,
    threshold: t,
    scaledFeatures: scaled,
    rawFeatures: raw,
  };
}

/**
 * Quick sanity check — is there enough behaviour in the session to make
 * the BBA score meaningful? We require a minimum of taps + duration so
 * we don't flag empty/cold sessions.
 */
export function hasEnoughSignal(session: BehaviorSession): boolean {
  const sessionDurationMs = session.endTime
    ? session.durationMs
    : Date.now() - session.startTime;
  return sessionDurationMs >= 8000 && session.tapEvents.length >= 6;
}

export const BBA_FEATURE_NAMES = MODEL.feature_names;
export const BBA_DEFAULT_THRESHOLD = MODEL.threshold;
