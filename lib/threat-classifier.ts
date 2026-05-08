// Threat-context classifier.
//
// Single feature triggers (HR spike, GSR phasic, voice-meter loud) all over-
// fire on benign events: sprinting for a bus, watching a horror film, a
// hairdryer in the bathroom. The threat-context classifier combines the
// recent multi-modal context — audio transcript snippets, sensor windows,
// time of day, isolation score, location risk — into a single 0..1 score
// with a human-readable rationale.
//
// Two backends are supported:
//   • The default `HeuristicBackend` runs entirely locally. It walks a
//     transparent rule list and returns a score + rationale. Good enough to
//     suppress the most common false positives.
//   • A pluggable `LLMBackend` slot for an on-device language model
//     (e.g. Gemma 2B / Phi-3-mini via react-native-mlc-llm). When registered,
//     it gets the same input dictionary and returns the same output shape;
//     callers see no API difference.
//
// The classifier is the *gatekeeper* between fusion verdicts and acting
// (silent SOS / alarm / escalation). Scores ≥ 0.7 = act now;
// 0.4–0.7 = warn user, ask "fire SOS?"; < 0.4 = ignore.

import type { Verdict } from './neuroband-fusion';
import type { IsolationScore } from './isolation-score';
import type { DriveVerdict } from './drive-passenger';

export type ClassifierInput = {
  /** Recent voice transcript snippets, oldest first. */
  transcript: string[];
  /** NeuroBand fusion verdict, if available. */
  fusion: Verdict | null;
  /** Live isolation score, if available. */
  isolation: IsolationScore | null;
  /** Movement context (driver / passenger / on-foot / idle). */
  drive: DriveVerdict | null;
  /** Wall-clock hour 0..23. */
  hour: number;
  /** True if location is a saved safe zone. */
  inSafeZone: boolean;
  /** True if the user opted into a journey monitor right now. */
  inJourney: boolean;
  /** Optional acoustic-event labels detected in the last 30 s (yamnet). */
  acousticEvents: string[];
};

export type ThreatVerdict = {
  score: number; // 0..1
  rationale: string[];
  recommended: 'ignore' | 'prompt' | 'act-silent' | 'act-loud';
};

export type ClassifierBackend = {
  name: string;
  classify(input: ClassifierInput): Promise<ThreatVerdict>;
};

const DISTRESS_PHRASES = [
  'help',
  'stop',
  'leave me',
  'no please',
  "don't",
  'somebody',
  'call the police',
  'call my mum',
  'rape',
  'fire',
];

const ACOUSTIC_HIGH_RISK = new Set([
  'scream',
  'screaming',
  'glass-break',
  'gunshot',
  'shouting',
  'siren',
]);

const ACOUSTIC_MID_RISK = new Set([
  'crying',
  'baby-crying',
  'argument',
  'door-slam',
  'thud',
]);

const heuristicBackend: ClassifierBackend = {
  name: 'heuristic',
  async classify(input) {
    let score = 0;
    const why: string[] = [];

    // Fusion contribution: a sustained fusion fire = strong signal but not
    // sufficient on its own (HRV / GSR can spike for benign reasons).
    if (input.fusion?.fire) {
      score += 0.45;
      why.push(`band fusion fired (${input.fusion.markers.join('+')})`);
    } else if (input.fusion && input.fusion.markers.length > 0) {
      score += 0.1 * input.fusion.markers.length;
      why.push(`band partial fire (${input.fusion.markers.length}/5 markers)`);
    }

    // Transcript contribution.
    const text = input.transcript.join(' ').toLowerCase();
    let hits = 0;
    for (const phrase of DISTRESS_PHRASES) {
      if (text.includes(phrase)) hits += 1;
    }
    if (hits > 0) {
      score += Math.min(0.4, 0.18 + 0.06 * hits);
      why.push(`distress phrase × ${hits}`);
    }

    // Acoustic contribution.
    const aHigh = input.acousticEvents.filter((e) => ACOUSTIC_HIGH_RISK.has(e));
    const aMid = input.acousticEvents.filter((e) => ACOUSTIC_MID_RISK.has(e));
    if (aHigh.length > 0) {
      score += Math.min(0.35, 0.2 + 0.08 * aHigh.length);
      why.push(`acoustic high-risk: ${aHigh.join(', ')}`);
    } else if (aMid.length > 0) {
      score += Math.min(0.15, 0.05 * aMid.length);
      why.push(`acoustic mid-risk: ${aMid.join(', ')}`);
    }

    // Isolation contribution — high isolation amplifies, safe-zone subtracts.
    if (input.isolation) {
      const iso = input.isolation.total;
      if (iso >= 70) {
        score += 0.12;
        why.push(`isolation high (${iso})`);
      } else if (iso >= 40) {
        score += 0.05;
      }
    }

    // Driver context — if the user is the driver, soften the score: motion
    // alarms during driving usually aren't threats.
    if (input.drive?.class === 'driver') {
      score *= 0.7;
      why.push('driver context — softened');
    }
    if (input.drive?.class === 'idle' && !input.inJourney) {
      score *= 0.85;
    }

    // Safe zone — strong subtraction.
    if (input.inSafeZone) {
      score *= 0.5;
      why.push('inside safe zone — softened');
    }

    // Late-night small bonus.
    if (input.hour >= 22 || input.hour < 5) {
      score += 0.05;
      why.push('late hour');
    }

    score = Math.max(0, Math.min(1, score));

    let recommended: ThreatVerdict['recommended'];
    if (score >= 0.85) recommended = 'act-loud';
    else if (score >= 0.7) recommended = 'act-silent';
    else if (score >= 0.4) recommended = 'prompt';
    else recommended = 'ignore';

    return { score, rationale: why, recommended };
  },
};

const STATE: { backend: ClassifierBackend } = { backend: heuristicBackend };

export function registerClassifierBackend(b: ClassifierBackend): void {
  STATE.backend = b;
}

export function getActiveBackendName(): string {
  return STATE.backend.name;
}

export async function classifyThreat(input: ClassifierInput): Promise<ThreatVerdict> {
  return STATE.backend.classify(input);
}

/**
 * Helper for an LLM backend — produces a compact single-line prompt summarizing
 * the input. Off-device LLMs and on-device ones tend to score better when fed
 * a single-line schema rather than a multi-paragraph blob.
 */
export function summarizeInputForLLM(input: ClassifierInput): string {
  const parts: string[] = [];
  parts.push(`hour=${input.hour}`);
  parts.push(`fusion=${input.fusion?.fire ? 'FIRE' : input.fusion?.markers.join('+') || 'none'}`);
  parts.push(`isolation=${input.isolation?.total ?? '?'}`);
  parts.push(`drive=${input.drive?.class ?? '?'}`);
  parts.push(`safe=${input.inSafeZone}`);
  parts.push(`journey=${input.inJourney}`);
  if (input.acousticEvents.length > 0) parts.push(`audio=[${input.acousticEvents.join(',')}]`);
  if (input.transcript.length > 0) parts.push(`transcript="${input.transcript.slice(-3).join(' / ')}"`);
  return parts.join(' ');
}
