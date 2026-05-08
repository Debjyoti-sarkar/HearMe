// Dead-man's switch for evidence upload.
//
// Threat model: the user fires SOS, we capture audio/photos/location, and
// then *the phone goes offline mid-incident* — battery, RF jamming, the
// attacker yanks the phone, signal loss in a basement. Without this, the
// evidence sits on the device until the next time the app opens with
// connectivity, which may be never.
//
// What this module does:
//   1. Persistent retry queue keyed on session id.
//   2. Periodic ticks that retry sync whenever the network looks reachable.
//   3. Pluggable "relay backend" — if the primary upload fails, we offer the
//      session to nearby-device relays (other paired HearMe phones over BLE,
//      or the NeuroBand acting as a forward node). Default backend: no-op.
//   4. Last-resort SMS notice — "evidence pending, please come help" — to
//      trusted contacts so they know to recover the device even if upload
//      never succeeds.

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadEvidenceSessions,
  saveEvidenceSession,
  type EvidenceSession,
} from './evidence-locker';
import { syncSessionAsync } from './evidence-cloud';
import { sendSosSms } from './emergency-sms';
import { loadContacts, loadSettings } from './app-data';

const QUEUE_KEY = '@hearme/deadman_queue_v1';
const REACHABILITY_PROBE = 'https://www.cloudflare.com/cdn-cgi/trace';

export type DeadmanQueueEntry = {
  sessionId: string;
  enqueuedAt: string;
  attempts: number;
  lastError: string | null;
  /** Set when the SMS "evidence pending" notice has been sent. */
  contactsNotifiedAt: string | null;
};

export type RelayBackend = {
  name: string;
  /** Try to forward an evidence session to a peer that has connectivity. */
  relay(session: EvidenceSession): Promise<{ ok: boolean; reason?: string }>;
};

const STATE: {
  relays: RelayBackend[];
  ticker: ReturnType<typeof setInterval> | null;
} = {
  relays: [],
  ticker: null,
};

export function registerRelayBackend(backend: RelayBackend): void {
  STATE.relays.push(backend);
}

export async function enqueue(sessionId: string): Promise<void> {
  const queue = await loadQueue();
  if (queue.some((e) => e.sessionId === sessionId)) return;
  queue.push({
    sessionId,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    contactsNotifiedAt: null,
  });
  await saveQueue(queue);
}

export async function loadQueue(): Promise<DeadmanQueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as DeadmanQueueEntry[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: DeadmanQueueEntry[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function isReachable(): Promise<boolean> {
  try {
    const ctrl =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 2500) : null;
    const resp = await fetch(REACHABILITY_PROBE, {
      method: 'GET',
      signal: ctrl?.signal,
    });
    if (t) clearTimeout(t);
    return resp.ok;
  } catch {
    return false;
  }
}

async function findSession(id: string): Promise<EvidenceSession | null> {
  const all = await loadEvidenceSessions();
  return all.find((s) => s.id === id) ?? null;
}

async function notifyContactsOfPending(entry: DeadmanQueueEntry): Promise<void> {
  if (entry.contactsNotifiedAt) return;
  try {
    const [contacts, settings] = await Promise.all([
      loadContacts(),
      loadSettings(),
    ]);
    if (contacts.length === 0) return;
    await sendSosSms(contacts, settings);
    entry.contactsNotifiedAt = new Date().toISOString();
  } catch {
    /* best effort */
  }
}

const NOTIFY_AFTER_ATTEMPTS = 3;

/**
 * Pick up any completed-but-not-synced sessions and add them to the retry
 * queue. Lets the dead-man recover sessions that failed syncing while the
 * reconciler wasn't running.
 */
async function scanAndEnqueueFailed(): Promise<void> {
  const all = await loadEvidenceSessions();
  for (const s of all) {
    if (s.status === 'collecting') continue;
    if (s.syncStatus === 'synced') continue;
    await enqueue(s.id);
  }
}

/**
 * Run one tick of the dead-man's-switch reconciler. Public so the app can
 * trigger on resume in addition to the timer.
 */
export async function tick(): Promise<{ processed: number; succeeded: number }> {
  await scanAndEnqueueFailed();
  const queue = await loadQueue();
  if (queue.length === 0) return { processed: 0, succeeded: 0 };

  const reachable = await isReachable();
  let succeeded = 0;
  const remaining: DeadmanQueueEntry[] = [];

  for (const entry of queue) {
    const session = await findSession(entry.sessionId);
    if (!session) continue; // session deleted locally; drop

    let ok = false;
    let reason: string | null = null;

    if (reachable) {
      const r = await syncSessionAsync(session);
      ok = r.ok;
      if (!r.ok) reason = r.reason;
    }

    if (!ok) {
      for (const relay of STATE.relays) {
        try {
          const r = await relay.relay(session);
          if (r.ok) {
            ok = true;
            break;
          }
          reason = r.reason ?? `${relay.name}: relay failed`;
        } catch (e) {
          reason = `${relay.name}: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }

    if (ok) {
      succeeded += 1;
      // Drop from queue.
      continue;
    }

    entry.attempts += 1;
    entry.lastError = reason;
    if (entry.attempts >= NOTIFY_AFTER_ATTEMPTS) {
      await notifyContactsOfPending(entry);
    }
    remaining.push(entry);
  }

  await saveQueue(remaining);
  return { processed: queue.length, succeeded };
}

/**
 * Start a periodic reconciler. Safe to call multiple times — second call is
 * a no-op. Stop with {@link stopDeadmanReconciler}.
 */
export function startDeadmanReconciler(intervalMs: number = 60_000): void {
  if (STATE.ticker) return;
  STATE.ticker = setInterval(() => {
    void tick().catch(() => {
      /* swallow */
    });
  }, intervalMs);
}

export function stopDeadmanReconciler(): void {
  if (STATE.ticker) {
    clearInterval(STATE.ticker);
    STATE.ticker = null;
  }
}

export async function pendingCount(): Promise<number> {
  return (await loadQueue()).length;
}

/**
 * Mark a session as needing re-upload and persist any local state changes
 * (e.g. retag with 'deadman' tag). Used by the sync flow when an upload
 * fails so the reconciler picks it up next tick.
 */
export async function markFailedForRetry(
  session: EvidenceSession,
  reason: string,
): Promise<void> {
  await enqueue(session.id);
  const updated: EvidenceSession = {
    ...session,
    syncStatus: 'failed',
    syncError: reason,
  };
  await saveEvidenceSession(updated);
}
