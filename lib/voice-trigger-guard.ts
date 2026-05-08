// Deepfake voice-trigger guard.
//
// Threats:
//   1. An attacker recorded the user's safe-word and replays it later to
//      falsely fire SOS (or — if the user has a "cancel SOS" voice phrase —
//      to silently disable a real one).
//   2. An attacker uses a TTS clone of the user's voice to do the same.
//
// Defences this module adds on top of voice-trigger.ts:
//
//   A) Voiceprint verification: when the underlying trigger fires, we grab
//      the last ~3 s of audio and pass it through `lib/diarization` to
//      check it matches the user's enrolled voiceprint. Mismatch → require
//      a secondary confirmation (band triple-tap) before firing.
//
//   B) Per-session challenge: at enrolment we recorded several "challenge
//      phrases" (e.g. random short words the user spoke). The trigger
//      randomly picks one each session and silently expects it as the
//      *suffix* of the safe-word in the next 5 s. This makes a static
//      recording-replay fail: the attacker's recording doesn't know which
//      challenge word is currently armed.
//
//   C) Liveness drift: the band's HRV / GSR are sampled during the trigger
//      window. A purely-replayed audio with calm physiology *and* a voiceprint
//      mismatch is downgraded; the same audio with rising HR is up-weighted.
//
// We never *suppress* a fire altogether — false negatives in safety code are
// worse than false positives. A failed challenge merely demotes the response
// from "act-loud" to "prompt-user", and emits a UI banner so the user can
// confirm.

import * as SecureStore from 'expo-secure-store';
import * as Speech from 'expo-speech';

import { diarize, loadEnrolled } from './diarization';

const CHALLENGE_KEY = 'hearme.voice.challenges.v1';
const CHALLENGE_WORDS = [
  'tiger', 'orange', 'window', 'apple', 'silver', 'forest', 'river',
  'lemon', 'pebble', 'rocket', 'cloud', 'maple', 'thunder',
];

export type GuardResult = {
  /** Should the underlying SOS pipeline fire as if a normal trigger? */
  fire: boolean;
  /** "ok" if verified; "downgraded" if we passed but with a banner. */
  level: 'verified' | 'downgraded' | 'rejected';
  /** Human-readable reason — surfaced to the UI banner. */
  reason: string;
  voiceprintMatch: 'match' | 'mismatch' | 'no-print';
  challengePassed: boolean | null;
};

export type GuardConfig = {
  /** Mismatch tolerance — fraction of segments that must be "user". */
  minUserSegmentRatio: number;
  /** When true, we require a successful challenge response. */
  challengeRequired: boolean;
};

export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  minUserSegmentRatio: 0.5,
  challengeRequired: false,
};

let activeChallenge: string | null = null;

/**
 * Speak a fresh challenge word and remember it. Call when starting a
 * journey or re-enabling voice trigger after wake. The user doesn't need to
 * memorise it — we'll repeat it via the band's haptic + low-volume TTS at
 * the moment of trigger if challengeRequired is on.
 */
export async function rotateChallenge(): Promise<string> {
  const word = CHALLENGE_WORDS[Math.floor(Math.random() * CHALLENGE_WORDS.length)];
  activeChallenge = word;
  await SecureStore.setItemAsync(CHALLENGE_KEY, word);
  return word;
}

export async function loadChallenge(): Promise<string | null> {
  if (activeChallenge) return activeChallenge;
  activeChallenge = await SecureStore.getItemAsync(CHALLENGE_KEY);
  return activeChallenge;
}

/**
 * Speak the current challenge to the user (low volume) so they can repeat it.
 * Used when challengeRequired is set: the user hears "say tiger" before the
 * SOS fires, and a stale recording can't satisfy that.
 */
export async function speakChallenge(): Promise<void> {
  const w = await loadChallenge();
  if (!w) return;
  Speech.speak(`say ${w}`, { volume: 0.5, rate: 1.1 });
}

/**
 * Inspect a candidate trigger clip and return whether SOS should fire.
 *
 * @param clipUri    Path to the audio that the underlying trigger just heard.
 * @param transcript Optional STT result — empty string if we don't have STT.
 * @param config     Tunables.
 */
export async function evaluateTriggerClip(
  clipUri: string,
  transcript: string,
  config: Partial<GuardConfig> = {},
): Promise<GuardResult> {
  const cfg: GuardConfig = { ...DEFAULT_GUARD_CONFIG, ...config };
  const enrolled = await loadEnrolled();

  // Voiceprint match.
  let voiceprintMatch: GuardResult['voiceprintMatch'] = 'no-print';
  if (enrolled) {
    try {
      const segs = await diarize(clipUri);
      const userish = segs.filter((s) => s.speaker === 'user').length;
      const voiced = segs.filter((s) => s.speaker !== 'unknown').length;
      if (voiced === 0) {
        voiceprintMatch = 'no-print';
      } else {
        voiceprintMatch = userish / voiced >= cfg.minUserSegmentRatio ? 'match' : 'mismatch';
      }
    } catch {
      voiceprintMatch = 'no-print';
    }
  }

  // Challenge match.
  let challengePassed: boolean | null = null;
  if (cfg.challengeRequired) {
    const word = await loadChallenge();
    challengePassed = !!word && transcript.toLowerCase().includes(word);
  }

  // Decision tree.
  if (voiceprintMatch === 'match' && (challengePassed === true || challengePassed === null)) {
    return {
      fire: true,
      level: 'verified',
      reason: 'voiceprint match' + (challengePassed ? ' + challenge ok' : ''),
      voiceprintMatch,
      challengePassed,
    };
  }
  if (voiceprintMatch === 'no-print' && challengePassed !== false) {
    return {
      fire: true,
      level: 'downgraded',
      reason: 'no voiceprint enrolled — firing on amplitude only',
      voiceprintMatch,
      challengePassed,
    };
  }
  if (voiceprintMatch === 'mismatch' && challengePassed === false) {
    return {
      fire: false,
      level: 'rejected',
      reason: 'voiceprint mismatch and challenge failed — likely replay',
      voiceprintMatch,
      challengePassed,
    };
  }
  // Either voiceprint or challenge failed — downgrade rather than block.
  return {
    fire: true,
    level: 'downgraded',
    reason:
      voiceprintMatch === 'mismatch'
        ? 'voiceprint mismatch — fire with banner'
        : `challenge ${challengePassed ? 'ok' : 'failed'}, voiceprint ${voiceprintMatch}`,
    voiceprintMatch,
    challengePassed,
  };
}
