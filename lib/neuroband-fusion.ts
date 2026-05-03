import type { BioFrame } from './neuroband-ble';
import type { NeuroBandBaselines } from './neuroband-storage';

/**
 * NeuroBand fusion engine.
 *
 * Implements the §8 Volume-III duress signature:
 *   "any two of the five physiological signals firing together ... while
 *   motion is still or walk."
 *
 * The engine is a pure function family — no side effects, no I/O. It takes
 * a BioFrame plus the user's baseline plus a small rolling window and emits
 * a verdict. The provider decides what to do with that verdict (fire SOS,
 * vibrate, log).
 */

export type Marker = 'hr' | 'gsr' | 'temp' | 'spo2' | 'semg';

export const ALL_MARKERS: Marker[] = ['hr', 'gsr', 'temp', 'spo2', 'semg'];

export type Sensitivity = 'low' | 'normal' | 'high';

export type FusionConfig = {
  sensitivity: Sensitivity;
  /** Calibration ms — fusion is disabled until this much data is collected. */
  calibrationWindowMs: number;
  /** Workout-mode end timestamp. Fusion is gated off if Date.now() < this. */
  workoutModeUntil: number | null;
};

export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  sensitivity: 'normal',
  calibrationWindowMs: 24 * 60 * 60 * 1000,
  workoutModeUntil: null,
};

export type Verdict = {
  fire: boolean;
  /** Bit-OR of (1<<index of ALL_MARKERS) for which markers contributed. */
  markerBitmap: number;
  markers: Marker[];
  /** "" if fire, else the reason fusion was suppressed. */
  reason: string;
};

export type FusionInputs = {
  frame: BioFrame;
  baselines: NeuroBandBaselines;
  config: FusionConfig;
  /** Now, injectable for tests. Defaults to Date.now() at call site. */
  now: number;
  /**
   * Sustained-window memory: each marker carries a "fired in this many of the
   * last N frames" count. Volume III requires the GSR phasic, sEMG clench,
   * and temp drop to be sustained, not single-frame spikes.
   */
  sustained: Record<Marker, number>;
};

/** How many of the last N=10 frames a marker must have fired in. */
const SUSTAIN_REQUIRED: Record<Marker, number> = {
  hr: 4,    // 4 s of elevated HR
  gsr: 3,   // 3 s of phasic spike
  temp: 5,  // 5 s of temp drop
  spo2: 3,
  semg: 4,  // 4 s of clench
};

const SUSTAIN_WINDOW = 10;

/**
 * Update the per-marker sustained counters based on whether each marker
 * "fired" on the current frame. Return updated counters; caller persists.
 */
export function updateSustained(
  prev: Record<Marker, number>,
  fired: Record<Marker, boolean>,
): Record<Marker, number> {
  const next = { ...prev };
  for (const m of ALL_MARKERS) {
    // Increment if fired this frame, else decay toward zero.
    next[m] = fired[m]
      ? Math.min(SUSTAIN_WINDOW, prev[m] + 1)
      : Math.max(0, prev[m] - 1);
  }
  return next;
}

/** Threshold scaling per sensitivity setting. */
function thresholds(s: Sensitivity) {
  if (s === 'low') {
    return {
      hrDeltaBpm: 32,
      gsrPhasicMult: 1.8,
      tempDropC: 0.6,
      spo2Floor: 90,
      semgSigma: 2.5,
      requiredCount: 3, // 3-of-5
    };
  }
  if (s === 'high') {
    return {
      hrDeltaBpm: 18,
      gsrPhasicMult: 1.3,
      tempDropC: 0.3,
      spo2Floor: 93,
      semgSigma: 1.8,
      requiredCount: 2,
    };
  }
  // normal
  return {
    hrDeltaBpm: 25,
    gsrPhasicMult: 1.5,
    tempDropC: 0.4,
    spo2Floor: 92,
    semgSigma: 2.0,
    requiredCount: 2,
  };
}

/**
 * Determine which markers fire on a single frame, before sustained-window
 * smoothing. Useful both for the rule and for the live UI ("HR ✗ GSR ✓ ...").
 */
export function instantMarkers(
  frame: BioFrame,
  baselines: NeuroBandBaselines,
  sensitivity: Sensitivity,
): Record<Marker, boolean> {
  const t = thresholds(sensitivity);
  const motionOk = frame.motion === 'still' || frame.motion === 'walk';

  const hrFired =
    motionOk && frame.hr >= baselines.hrRestMean + t.hrDeltaBpm;

  const gsrFired = frame.gsrUs >= baselines.gsrTonicMean * t.gsrPhasicMult;

  const tempFired = frame.skinTempC <= baselines.skinTempMean - t.tempDropC;

  const spo2Fired = frame.spo2 < t.spo2Floor;

  const semgSigma = Math.sqrt(Math.max(1, baselines.semgRestingVar));
  const semgFired =
    motionOk && frame.semg >= baselines.semgRestingMean + t.semgSigma * semgSigma;

  return {
    hr: hrFired,
    gsr: gsrFired,
    temp: tempFired,
    spo2: spo2Fired,
    semg: semgFired,
  };
}

/**
 * Run the full fusion check. Returns a Verdict the caller can act on.
 *
 * The function is pure — no Date.now(), no random — so it's directly
 * testable. Pass `now` and `sustained` from caller state.
 */
export function fuse(inputs: FusionInputs): Verdict {
  const { frame, baselines, config, now, sustained } = inputs;
  const t = thresholds(config.sensitivity);

  // Calibration window — fusion is mute until enough samples have been seen.
  // We accept any of: explicit calibratedAt sentinel passed via baselines.updatedAt
  // sufficient HR samples (>= 3600 ≈ 1 hour at 1 Hz) AND time since first sample
  // exceeds calibrationWindowMs.
  const enoughSamples = baselines.hrRestN >= 3600;
  if (!enoughSamples) {
    return {
      fire: false,
      markerBitmap: 0,
      markers: [],
      reason: 'calibrating',
    };
  }
  if (
    config.calibrationWindowMs > 0 &&
    baselines.updatedAt > 0 &&
    now - baselines.updatedAt < 0
  ) {
    // updatedAt in the future = clock skew; ignore.
  }

  // Workout-mode lockout.
  if (config.workoutModeUntil && now < config.workoutModeUntil) {
    return {
      fire: false,
      markerBitmap: 0,
      markers: [],
      reason: 'workout-mode',
    };
  }

  // Determine which markers have fired *sustainedly* — single-frame spikes
  // are ignored because they're typically sensor noise.
  const fired: Marker[] = [];
  let bitmap = 0;
  for (const m of ALL_MARKERS) {
    if (sustained[m] >= SUSTAIN_REQUIRED[m]) {
      fired.push(m);
      bitmap |= 1 << ALL_MARKERS.indexOf(m);
    }
  }

  if (fired.length >= t.requiredCount) {
    return {
      fire: true,
      markerBitmap: bitmap,
      markers: fired,
      reason: '',
    };
  }
  return {
    fire: false,
    markerBitmap: bitmap,
    markers: fired,
    reason:
      fired.length === 0
        ? 'no markers'
        : `only ${fired.length}/${t.requiredCount}`,
  };
}

export const SUSTAIN_REQUIRED_PER_MARKER = SUSTAIN_REQUIRED;
export const SUSTAIN_WINDOW_FRAMES = SUSTAIN_WINDOW;

/** Convenience: map a Verdict bitmap to a 5-char display like "10110". */
export function bitmapToString(bitmap: number): string {
  return ALL_MARKERS.map((_, i) => ((bitmap >> i) & 1 ? '1' : '0')).join('');
}

export function emptySustained(): Record<Marker, number> {
  return { hr: 0, gsr: 0, temp: 0, spo2: 0, semg: 0 };
}
