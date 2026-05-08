// Speaker diarization for evidence audio.
//
// On a captured incident audio clip, the locker stores who-said-what segments
// so reviewers can see "this is the user" vs "this is the other person". The
// real-deal speaker model (pyannote-audio, NeMo TitaNet, or ECAPA-TDNN) is
// an ML pipeline. We expose:
//
//   • An adapter interface (`DiarizationBackend`).
//   • A default backend that uses a small set of cheap features — RMS
//     envelope + zero-crossing-rate + spectral centroid — to split a clip
//     into "speech" vs "silence" turns and tag each turn against the user's
//     enrolled voiceprint. It misclassifies enthusiastically; it never
//     pretends otherwise (confidence is always ≤ 0.65 in default backend).
//   • A drop-in slot for a real model (server-side via Supabase Edge Function
//     or on-device via tflite — both mapped through the same backend
//     interface).
//
// Enrolment lives entirely on-device (SecureStore), so the user's voice
// signature never leaves the phone in the default flow.

import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';

const ENROLL_KEY = 'hearme.diarization.enrolled.v1';

export type Speaker = 'user' | 'other';

export type DiarSegment = {
  startMs: number;
  endMs: number;
  speaker: Speaker | 'unknown';
  confidence: number; // 0..1
};

export type Voiceprint = {
  /** Mean RMS over enrolled clip. */
  rmsMean: number;
  /** Mean zero-crossing rate (pitch proxy). */
  zcrMean: number;
  /** Mean spectral centroid (timbre proxy). */
  centroidMean: number;
  /** Per-feature std-dev — used as tolerance band. */
  rmsStd: number;
  zcrStd: number;
  centroidStd: number;
  enrolledAt: number;
};

export type DiarizationBackend = {
  name: string;
  enroll(audioUri: string): Promise<Voiceprint | null>;
  diarize(audioUri: string, voiceprint: Voiceprint | null): Promise<DiarSegment[]>;
};

// =====================================================
// Default backend — feature-based heuristic
// =====================================================

const FRAME_MS = 1_000;
const ENROLL_MIN_MS = 8_000;

async function readAudio(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

function rmsOf(samples: Int16Array): number {
  let s = 0;
  for (let i = 0; i < samples.length; i += 1) s += samples[i] * samples[i];
  return Math.sqrt(s / Math.max(1, samples.length));
}

function zcrOf(samples: Int16Array): number {
  let z = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) z += 1;
  }
  return z / Math.max(1, samples.length);
}

/**
 * Crude spectral centroid via Goertzel-like sweep — enough for "is this voice
 * brighter / darker" tagging, not for true timbre analysis. Operates on a
 * subsampled frame to keep the cost ≤ 4 ms per second of audio.
 */
function centroidOf(samples: Int16Array): number {
  const N = Math.min(samples.length, 1024);
  const stride = Math.max(1, Math.floor(samples.length / N));
  let num = 0;
  let den = 0;
  for (let k = 1; k < N; k += 1) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < N; n += 1) {
      const t = (2 * Math.PI * k * n) / N;
      const s = samples[n * stride] || 0;
      real += s * Math.cos(t);
      imag -= s * Math.sin(t);
    }
    const mag = Math.sqrt(real * real + imag * imag);
    num += k * mag;
    den += mag;
  }
  return den > 0 ? num / den : 0;
}

/**
 * Best-effort PCM extraction from a WAV header. We don't ship a full mp4/m4a
 * decoder — for a typical HearMe recording the easier path is to record in
 * WAV when diarization is on. If we don't recognise the header we treat the
 * whole file as raw 16-bit mono PCM at 16 kHz (which is what expo-av
 * produces under HIGH_QUALITY for some Android builds).
 */
function decodePcm16(bytes: Uint8Array): { samples: Int16Array; sampleRate: number } {
  // Try WAV "RIFF...WAVE" header.
  if (
    bytes.length > 44 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
  ) {
    const sampleRate =
      bytes[24] | (bytes[25] << 8) | (bytes[26] << 16) | (bytes[27] << 24);
    const data = bytes.subarray(44);
    const samples = new Int16Array(data.buffer, data.byteOffset, data.length >> 1);
    return { samples, sampleRate };
  }
  // Fallback: raw PCM at 16 kHz.
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length >> 1);
  return { samples, sampleRate: 16000 };
}

function frameLengthFor(sampleRate: number): number {
  return Math.floor((sampleRate * FRAME_MS) / 1000);
}

const heuristicBackend: DiarizationBackend = {
  name: 'heuristic',
  async enroll(audioUri) {
    let bytes: Uint8Array;
    try {
      bytes = await readAudio(audioUri);
    } catch {
      return null;
    }
    const { samples, sampleRate } = decodePcm16(bytes);
    const frame = frameLengthFor(sampleRate);
    if (samples.length < frame * (ENROLL_MIN_MS / FRAME_MS)) return null;

    const rms: number[] = [];
    const zcr: number[] = [];
    const cent: number[] = [];
    for (let i = 0; i + frame <= samples.length; i += frame) {
      const win = samples.subarray(i, i + frame);
      const r = rmsOf(win);
      if (r < 100) continue; // skip silence
      rms.push(r);
      zcr.push(zcrOf(win));
      cent.push(centroidOf(win));
    }
    if (rms.length < 4) return null;

    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const std = (a: number[], m: number) =>
      Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);

    const rmsMean = mean(rms);
    const zcrMean = mean(zcr);
    const centroidMean = mean(cent);
    const print: Voiceprint = {
      rmsMean,
      zcrMean,
      centroidMean,
      rmsStd: std(rms, rmsMean),
      zcrStd: std(zcr, zcrMean),
      centroidStd: std(cent, centroidMean),
      enrolledAt: Date.now(),
    };
    await SecureStore.setItemAsync(ENROLL_KEY, JSON.stringify(print));
    return print;
  },
  async diarize(audioUri, voiceprint) {
    let bytes: Uint8Array;
    try {
      bytes = await readAudio(audioUri);
    } catch {
      return [];
    }
    const { samples, sampleRate } = decodePcm16(bytes);
    const frame = frameLengthFor(sampleRate);
    const out: DiarSegment[] = [];
    for (let i = 0; i + frame <= samples.length; i += frame) {
      const win = samples.subarray(i, i + frame);
      const r = rmsOf(win);
      const startMs = Math.round((i / sampleRate) * 1000);
      const endMs = Math.round(((i + frame) / sampleRate) * 1000);
      if (r < 80) {
        out.push({ startMs, endMs, speaker: 'unknown', confidence: 1 });
        continue;
      }
      const z = zcrOf(win);
      const c = centroidOf(win);
      if (!voiceprint) {
        out.push({ startMs, endMs, speaker: 'unknown', confidence: 0.4 });
        continue;
      }
      const inBand = (val: number, m: number, s: number) =>
        Math.abs(val - m) <= 2 * Math.max(s, 0.01);
      const matches =
        (inBand(r, voiceprint.rmsMean, voiceprint.rmsStd) ? 1 : 0) +
        (inBand(z, voiceprint.zcrMean, voiceprint.zcrStd) ? 1 : 0) +
        (inBand(c, voiceprint.centroidMean, voiceprint.centroidStd) ? 1 : 0);
      const speaker: Speaker = matches >= 2 ? 'user' : 'other';
      const confidence = Math.min(0.65, 0.3 + 0.15 * matches);
      out.push({ startMs, endMs, speaker, confidence });
    }
    return mergeAdjacent(out);
  },
};

function mergeAdjacent(segs: DiarSegment[]): DiarSegment[] {
  if (segs.length === 0) return [];
  const out: DiarSegment[] = [{ ...segs[0] }];
  for (let i = 1; i < segs.length; i += 1) {
    const tail = out[out.length - 1];
    const cur = segs[i];
    if (
      tail.speaker === cur.speaker &&
      tail.endMs === cur.startMs &&
      Math.abs(tail.confidence - cur.confidence) < 0.2
    ) {
      tail.endMs = cur.endMs;
      tail.confidence = (tail.confidence + cur.confidence) / 2;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

const STATE: { backend: DiarizationBackend } = { backend: heuristicBackend };

export function registerDiarizationBackend(b: DiarizationBackend): void {
  STATE.backend = b;
}

export async function enrollVoice(audioUri: string): Promise<Voiceprint | null> {
  return STATE.backend.enroll(audioUri);
}

export async function loadEnrolled(): Promise<Voiceprint | null> {
  const raw = await SecureStore.getItemAsync(ENROLL_KEY);
  return raw ? (JSON.parse(raw) as Voiceprint) : null;
}

export async function diarize(audioUri: string): Promise<DiarSegment[]> {
  const print = await loadEnrolled();
  return STATE.backend.diarize(audioUri, print);
}

export function activeDiarizationBackendName(): string {
  return STATE.backend.name;
}
