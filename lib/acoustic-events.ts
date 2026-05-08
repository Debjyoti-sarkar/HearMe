// Acoustic event detection.
//
// A cheap, always-on classifier of "what just happened in the room": glass
// break, scream, gunshot, raised voices, vehicle revs. Used by:
//   • the threat-classifier as a high-confidence signal,
//   • the journey monitor to auto-fire on a scream during an active route,
//   • the evidence locker as auto-tags on captured audio clips.
//
// Two backends:
//   • Default `EnvelopeBackend` — runs on the metering signal we already
//     get from expo-av. Detects "scream" (sustained high-amplitude wideband)
//     and "thud" (single high spike) using a tiny rule set. No model.
//   • Pluggable `TFLiteBackend` slot — for a real YAMNet model loaded via a
//     native bridge (e.g. tensorflow/tflite RN module). Same input/output
//     contract; drop-in replacement once the native module ships.
//
// Both backends emit the same `AcousticEvent` shape so the rest of the app
// is backend-agnostic.

import { Audio } from 'expo-av';

export type AcousticEventLabel =
  | 'scream'
  | 'shouting'
  | 'crying'
  | 'baby-crying'
  | 'glass-break'
  | 'gunshot'
  | 'siren'
  | 'door-slam'
  | 'thud'
  | 'argument'
  | 'silence';

export type AcousticEvent = {
  label: AcousticEventLabel;
  confidence: number; // 0..1
  startedAt: number;
  endedAt: number;
};

export type AcousticBackend = {
  name: string;
  start(onEvent: (e: AcousticEvent) => void): Promise<boolean>;
  stop(): Promise<void>;
  /** True if the backend is producing events. */
  isRunning(): boolean;
};

// =====================================================
// Default backend — meter-only envelope detector
// =====================================================

const SAMPLE_MS = 100;
const SCREAM_DBFS = -10;
const SHOUT_DBFS = -22;
const SCREAM_FRAMES = 12; // ~1.2 s
const SHOUT_FRAMES = 8;
const THUD_DBFS = -6;

class EnvelopeBackend implements AcousticBackend {
  name = 'envelope';
  private rec: Audio.Recording | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private screamCount = 0;
  private shoutCount = 0;
  private quietCount = 0;
  private startedAt = 0;
  private last: { dbfs: number; at: number }[] = [];
  private cb: ((e: AcousticEvent) => void) | null = null;
  private running = false;

  async start(onEvent: (e: AcousticEvent) => void): Promise<boolean> {
    if (this.running) return true;
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) return false;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      ...Audio.RecordingOptionsPresets.LOW_QUALITY,
      isMeteringEnabled: true,
    });
    await recording.startAsync();
    this.rec = recording;
    this.cb = onEvent;
    this.startedAt = Date.now();
    this.running = true;
    this.timer = setInterval(() => {
      void this.poll();
    }, SAMPLE_MS);
    return true;
  }

  isRunning(): boolean {
    return this.running;
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.rec) {
      try {
        await this.rec.stopAndUnloadAsync();
      } catch {
        /* ignore */
      }
      this.rec = null;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch {
      /* ignore */
    }
    this.cb = null;
  }

  private async poll(): Promise<void> {
    if (!this.rec || !this.cb) return;
    try {
      const status = await this.rec.getStatusAsync();
      const m = (status as { metering?: number }).metering;
      if (typeof m !== 'number') return;
      const now = Date.now();
      this.last.push({ dbfs: m, at: now });
      if (this.last.length > 40) this.last.shift();

      // Single-frame thud / glass-break — very loud transient followed by
      // immediate quiet.
      if (m > THUD_DBFS) {
        const before = this.last.slice(-6, -1);
        if (before.every((s) => s.dbfs < -25)) {
          this.cb({
            label: 'thud',
            confidence: 0.55,
            startedAt: now - SAMPLE_MS,
            endedAt: now,
          });
        }
      }

      // Sustained scream — 1.2 s of >-10 dBFS.
      if (m > SCREAM_DBFS) {
        this.screamCount += 1;
        if (this.screamCount === SCREAM_FRAMES) {
          this.cb({
            label: 'scream',
            confidence: 0.7,
            startedAt: now - SCREAM_FRAMES * SAMPLE_MS,
            endedAt: now,
          });
        }
      } else {
        this.screamCount = Math.max(0, this.screamCount - 1);
      }

      if (m > SHOUT_DBFS) {
        this.shoutCount += 1;
        if (this.shoutCount === SHOUT_FRAMES) {
          this.cb({
            label: 'shouting',
            confidence: 0.55,
            startedAt: now - SHOUT_FRAMES * SAMPLE_MS,
            endedAt: now,
          });
        }
      } else {
        this.shoutCount = Math.max(0, this.shoutCount - 1);
      }

      if (m < -55) {
        this.quietCount += 1;
        if (this.quietCount === 100) {
          this.cb({
            label: 'silence',
            confidence: 1,
            startedAt: now - 100 * SAMPLE_MS,
            endedAt: now,
          });
        }
      } else {
        this.quietCount = 0;
      }
    } catch {
      /* swallow polling glitches */
    }
  }
}

const STATE: { backend: AcousticBackend } = {
  backend: new EnvelopeBackend(),
};

export function registerAcousticBackend(b: AcousticBackend): void {
  void STATE.backend.stop();
  STATE.backend = b;
}

export async function startAcousticDetection(
  onEvent: (e: AcousticEvent) => void,
): Promise<boolean> {
  return STATE.backend.start(onEvent);
}

export async function stopAcousticDetection(): Promise<void> {
  return STATE.backend.stop();
}

export function isAcousticDetectionRunning(): boolean {
  return STATE.backend.isRunning();
}

export function activeAcousticBackendName(): string {
  return STATE.backend.name;
}

/**
 * Recipe for plugging in a real YAMNet TFLite model.
 *
 *  1. Add native dep: `react-native-fast-tflite`. Bundle yamnet.tflite under
 *     android/app/src/main/assets/ and ios resources.
 *  2. Implement `TFLiteAcousticBackend` here:
 *       - load the model once
 *       - feed 0.96-s audio windows as Float32Array(15600)
 *       - the output is 521 logits per window — top-K → AcousticEventLabel
 *       - emit an AcousticEvent with confidence = softmax score
 *  3. registerAcousticBackend(new TFLiteAcousticBackend()) on app start.
 *
 * The label set is a strict subset of YAMNet's AudioSet ontology — common
 * mappings: "Screaming"→scream, "Glass break"→glass-break, "Gunshot, gunfire"
 * →gunshot, "Crying, sobbing"→crying, "Vehicle horn, car horn"→siren, etc.
 */
export const TFLITE_RECIPE = '__see lib/acoustic-events.ts source for plug-in recipe__';
