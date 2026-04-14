/**
 * Behavioral Interaction Tracker
 * Adapted from PhishSafe SDK (BBA banking project) for personal safety.
 *
 * Captures tap events, swipe patterns, screen durations, and device posture
 * to build a behavioral baseline. Anomalies may indicate the phone was taken,
 * someone else is using it, or the user is under duress.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type TapEvent = {
  timestamp: number;
  x: number;
  y: number;
  zone: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  durationMs: number;
};

export type SwipeEvent = {
  timestamp: number;
  direction: 'up' | 'down' | 'left' | 'right';
  distancePx: number;
  speedPxPerMs: number;
  durationMs: number;
};

export type ScreenVisit = {
  screen: string;
  enterTime: number;
  exitTime: number | null;
  durationMs: number;
};

export type BehaviorSession = {
  id: string;
  startTime: number;
  endTime: number | null;
  durationMs: number;
  tapEvents: TapEvent[];
  swipeEvents: SwipeEvent[];
  screenVisits: ScreenVisit[];
  screenDurations: Record<string, number>;
};

export type BehaviorBaseline = {
  sessionsUsed: number;
  avgTapDurationMs: number;
  avgSwipeSpeedPxPerMs: number;
  avgSessionDurationMs: number;
  avgTapsPerSession: number;
  avgSwipesPerSession: number;
  tapZoneDistribution: Record<string, number>;
  topScreens: string[];
  lastUpdated: number;
};

/* ------------------------------------------------------------------ */
/*  Storage keys                                                       */
/* ------------------------------------------------------------------ */

const KEYS = {
  activeSession: '@hearme/behavior_session_v1',
  sessionHistory: '@hearme/behavior_history_v1',
  baseline: '@hearme/behavior_baseline_v1',
} as const;

const MAX_HISTORY = 20;
const MAX_TAP_EVENTS_PER_SESSION = 500;
const MAX_SWIPE_EVENTS_PER_SESSION = 200;

/* ------------------------------------------------------------------ */
/*  Zone detection                                                     */
/* ------------------------------------------------------------------ */

export function detectTapZone(
  x: number,
  y: number,
  screenWidth: number,
  screenHeight: number,
): TapEvent['zone'] {
  const midX = screenWidth / 2;
  const midY = screenHeight / 2;
  const isLeft = x < midX;
  const isTop = y < midY;

  // center zone: 30% of screen around the middle
  const centerMarginX = screenWidth * 0.15;
  const centerMarginY = screenHeight * 0.15;
  if (
    x > midX - centerMarginX &&
    x < midX + centerMarginX &&
    y > midY - centerMarginY &&
    y < midY + centerMarginY
  ) {
    return 'center';
  }

  if (isTop && isLeft) return 'top-left';
  if (isTop && !isLeft) return 'top-right';
  if (!isTop && isLeft) return 'bottom-left';
  return 'bottom-right';
}

/* ------------------------------------------------------------------ */
/*  Session management                                                 */
/* ------------------------------------------------------------------ */

export function createSession(): BehaviorSession {
  return {
    id: `bsess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    startTime: Date.now(),
    endTime: null,
    durationMs: 0,
    tapEvents: [],
    swipeEvents: [],
    screenVisits: [],
    screenDurations: {},
  };
}

export function addTapEvent(session: BehaviorSession, tap: TapEvent): BehaviorSession {
  if (session.tapEvents.length >= MAX_TAP_EVENTS_PER_SESSION) return session;
  return { ...session, tapEvents: [...session.tapEvents, tap] };
}

export function addSwipeEvent(session: BehaviorSession, swipe: SwipeEvent): BehaviorSession {
  if (session.swipeEvents.length >= MAX_SWIPE_EVENTS_PER_SESSION) return session;
  return { ...session, swipeEvents: [...session.swipeEvents, swipe] };
}

export function logScreenEnter(session: BehaviorSession, screen: string): BehaviorSession {
  // close previous screen visit if open
  const visits = session.screenVisits.map((v) => {
    if (v.exitTime === null) {
      const duration = Date.now() - v.enterTime;
      return { ...v, exitTime: Date.now(), durationMs: duration };
    }
    return v;
  });

  visits.push({ screen, enterTime: Date.now(), exitTime: null, durationMs: 0 });

  return { ...session, screenVisits: visits };
}

export function logScreenExit(session: BehaviorSession, screen: string): BehaviorSession {
  const durations = { ...session.screenDurations };
  const visits = session.screenVisits.map((v) => {
    if (v.screen === screen && v.exitTime === null) {
      const duration = Date.now() - v.enterTime;
      durations[screen] = (durations[screen] ?? 0) + duration;
      return { ...v, exitTime: Date.now(), durationMs: duration };
    }
    return v;
  });
  return { ...session, screenVisits: visits, screenDurations: durations };
}

export function endSession(session: BehaviorSession): BehaviorSession {
  const now = Date.now();
  // close any open screen visits
  const visits = session.screenVisits.map((v) => {
    if (v.exitTime === null) {
      return { ...v, exitTime: now, durationMs: now - v.enterTime };
    }
    return v;
  });

  return {
    ...session,
    endTime: now,
    durationMs: now - session.startTime,
    screenVisits: visits,
  };
}

/* ------------------------------------------------------------------ */
/*  Persistence                                                        */
/* ------------------------------------------------------------------ */

export async function saveActiveSession(session: BehaviorSession): Promise<void> {
  await AsyncStorage.setItem(KEYS.activeSession, JSON.stringify(session));
}

export async function getActiveSession(): Promise<BehaviorSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.activeSession);
    return raw ? (JSON.parse(raw) as BehaviorSession) : null;
  } catch {
    return null;
  }
}

export async function clearActiveSession(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.activeSession);
}

export async function saveSessionToHistory(session: BehaviorSession): Promise<void> {
  const history = await loadSessionHistory();
  // store trimmed sessions (drop raw events to save space, keep stats)
  const trimmed: BehaviorSession = {
    ...session,
    tapEvents: [], // drop raw events from history
    swipeEvents: [],
  };
  const updated = [trimmed, ...history].slice(0, MAX_HISTORY);
  await AsyncStorage.setItem(KEYS.sessionHistory, JSON.stringify(updated));
}

export async function loadSessionHistory(): Promise<BehaviorSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.sessionHistory);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Baseline                                                           */
/* ------------------------------------------------------------------ */

export async function loadBaseline(): Promise<BehaviorBaseline | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.baseline);
    return raw ? (JSON.parse(raw) as BehaviorBaseline) : null;
  } catch {
    return null;
  }
}

export async function saveBaseline(baseline: BehaviorBaseline): Promise<void> {
  await AsyncStorage.setItem(KEYS.baseline, JSON.stringify(baseline));
}

export function buildBaseline(sessions: BehaviorSession[]): BehaviorBaseline | null {
  if (sessions.length < 3) return null; // need at least 3 sessions

  const totalSessions = sessions.length;

  // aggregate stats from screen visits (raw events are trimmed in history)
  let totalTaps = 0;
  let totalSwipes = 0;
  let totalSessionDuration = 0;
  const zoneCount: Record<string, number> = {};
  const screenCount: Record<string, number> = {};

  // for tap/swipe averages we use screen visit counts as proxy
  for (const s of sessions) {
    totalTaps += s.tapEvents.length;
    totalSwipes += s.swipeEvents.length;
    totalSessionDuration += s.durationMs;

    for (const tap of s.tapEvents) {
      zoneCount[tap.zone] = (zoneCount[tap.zone] ?? 0) + 1;
    }

    for (const visit of s.screenVisits) {
      screenCount[visit.screen] = (screenCount[visit.screen] ?? 0) + 1;
    }
  }

  // normalize zone distribution
  const totalZoneTaps = Object.values(zoneCount).reduce((a, b) => a + b, 0) || 1;
  const zoneDist: Record<string, number> = {};
  for (const [zone, count] of Object.entries(zoneCount)) {
    zoneDist[zone] = count / totalZoneTaps;
  }

  const topScreens = Object.entries(screenCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([screen]) => screen);

  // compute tap duration averages from current session data if available
  const allTapDurations = sessions.flatMap((s) => s.tapEvents.map((t) => t.durationMs));
  const allSwipeSpeeds = sessions.flatMap((s) => s.swipeEvents.map((sw) => sw.speedPxPerMs));

  const avgTapDuration =
    allTapDurations.length > 0
      ? allTapDurations.reduce((a, b) => a + b, 0) / allTapDurations.length
      : 150;

  const avgSwipeSpeed =
    allSwipeSpeeds.length > 0
      ? allSwipeSpeeds.reduce((a, b) => a + b, 0) / allSwipeSpeeds.length
      : 0.5;

  return {
    sessionsUsed: totalSessions,
    avgTapDurationMs: avgTapDuration,
    avgSwipeSpeedPxPerMs: avgSwipeSpeed,
    avgSessionDurationMs: totalSessionDuration / totalSessions,
    avgTapsPerSession: totalTaps / totalSessions,
    avgSwipesPerSession: totalSwipes / totalSessions,
    tapZoneDistribution: zoneDist,
    topScreens,
    lastUpdated: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/*  Session statistics (for current session analysis)                  */
/* ------------------------------------------------------------------ */

export function getSessionStats(session: BehaviorSession) {
  const taps = session.tapEvents;
  const swipes = session.swipeEvents;

  const avgTapDuration =
    taps.length > 0
      ? taps.reduce((sum, t) => sum + t.durationMs, 0) / taps.length
      : 0;

  const avgSwipeSpeed =
    swipes.length > 0
      ? swipes.reduce((sum, s) => sum + s.speedPxPerMs, 0) / swipes.length
      : 0;

  const zoneCount: Record<string, number> = {};
  for (const t of taps) {
    zoneCount[t.zone] = (zoneCount[t.zone] ?? 0) + 1;
  }

  const uniqueScreens = new Set(session.screenVisits.map((v) => v.screen)).size;

  return {
    totalTaps: taps.length,
    totalSwipes: swipes.length,
    avgTapDurationMs: Math.round(avgTapDuration),
    avgSwipeSpeedPxPerMs: Math.round(avgSwipeSpeed * 100) / 100,
    zoneDistribution: zoneCount,
    uniqueScreensVisited: uniqueScreens,
    sessionDurationMs: session.endTime
      ? session.durationMs
      : Date.now() - session.startTime,
  };
}
