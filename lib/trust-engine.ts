/**
 * Behavioral Trust & Distress Engine
 * Adapted from PhishSafe SDK BehaviourManager + TrustModel (BBA banking project).
 *
 * Instead of detecting fraud, this engine detects:
 *   - Someone else using the phone (behavioral mismatch)
 *   - User under duress (panic patterns)
 *   - Erratic / abnormal interaction (potential danger signal)
 *
 * Trust score 0-100:
 *   80-100  Normal   — behavior matches baseline
 *   60-79   Unusual  — minor deviations detected
 *   40-59   Suspect  — significant anomalies
 *   0-39    Alert    — strong distress / impostor signals
 */

import type { BehaviorBaseline, BehaviorSession } from './behavior-tracker';
import { getSessionStats } from './behavior-tracker';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type TrustLevel = 'normal' | 'unusual' | 'suspect' | 'alert';

export type BehaviorFlag = {
  id: number;
  label: string;
  penalty: number;
  detail: string;
};

export type TrustResult = {
  score: number;
  level: TrustLevel;
  color: string;
  flags: BehaviorFlag[];
  hasBaseline: boolean;
  sessionDurationMs: number;
};

/* ------------------------------------------------------------------ */
/*  Behavior IDs  (adapted from PhishSafe's 50+ behavior catalogue)   */
/* ------------------------------------------------------------------ */

const BEHAVIORS = {
  VERY_FAST_TAPS: 1,
  VERY_SLOW_TAPS: 2,
  ERRATIC_TAP_SPEED: 3,
  RAPID_SCREEN_SWITCHING: 4,
  UNUSUAL_TAP_ZONE: 5,
  ABNORMAL_SWIPE_SPEED: 6,
  VERY_SHORT_SESSION: 7,
  TAP_BURST: 8,
  NO_INTERACTION: 9,
  TAP_DURATION_MISMATCH: 10,
  SWIPE_SPEED_MISMATCH: 11,
  ZONE_DISTRIBUTION_SHIFT: 12,
  SESSION_LENGTH_MISMATCH: 13,
  INTERACTION_RATE_MISMATCH: 14,
} as const;

/* ------------------------------------------------------------------ */
/*  Level helpers                                                      */
/* ------------------------------------------------------------------ */

export function scoreToLevel(score: number): TrustLevel {
  if (score >= 80) return 'normal';
  if (score >= 60) return 'unusual';
  if (score >= 40) return 'suspect';
  return 'alert';
}

export function levelColor(level: TrustLevel): string {
  switch (level) {
    case 'normal':
      return '#10b981';
    case 'unusual':
      return '#3b82f6';
    case 'suspect':
      return '#f59e0b';
    case 'alert':
      return '#ef4444';
  }
}

/* ------------------------------------------------------------------ */
/*  Rule-based analysis (no baseline needed)                           */
/* ------------------------------------------------------------------ */

function analyzeRules(session: BehaviorSession): BehaviorFlag[] {
  const flags: BehaviorFlag[] = [];
  const stats = getSessionStats(session);
  const taps = session.tapEvents;
  const swipes = session.swipeEvents;

  // 1. Very fast taps (<80ms average) — possible bot or panic
  if (taps.length > 5 && stats.avgTapDurationMs > 0 && stats.avgTapDurationMs < 80) {
    flags.push({
      id: BEHAVIORS.VERY_FAST_TAPS,
      label: 'Very fast taps',
      penalty: -8,
      detail: `Avg tap ${stats.avgTapDurationMs}ms — may indicate panic or unfamiliar user`,
    });
  }

  // 2. Very slow taps (>2000ms average) — hesitation or unfamiliar user
  if (taps.length > 5 && stats.avgTapDurationMs > 2000) {
    flags.push({
      id: BEHAVIORS.VERY_SLOW_TAPS,
      label: 'Very slow taps',
      penalty: -6,
      detail: `Avg tap ${stats.avgTapDurationMs}ms — unusual hesitation`,
    });
  }

  // 3. Erratic tap speed — high variance in tap duration
  if (taps.length > 10) {
    const durations = taps.map((t) => t.durationMs);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance =
      durations.reduce((sum, d) => sum + (d - mean) ** 2, 0) / durations.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > mean * 1.5) {
      flags.push({
        id: BEHAVIORS.ERRATIC_TAP_SPEED,
        label: 'Erratic tap rhythm',
        penalty: -10,
        detail: `Tap duration std dev ${Math.round(stdDev)}ms vs mean ${Math.round(mean)}ms — inconsistent pattern`,
      });
    }
  }

  // 4. Rapid screen switching — jumping between screens very quickly
  if (session.screenVisits.length > 0) {
    const shortVisits = session.screenVisits.filter(
      (v) => v.durationMs > 0 && v.durationMs < 2000,
    );
    const ratio = shortVisits.length / session.screenVisits.length;
    if (ratio > 0.6 && session.screenVisits.length > 4) {
      flags.push({
        id: BEHAVIORS.RAPID_SCREEN_SWITCHING,
        label: 'Rapid screen switching',
        penalty: -8,
        detail: `${Math.round(ratio * 100)}% of screens viewed under 2s — frantic navigation`,
      });
    }
  }

  // 5. Unusual tap zone concentration (>80% in one zone)
  if (taps.length > 10) {
    const total = taps.length;
    for (const [zone, count] of Object.entries(stats.zoneDistribution)) {
      if (count / total > 0.8) {
        flags.push({
          id: BEHAVIORS.UNUSUAL_TAP_ZONE,
          label: 'Unusual tap zone',
          penalty: -5,
          detail: `${Math.round((count / total) * 100)}% taps in ${zone} — atypical pattern`,
        });
        break;
      }
    }
  }

  // 6. Abnormal swipe speed
  if (swipes.length > 3 && stats.avgSwipeSpeedPxPerMs > 3) {
    flags.push({
      id: BEHAVIORS.ABNORMAL_SWIPE_SPEED,
      label: 'Abnormal swipe speed',
      penalty: -6,
      detail: `Avg swipe speed ${stats.avgSwipeSpeedPxPerMs} px/ms — unusually fast`,
    });
  }

  // 7. Very short session (<10s with interactions) — grab & look
  if (stats.sessionDurationMs < 10000 && taps.length > 3) {
    flags.push({
      id: BEHAVIORS.VERY_SHORT_SESSION,
      label: 'Very short session',
      penalty: -5,
      detail: 'Session under 10 seconds with activity — possible phone grab',
    });
  }

  // 8. Tap burst — 10+ taps within 2 seconds
  if (taps.length > 10) {
    for (let i = 0; i < taps.length - 9; i++) {
      if (taps[i + 9].timestamp - taps[i].timestamp < 2000) {
        flags.push({
          id: BEHAVIORS.TAP_BURST,
          label: 'Tap burst detected',
          penalty: -12,
          detail: '10+ taps in under 2 seconds — panic tapping or automated input',
        });
        break;
      }
    }
  }

  // 9. No interaction for extended time (session > 60s but < 3 taps)
  if (stats.sessionDurationMs > 60000 && taps.length < 3 && swipes.length < 2) {
    flags.push({
      id: BEHAVIORS.NO_INTERACTION,
      label: 'No interaction',
      penalty: -4,
      detail: 'Session over 60s with almost no interaction — phone may be unattended',
    });
  }

  return flags;
}

/* ------------------------------------------------------------------ */
/*  Baseline-aware analysis                                            */
/* ------------------------------------------------------------------ */

function analyzeAgainstBaseline(
  session: BehaviorSession,
  baseline: BehaviorBaseline,
): BehaviorFlag[] {
  const flags: BehaviorFlag[] = [];
  const stats = getSessionStats(session);
  const taps = session.tapEvents;

  // 10. Tap duration significantly different from baseline
  if (
    taps.length > 5 &&
    baseline.avgTapDurationMs > 0 &&
    stats.avgTapDurationMs > 0
  ) {
    const ratio = stats.avgTapDurationMs / baseline.avgTapDurationMs;
    if (ratio < 0.4 || ratio > 2.5) {
      flags.push({
        id: BEHAVIORS.TAP_DURATION_MISMATCH,
        label: 'Tap duration mismatch',
        penalty: -15,
        detail: `Current ${stats.avgTapDurationMs}ms vs baseline ${Math.round(baseline.avgTapDurationMs)}ms — different user pattern`,
      });
    }
  }

  // 11. Swipe speed deviation from baseline
  if (
    session.swipeEvents.length > 3 &&
    baseline.avgSwipeSpeedPxPerMs > 0 &&
    stats.avgSwipeSpeedPxPerMs > 0
  ) {
    const ratio = stats.avgSwipeSpeedPxPerMs / baseline.avgSwipeSpeedPxPerMs;
    if (ratio < 0.3 || ratio > 3.0) {
      flags.push({
        id: BEHAVIORS.SWIPE_SPEED_MISMATCH,
        label: 'Swipe speed mismatch',
        penalty: -10,
        detail: `Current ${stats.avgSwipeSpeedPxPerMs} vs baseline ${baseline.avgSwipeSpeedPxPerMs.toFixed(2)} px/ms`,
      });
    }
  }

  // 12. Zone distribution shift — dominant zone changed
  if (taps.length > 10) {
    const total = taps.length;
    for (const [zone, baselineRatio] of Object.entries(baseline.tapZoneDistribution)) {
      const currentCount = stats.zoneDistribution[zone] ?? 0;
      const currentRatio = currentCount / total;
      if (baselineRatio > 0.3 && currentRatio < baselineRatio * 0.3) {
        flags.push({
          id: BEHAVIORS.ZONE_DISTRIBUTION_SHIFT,
          label: 'Tap zone shift',
          penalty: -10,
          detail: `Zone "${zone}" dropped from ${Math.round(baselineRatio * 100)}% to ${Math.round(currentRatio * 100)}%`,
        });
        break;
      }
    }
  }

  // 13. Session length very different from baseline
  const currentDuration = stats.sessionDurationMs;
  if (currentDuration > 0 && baseline.avgSessionDurationMs > 0) {
    const ratio = currentDuration / baseline.avgSessionDurationMs;
    if (ratio < 0.15) {
      flags.push({
        id: BEHAVIORS.SESSION_LENGTH_MISMATCH,
        label: 'Unusually short session',
        penalty: -8,
        detail: `Session ${Math.round(currentDuration / 1000)}s vs avg ${Math.round(baseline.avgSessionDurationMs / 1000)}s`,
      });
    }
  }

  // 14. Interaction rate mismatch (taps per minute)
  const sessionMinutes = currentDuration / 60000;
  if (sessionMinutes > 0.5 && baseline.avgTapsPerSession > 0) {
    const baselineTapsPerMin =
      baseline.avgTapsPerSession / (baseline.avgSessionDurationMs / 60000);
    const currentTapsPerMin = taps.length / sessionMinutes;
    if (
      baselineTapsPerMin > 0 &&
      (currentTapsPerMin > baselineTapsPerMin * 3 ||
        currentTapsPerMin < baselineTapsPerMin * 0.2)
    ) {
      flags.push({
        id: BEHAVIORS.INTERACTION_RATE_MISMATCH,
        label: 'Interaction rate mismatch',
        penalty: -10,
        detail: `${Math.round(currentTapsPerMin)} taps/min vs baseline ${Math.round(baselineTapsPerMin)} taps/min`,
      });
    }
  }

  return flags;
}

/* ------------------------------------------------------------------ */
/*  Main trust calculation                                             */
/* ------------------------------------------------------------------ */

export function calculateTrust(
  session: BehaviorSession,
  baseline: BehaviorBaseline | null,
): TrustResult {
  const ruleFlags = analyzeRules(session);
  const baselineFlags = baseline ? analyzeAgainstBaseline(session, baseline) : [];
  const allFlags = [...ruleFlags, ...baselineFlags];

  // De-duplicate by behavior ID
  const seen = new Set<number>();
  const uniqueFlags = allFlags.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  // Calculate score
  let score = 100;
  for (const flag of uniqueFlags) {
    score += flag.penalty; // penalty is negative
  }

  // Weight: with baseline we are more confident in deviations
  if (baseline && baseline.sessionsUsed >= 5) {
    // boost baseline-detected penalties by 20% (more reliable)
    const baselinePenalty = baselineFlags.reduce((sum, f) => sum + f.penalty, 0);
    score += Math.round(baselinePenalty * 0.2);
  }

  score = Math.max(0, Math.min(100, score));

  const level = scoreToLevel(score);

  return {
    score,
    level,
    color: levelColor(level),
    flags: uniqueFlags,
    hasBaseline: baseline !== null,
    sessionDurationMs: session.endTime
      ? session.durationMs
      : Date.now() - session.startTime,
  };
}
