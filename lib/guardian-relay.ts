// Guardian-relay escalation.
//
// The default sendSosSms() blasts every contact at once. That's the right
// default for "every second matters". But for a 10-minute walk home, blasting
// is overkill — and if the primary contact never sees it, the user has no
// idea their request just sat unread.
//
// Guardian-relay layers a *staggered, ack-aware* policy on top:
//
//   step 1: tier 1 (primary)   — send immediately
//   step 2: wait T1 seconds
//   step 3: if no ack, send tier 2
//   step 4: wait T2 seconds
//   step 5: if still no ack, send tier 3 — and the registered emergency
//           number (e.g. 112) gets dialed automatically
//
// "Ack" is collected over a Supabase Realtime channel — when a contact taps a
// link in the SMS that opens HearMe / a web receiver, the receiver broadcasts
// `relay-ack` on a per-alert channel. The sending phone subscribes and stops
// the cascade as soon as anyone acks.
//
// Without realtime acks (offline, contact has no app), the cascade still
// progresses on the timer — the user gets fan-out, just without the
// "stopped because Mum picked up" affordance.

import * as SMS from 'expo-sms';
import { Linking, Platform } from 'react-native';

import { supabase } from './supabase';
import { dialEmergency, getLocationText } from './emergency-sms';
import type { EmergencyContact, HearMeSettings } from './types';

const DEFAULT_TIER_DELAYS_MS = [0, 30_000, 60_000];
const ACK_CHANNEL_PREFIX = 'relay-ack-';

type RealtimeChannel = ReturnType<typeof supabase.channel>;

export type RelayAck = {
  contactId: string;
  contactName: string;
  ackedAt: number;
  message: string | null;
};

export type RelayUpdate =
  | { kind: 'sent'; tier: number; contact: EmergencyContact }
  | { kind: 'ack'; ack: RelayAck }
  | { kind: 'completed'; reason: 'acked' | 'exhausted' | 'cancelled' }
  | { kind: 'error'; tier: number; reason: string };

export type RelayHandle = {
  alertId: string;
  cancel: () => void;
};

function tieredContacts(contacts: EmergencyContact[]): EmergencyContact[][] {
  const buckets = new Map<number, EmergencyContact[]>();
  for (const c of contacts) {
    const p = c.priority ?? 1;
    if (!buckets.has(p)) buckets.set(p, []);
    buckets.get(p)!.push(c);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, list]) => list);
}

async function buildBody(alertId: string, tier: number): Promise<string> {
  const loc = await getLocationText();
  // Receiver URL carries alertId; tap → opens HearMe deep-link or a web page
  // that posts an ack on the realtime channel.
  const url = `https://hearme.app/r/${alertId}`;
  return `EMERGENCY (HearMe — tier ${tier}): I need help.
${loc}
If you got this, tap: ${url}
Or call me back as soon as possible.
— HearMe`;
}

async function sendSmsToContact(
  contact: EmergencyContact,
  body: string,
): Promise<{ ok: boolean; reason?: string }> {
  const phone = contact.phone.replace(/\D/g, '');
  if (phone.length < 8) return { ok: false, reason: 'invalid number' };

  if (Platform.OS === 'android') {
    try {
      const uri = `sms:${phone}?body=${encodeURIComponent(body)}`;
      await Linking.openURL(uri);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  }
  // iOS — use the SMS composer (no silent SMS allowed by Apple).
  try {
    const available = await SMS.isAvailableAsync();
    if (!available) return { ok: false, reason: 'sms unavailable' };
    const { result } = await SMS.sendSMSAsync([phone], body);
    if (result === 'sent' || result === 'cancelled') return { ok: true };
    return { ok: false, reason: result };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

/**
 * Start a guardian-relay cascade. Returns a handle the UI uses to cancel.
 * The onUpdate callback receives sent/ack/completed events as the cascade
 * progresses.
 */
export async function startRelay(
  contacts: EmergencyContact[],
  settings: HearMeSettings,
  onUpdate: (u: RelayUpdate) => void,
  options?: { tierDelaysMs?: number[]; alertId?: string },
): Promise<RelayHandle> {
  const alertId =
    options?.alertId ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const delays = options?.tierDelaysMs ?? DEFAULT_TIER_DELAYS_MS;
  const tiers = tieredContacts(contacts);

  let cancelled = false;
  let acked = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let channel: RealtimeChannel | null = null;

  const cleanup = async (reason: 'acked' | 'exhausted' | 'cancelled') => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (channel) {
      try {
        await channel.unsubscribe();
      } catch {
        /* ignore */
      }
      channel = null;
    }
    onUpdate({ kind: 'completed', reason });
  };

  // Subscribe to the per-alert ack channel so any in-app receiver can stop
  // the cascade.
  channel = supabase.channel(`${ACK_CHANNEL_PREFIX}${alertId}`, {
    config: { broadcast: { self: false } },
  });
  channel.on(
    'broadcast',
    { event: 'ack' },
    ({ payload }: { payload: RelayAck }) => {
      if (acked || cancelled) return;
      acked = true;
      onUpdate({ kind: 'ack', ack: payload });
      void cleanup('acked');
    },
  );
  await channel.subscribe();

  const runTier = async (idx: number) => {
    if (cancelled || acked) return;
    if (idx >= tiers.length) {
      // Exhausted — last resort dial the configured emergency number.
      try {
        if (settings.emergencyNumber) {
          await dialEmergency(settings.emergencyNumber);
        }
      } catch {
        /* ignore */
      }
      await cleanup('exhausted');
      return;
    }
    const body = await buildBody(alertId, idx + 1);
    for (const contact of tiers[idx]) {
      const r = await sendSmsToContact(contact, body);
      if (r.ok) {
        onUpdate({ kind: 'sent', tier: idx + 1, contact });
      } else {
        onUpdate({
          kind: 'error',
          tier: idx + 1,
          reason: `${contact.name}: ${r.reason ?? 'unknown'}`,
        });
      }
    }
    const delay = delays[idx + 1] ?? delays[delays.length - 1];
    timer = setTimeout(() => {
      void runTier(idx + 1);
    }, delay);
  };

  // Kick off tier 0.
  void runTier(0);

  return {
    alertId,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      void cleanup('cancelled');
    },
  };
}

/**
 * Receiver-side helper: a contact's HearMe app calls this when they tap the
 * link in the SMS to confirm they've seen the alert.
 */
export async function ackRelay(
  alertId: string,
  contact: { id: string; name: string },
  message?: string,
): Promise<boolean> {
  try {
    const channel = supabase.channel(`${ACK_CHANNEL_PREFIX}${alertId}`, {
      config: { broadcast: { self: false } },
    });
    await channel.subscribe();
    const ack: RelayAck = {
      contactId: contact.id,
      contactName: contact.name,
      ackedAt: Date.now(),
      message: message ?? null,
    };
    await channel.send({
      type: 'broadcast',
      event: 'ack',
      payload: ack,
    });
    await channel.unsubscribe();
    return true;
  } catch {
    return false;
  }
}
