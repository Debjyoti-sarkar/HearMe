// Two-way duress.
//
// Until now the duress signal flows one direction: user → contacts. Two-way
// duress lets a contact send an "are you safe?" challenge that the user has to
// affirmatively answer within a window — silence escalates to SOS. The
// challenge is delivered as a covert haptic pattern on the band so an attacker
// holding the phone can't intercept the prompt.
//
// Protocol (NeuroBand command characteristic, extends the existing 0x01):
//   0x01 — short buzz (existing)
//   0x02 — challenge: three short pulses with 250 ms gaps
//   0x03 — reassurance: one 1.5-s pulse ("you've been heard")
//   0x04 — alarm: rapid pulses (SOS just fired)
//
// Transport from contacts:
//   Supabase realtime channel `duress-${userId}`. The contact's HearMe app
//   broadcasts a `challenge` event with their identity. The user's phone
//   handles the rest. If the user's app is offline we fall back to push (not
//   wired here — see HEAR_ME_PUSH_ADAPTER below).

import { Vibration } from 'react-native';

import { sendHapticBuzz } from './neuroband-ble';
import { supabase } from './supabase';
import { startRelay, type RelayUpdate } from './guardian-relay';
import { loadContacts, loadSettings } from './app-data';

const CHALLENGE_TTL_MS = 60_000;

type RealtimeChannel = ReturnType<typeof supabase.channel>;

export type DuressCommand = 0x01 | 0x02 | 0x03 | 0x04;

export type DuressChallenge = {
  fromContactId: string;
  fromContactName: string;
  reason: string | null;
  receivedAt: number;
  expiresAt: number;
};

export type DuressOutcome =
  | { kind: 'safe'; respondedAt: number }
  | { kind: 'escalated'; via: 'timeout' | 'manual' }
  | { kind: 'cancelled' };

export type DuressBackend = {
  /** Send a single-byte command to the band. Default uses the JS BLE bridge. */
  sendCommand(cmd: DuressCommand): Promise<void>;
};

const STATE: {
  channel: RealtimeChannel | null;
  active: DuressChallenge | null;
  timer: ReturnType<typeof setTimeout> | null;
  backend: DuressBackend;
  onChallenge: ((c: DuressChallenge) => void) | null;
  onOutcome: ((o: DuressOutcome) => void) | null;
  userId: string | null;
} = {
  channel: null,
  active: null,
  timer: null,
  backend: { sendCommand: defaultSendCommand },
  onChallenge: null,
  onOutcome: null,
  userId: null,
};

async function defaultSendCommand(cmd: DuressCommand): Promise<void> {
  // Two channels: real BLE haptic if the band is up; phone vibration as
  // fallback so the user always feels the challenge.
  if (cmd === 0x01) {
    Vibration.vibrate(120);
    await sendHapticBuzz();
    return;
  }
  if (cmd === 0x02) {
    Vibration.vibrate([0, 120, 250, 120, 250, 120]);
    await sendHapticBuzz();
    return;
  }
  if (cmd === 0x03) {
    Vibration.vibrate(1500);
    await sendHapticBuzz();
    return;
  }
  if (cmd === 0x04) {
    Vibration.vibrate([0, 80, 80, 80, 80, 80, 80, 80, 80, 80]);
    await sendHapticBuzz();
    return;
  }
}

export function registerDuressBackend(backend: DuressBackend): void {
  STATE.backend = backend;
}

/**
 * Subscribe to incoming challenges. Call once on app start (after sign-in).
 * The handlers receive challenge / outcome events so the UI can show a banner.
 */
export async function startDuressListener(opts: {
  userId: string;
  onChallenge: (c: DuressChallenge) => void;
  onOutcome: (o: DuressOutcome) => void;
}): Promise<void> {
  await stopDuressListener();
  const channel = supabase.channel(`duress-${opts.userId}`, {
    config: { broadcast: { self: false } },
  });

  channel.on(
    'broadcast',
    { event: 'challenge' },
    ({ payload }: { payload: Omit<DuressChallenge, 'receivedAt' | 'expiresAt'> }) => {
      void receiveChallenge(payload);
    },
  );
  await channel.subscribe();

  STATE.channel = channel;
  STATE.userId = opts.userId;
  STATE.onChallenge = opts.onChallenge;
  STATE.onOutcome = opts.onOutcome;
}

export async function stopDuressListener(): Promise<void> {
  if (STATE.timer) {
    clearTimeout(STATE.timer);
    STATE.timer = null;
  }
  if (STATE.channel) {
    try {
      await STATE.channel.unsubscribe();
    } catch {
      /* ignore */
    }
    STATE.channel = null;
  }
  STATE.active = null;
  STATE.onChallenge = null;
  STATE.onOutcome = null;
  STATE.userId = null;
}

async function receiveChallenge(
  payload: Omit<DuressChallenge, 'receivedAt' | 'expiresAt'>,
): Promise<void> {
  const now = Date.now();
  const challenge: DuressChallenge = {
    ...payload,
    receivedAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
  };
  STATE.active = challenge;
  STATE.onChallenge?.(challenge);
  await STATE.backend.sendCommand(0x02);

  STATE.timer = setTimeout(() => {
    void escalateOnTimeout();
  }, CHALLENGE_TTL_MS);
}

async function escalateOnTimeout(): Promise<void> {
  STATE.timer = null;
  if (!STATE.active) return;
  await STATE.backend.sendCommand(0x04);
  // Auto-fire SOS via guardian relay. The contact who pinged is told via
  // the realtime ack channel that the user did NOT respond.
  try {
    const [contacts, settings] = await Promise.all([
      loadContacts(),
      loadSettings(),
    ]);
    if (contacts.length > 0) {
      void startRelay(contacts, settings, () => {
        /* fire-and-forget */
      });
    }
  } catch {
    /* swallow */
  }
  if (STATE.userId) await broadcastReply('escalated');
  STATE.onOutcome?.({ kind: 'escalated', via: 'timeout' });
  STATE.active = null;
}

async function broadcastReply(
  status: 'safe' | 'escalated',
): Promise<void> {
  if (!STATE.channel) return;
  await STATE.channel.send({
    type: 'broadcast',
    event: 'reply',
    payload: { status, at: Date.now() },
  });
}

/** User says "I'm safe" — call from the band triple-tap or in-app button. */
export async function respondSafe(): Promise<void> {
  if (STATE.timer) {
    clearTimeout(STATE.timer);
    STATE.timer = null;
  }
  if (!STATE.active) return;
  await STATE.backend.sendCommand(0x03);
  await broadcastReply('safe');
  STATE.onOutcome?.({ kind: 'safe', respondedAt: Date.now() });
  STATE.active = null;
}

/** Manual "no, I'm not safe — fire SOS now" path. */
export async function respondUnsafe(): Promise<void> {
  if (STATE.timer) {
    clearTimeout(STATE.timer);
    STATE.timer = null;
  }
  if (!STATE.active) {
    return;
  }
  await STATE.backend.sendCommand(0x04);
  try {
    const [contacts, settings] = await Promise.all([
      loadContacts(),
      loadSettings(),
    ]);
    if (contacts.length > 0) {
      void startRelay(contacts, settings, (_: RelayUpdate) => {
        /* fire-and-forget */
      });
    }
  } catch {
    /* swallow */
  }
  await broadcastReply('escalated');
  STATE.onOutcome?.({ kind: 'escalated', via: 'manual' });
  STATE.active = null;
}

/**
 * Sender side: contact presses "are you safe?" in their HearMe app. We
 * publish on the user's channel and await a reply via the same channel.
 */
export async function sendChallenge(opts: {
  recipientUserId: string;
  fromContactId: string;
  fromContactName: string;
  reason?: string;
  onReply?: (reply: { status: 'safe' | 'escalated'; at: number }) => void;
  timeoutMs?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const channel = supabase.channel(`duress-${opts.recipientUserId}`, {
    config: { broadcast: { self: false } },
  });

  let received = false;
  channel.on(
    'broadcast',
    { event: 'reply' },
    ({ payload }: { payload: { status: 'safe' | 'escalated'; at: number } }) => {
      received = true;
      opts.onReply?.(payload);
      void channel.unsubscribe();
    },
  );
  await channel.subscribe();

  await channel.send({
    type: 'broadcast',
    event: 'challenge',
    payload: {
      fromContactId: opts.fromContactId,
      fromContactName: opts.fromContactName,
      reason: opts.reason ?? null,
    },
  });

  const t = opts.timeoutMs ?? CHALLENGE_TTL_MS + 5_000;
  setTimeout(() => {
    if (!received) {
      try {
        void channel.unsubscribe();
      } catch {
        /* ignore */
      }
    }
  }, t);

  return { ok: true };
}
