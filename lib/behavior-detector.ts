/**
 * Behavior Detector
 * Adapted from PhishSafe SDK's screen recording detector + suspicious behavior detector.
 *
 * Detects high-level behavioral patterns that may indicate safety concerns:
 *   - Panic interaction (rapid, erratic taps)
 *   - Phone handoff (sudden behavioral shift)
 *   - Coerced usage (hesitant, unusual navigation)
 *   - Screen inactivity (phone may be taken away)
 */

import type { BehaviorSession, BehaviorBaseline } from './behavior-tracker';
import { getSessionStats } from './behavior-tracker';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type DetectionType =
  | 'panic'
  | 'handoff'
  | 'coercion'
  | 'inactivity'
  | 'normal';

export type DetectionResult = {
  type: DetectionType;
  confidence: number; // 0-100
  label: string;
  description: string;
  icon: string;
  actionSuggestion: string;
};

/* ------------------------------------------------------------------ */
/*  Pattern detection                                                  */
/* ------------------------------------------------------------------ */

function detectPanic(session: BehaviorSession): DetectionResult | null {
  const taps = session.tapEvents;
  if (taps.length < 8) return null;

  // Check for rapid taps with high variance in position (frantic)
  const recentTaps = taps.slice(-15);
  let rapidCount = 0;
  let positionVariance = 0;

  for (let i = 1; i < recentTaps.length; i++) {
    const gap = recentTaps[i].timestamp - recentTaps[i - 1].timestamp;
    if (gap < 300) rapidCount++;

    const dx = recentTaps[i].x - recentTaps[i - 1].x;
    const dy = recentTaps[i].y - recentTaps[i - 1].y;
    positionVariance += Math.sqrt(dx * dx + dy * dy);
  }

  const rapidRatio = rapidCount / (recentTaps.length - 1);
  const avgPosJump = positionVariance / (recentTaps.length - 1);

  // Panic: rapid taps + jumping all over the screen
  if (rapidRatio > 0.6 && avgPosJump > 150) {
    const confidence = Math.min(95, Math.round(rapidRatio * 70 + (avgPosJump > 300 ? 25 : 10)));
    return {
      type: 'panic',
      confidence,
      label: 'Panic Pattern',
      description: 'Rapid, scattered tapping detected — may indicate distress or frantic usage.',
      icon: 'alert-circle',
      actionSuggestion: 'Consider sending a silent SOS to trusted contacts.',
    };
  }

  return null;
}

function detectHandoff(
  session: BehaviorSession,
  baseline: BehaviorBaseline | null,
): DetectionResult | null {
  if (!baseline || baseline.sessionsUsed < 3) return null;

  const stats = getSessionStats(session);
  const taps = session.tapEvents;
  if (taps.length < 10) return null;

  let mismatches = 0;

  // Check tap duration deviation
  if (stats.avgTapDurationMs > 0 && baseline.avgTapDurationMs > 0) {
    const ratio = stats.avgTapDurationMs / baseline.avgTapDurationMs;
    if (ratio < 0.35 || ratio > 3.0) mismatches++;
  }

  // Check zone distribution shift
  const total = taps.length;
  const zones = stats.zoneDistribution;
  let zoneShift = 0;
  for (const [zone, baseRatio] of Object.entries(baseline.tapZoneDistribution)) {
    const currentRatio = (zones[zone] ?? 0) / total;
    zoneShift += Math.abs(currentRatio - baseRatio);
  }
  if (zoneShift > 0.5) mismatches++;

  // Check interaction rate
  const sessionMin = stats.sessionDurationMs / 60000;
  if (sessionMin > 0.5) {
    const baseRate = baseline.avgTapsPerSession / (baseline.avgSessionDurationMs / 60000);
    const currentRate = taps.length / sessionMin;
    if (baseRate > 0 && (currentRate > baseRate * 2.5 || currentRate < baseRate * 0.25)) {
      mismatches++;
    }
  }

  if (mismatches >= 2) {
    const confidence = Math.min(90, 40 + mismatches * 20);
    return {
      type: 'handoff',
      confidence,
      label: 'Different User Detected',
      description:
        'Interaction patterns significantly differ from your baseline — someone else may be using the phone.',
      icon: 'account-switch',
      actionSuggestion: 'Verify your phone is still in your possession.',
    };
  }

  return null;
}

function detectCoercion(session: BehaviorSession): DetectionResult | null {
  const taps = session.tapEvents;
  if (taps.length < 10) return null;

  // Coercion indicators: long hesitations between taps, slow deliberate taps
  const gaps: number[] = [];
  for (let i = 1; i < taps.length; i++) {
    gaps.push(taps[i].timestamp - taps[i - 1].timestamp);
  }

  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const longPauses = gaps.filter((g) => g > 5000).length;
  const avgDuration = taps.reduce((s, t) => s + t.durationMs, 0) / taps.length;

  // Many long pauses + slow deliberate taps
  if (longPauses >= 3 && avgDuration > 500 && avgGap > 3000) {
    const confidence = Math.min(80, 30 + longPauses * 10 + (avgDuration > 1000 ? 15 : 0));
    return {
      type: 'coercion',
      confidence,
      label: 'Coerced Usage',
      description:
        'Unusually hesitant interaction with long pauses — may indicate use under pressure.',
      icon: 'hand-back-right',
      actionSuggestion: 'If you feel unsafe, use the shake-to-SOS feature for a discreet alert.',
    };
  }

  return null;
}

function detectInactivity(session: BehaviorSession): DetectionResult | null {
  const stats = getSessionStats(session);

  // Long session with no meaningful interaction
  if (
    stats.sessionDurationMs > 120000 &&
    stats.totalTaps < 2 &&
    stats.totalSwipes < 1
  ) {
    return {
      type: 'inactivity',
      confidence: 60,
      label: 'Extended Inactivity',
      description:
        'Phone has been active for over 2 minutes with no interaction — may be unattended.',
      icon: 'sleep',
      actionSuggestion: 'Ensure your phone is still with you.',
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Main detection function                                            */
/* ------------------------------------------------------------------ */

export function detectBehaviorPatterns(
  session: BehaviorSession,
  baseline: BehaviorBaseline | null,
): DetectionResult[] {
  const results: DetectionResult[] = [];

  const panic = detectPanic(session);
  if (panic) results.push(panic);

  const handoff = detectHandoff(session, baseline);
  if (handoff) results.push(handoff);

  const coercion = detectCoercion(session);
  if (coercion) results.push(coercion);

  const inactivity = detectInactivity(session);
  if (inactivity) results.push(inactivity);

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Get a single summary detection — the most concerning pattern, or 'normal'.
 */
export function getPrimaryDetection(
  session: BehaviorSession,
  baseline: BehaviorBaseline | null,
): DetectionResult {
  const detections = detectBehaviorPatterns(session, baseline);

  if (detections.length === 0) {
    return {
      type: 'normal',
      confidence: 85,
      label: 'Normal Usage',
      description: 'Interaction patterns appear normal.',
      icon: 'shield-check',
      actionSuggestion: 'No action needed.',
    };
  }

  return detections[0];
}
