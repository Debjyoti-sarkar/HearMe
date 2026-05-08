// Cycle-aware sensitivity.
//
// The user's resting HR rises ~2–5 bpm and resting HRV drops ~10–15% during
// the luteal phase of the menstrual cycle. With our existing fixed delta-HR
// fusion threshold, this physiology shifts a few users into chronic
// false-positive territory for ~10 days each month. Cycle-aware sensitivity
// solves that by widening the HR-fire threshold during the luteal phase and
// tightening it during the follicular phase (when HRV is highest).
//
// Two data sources are wired:
//   1. **Manual log** (default, no permissions): the user marks the first
//      day of their period in-app; we estimate the current phase from a
//      28-day average cycle (configurable). Privacy-preserving — never
//      leaves the device.
//   2. **Health adapter** (HealthKit / Health Connect): a registered native
//      module reads the latest cycle start dates if the user has opted in.
//      Same interface; the manual log is the fallback if the adapter
//      returns no data.
//
// Output: a `CycleAdjustment` you pass to fusion (or to threat-classifier)
// so thresholds shift in the right direction for the user's current phase.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEY = '@hearme/cycle_log_v1';

export type CyclePhase = 'menses' | 'follicular' | 'ovulatory' | 'luteal' | 'unknown';

export type CycleEntry = { startedOn: string /* YYYY-MM-DD */; lengthDays?: number };

export type CycleLog = {
  /** Most recent first. */
  entries: CycleEntry[];
  /** User-set cycle length in days (default 28). Used when only one entry exists. */
  averageCycleDays: number;
  /** True if the user explicitly opted into adapting sensitivity. */
  consent: boolean;
};

export type CycleAdjustment = {
  phase: CyclePhase;
  /** Offset added to the HR-fire threshold (bpm). Positive = wider band, fewer
   *  false positives; negative = tighter band, more sensitive. */
  hrThresholdOffsetBpm: number;
  /** Multiplier on the HRV baseline rather than the threshold — used by
   *  `lib/hrv-baseline.ts` so stress z-scores stay sensible. */
  hrvBaselineMultiplier: number;
  reason: string;
};

export type CycleHealthAdapter = {
  name: string;
  /** Return cycle entries newest-first if available; null if not. */
  fetchRecentEntries(): Promise<CycleEntry[] | null>;
};

let healthAdapter: CycleHealthAdapter | null = null;

export function registerCycleHealthAdapter(a: CycleHealthAdapter): void {
  healthAdapter = a;
}

export async function loadCycleLog(): Promise<CycleLog> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as CycleLog;
  } catch {
    /* fall through */
  }
  return { entries: [], averageCycleDays: 28, consent: false };
}

export async function saveCycleLog(log: CycleLog): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(log));
}

export async function logPeriodStart(date: Date): Promise<void> {
  const log = await loadCycleLog();
  const startedOn = date.toISOString().slice(0, 10);
  if (log.entries[0]?.startedOn === startedOn) return;
  log.entries = [{ startedOn }, ...log.entries].slice(0, 12);
  // Recompute average cycle length if we have ≥ 2 entries.
  if (log.entries.length >= 2) {
    const diffs: number[] = [];
    for (let i = 0; i < log.entries.length - 1; i += 1) {
      const a = new Date(log.entries[i].startedOn).getTime();
      const b = new Date(log.entries[i + 1].startedOn).getTime();
      const days = Math.abs(a - b) / (24 * 3600 * 1000);
      if (days > 18 && days < 45) diffs.push(days);
    }
    if (diffs.length > 0) {
      log.averageCycleDays = Math.round(
        diffs.reduce((s, v) => s + v, 0) / diffs.length,
      );
    }
  }
  await saveCycleLog(log);
}

export async function setCycleConsent(consent: boolean): Promise<void> {
  const log = await loadCycleLog();
  log.consent = consent;
  await saveCycleLog(log);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

export function phaseFromDay(dayInCycle: number, cycleLen: number): CyclePhase {
  if (dayInCycle < 0 || dayInCycle >= cycleLen) return 'unknown';
  if (dayInCycle < 5) return 'menses';
  if (dayInCycle < cycleLen / 2 - 3) return 'follicular';
  if (dayInCycle < cycleLen / 2 + 3) return 'ovulatory';
  return 'luteal';
}

export async function currentPhase(now: Date = new Date()): Promise<{
  phase: CyclePhase;
  dayInCycle: number;
  cycleLen: number;
}> {
  const log = await loadCycleLog();
  if (!log.consent) return { phase: 'unknown', dayInCycle: -1, cycleLen: log.averageCycleDays };

  // Prefer the health adapter if available and returns something.
  let entries = log.entries;
  if (healthAdapter) {
    try {
      const fromHealth = await healthAdapter.fetchRecentEntries();
      if (fromHealth && fromHealth.length > 0) entries = fromHealth;
    } catch {
      /* fall back to manual */
    }
  }

  if (entries.length === 0) {
    return { phase: 'unknown', dayInCycle: -1, cycleLen: log.averageCycleDays };
  }
  const lastStart = new Date(entries[0].startedOn);
  const dayInCycle = daysBetween(lastStart, now);
  const cycleLen = log.averageCycleDays;
  if (dayInCycle < 0 || dayInCycle > cycleLen + 7) {
    // Too far from last log to be confident.
    return { phase: 'unknown', dayInCycle, cycleLen };
  }
  return { phase: phaseFromDay(dayInCycle, cycleLen), dayInCycle, cycleLen };
}

export async function adjustment(): Promise<CycleAdjustment> {
  const { phase } = await currentPhase();
  switch (phase) {
    case 'menses':
      return {
        phase,
        hrThresholdOffsetBpm: +3,
        hrvBaselineMultiplier: 0.95,
        reason: 'menses — slight widening; HR can be ~3 bpm higher',
      };
    case 'follicular':
      return {
        phase,
        hrThresholdOffsetBpm: 0,
        hrvBaselineMultiplier: 1,
        reason: 'follicular — neutral',
      };
    case 'ovulatory':
      return {
        phase,
        hrThresholdOffsetBpm: -1,
        hrvBaselineMultiplier: 1.02,
        reason: 'ovulatory — HRV peaks, slightly tighter HR band',
      };
    case 'luteal':
      return {
        phase,
        hrThresholdOffsetBpm: +5,
        hrvBaselineMultiplier: 0.85,
        reason: 'luteal — resting HR up ~5 bpm, HRV down ~15%',
      };
    case 'unknown':
    default:
      return {
        phase: 'unknown',
        hrThresholdOffsetBpm: 0,
        hrvBaselineMultiplier: 1,
        reason: 'unknown phase — no adjustment',
      };
  }
}
