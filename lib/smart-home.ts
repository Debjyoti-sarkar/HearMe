// Smart-home siren — outboard alert relays.
//
// When SOS fires *at home*, the loudest things in the room aren't the user's
// phone — they're the smart speakers and lights. This module fans out a
// distress event to:
//
//   • Philips Hue (red flash + blink-stress)
//   • Google Home / Nest (broadcast voice message)
//   • Amazon Alexa (Routine trigger via webhook)
//   • Generic IFTTT / webhook receivers
//
// Each is a tiny config: { kind, endpoint, secret? }. We POST a small JSON
// blob and time out fast (≤ 3 s) so the SOS pipeline isn't held up by a
// flaky bulb. Failures are logged but never block.
//
// User auth tokens / hub passcodes live in expo-secure-store, not in
// AsyncStorage, because they grant control over the user's home.

import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'hearme.smarthome.endpoints.v1';
const FETCH_TIMEOUT_MS = 3_000;

export type SmartHomeEndpointKind =
  | 'hue-bridge'
  | 'google-home'
  | 'alexa-routine'
  | 'ifttt-webhook'
  | 'generic-webhook';

export type SmartHomeEndpoint = {
  id: string;
  kind: SmartHomeEndpointKind;
  label: string;
  url: string;
  /** Optional bearer / API key — POSTed as Authorization or in the body. */
  secret?: string;
  /** Endpoint-specific extras (e.g. Hue light id, IFTTT event name). */
  meta?: Record<string, unknown>;
};

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let to: ReturnType<typeof setTimeout>;
  const timer = new Promise<never>((_, reject) => {
    to = setTimeout(() => reject(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([p, timer]);
  } finally {
    // @ts-expect-error to is set in promise body
    clearTimeout(to);
  }
}

export async function loadEndpoints(): Promise<SmartHomeEndpoint[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SmartHomeEndpoint[];
  } catch {
    return [];
  }
}

export async function saveEndpoints(eps: SmartHomeEndpoint[]): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(eps));
}

export async function addEndpoint(ep: SmartHomeEndpoint): Promise<void> {
  const eps = await loadEndpoints();
  const idx = eps.findIndex((e) => e.id === ep.id);
  if (idx >= 0) eps[idx] = ep;
  else eps.push(ep);
  await saveEndpoints(eps);
}

export async function removeEndpoint(id: string): Promise<void> {
  const eps = await loadEndpoints();
  await saveEndpoints(eps.filter((e) => e.id !== id));
}

type FireResult = { id: string; ok: boolean; reason?: string };

async function fireHue(ep: SmartHomeEndpoint): Promise<FireResult> {
  // Philips Hue local-bridge API: PUT /api/<user>/groups/0/action with a red
  // alert payload. The url is expected to already include /api/<user>.
  if (!ep.secret) return { id: ep.id, ok: false, reason: 'missing hue username' };
  try {
    const resp = await withTimeout(
      fetch(`${ep.url}/groups/0/action`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          on: true,
          bri: 254,
          hue: 65535, // red
          sat: 254,
          alert: 'lselect', // 15 s of pulsing
        }),
      }),
      FETCH_TIMEOUT_MS,
    );
    if (!resp.ok) return { id: ep.id, ok: false, reason: `hue ${resp.status}` };
    return { id: ep.id, ok: true };
  } catch (e) {
    return { id: ep.id, ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function fireWebhook(
  ep: SmartHomeEndpoint,
  payload: Record<string, unknown>,
): Promise<FireResult> {
  try {
    const resp = await withTimeout(
      fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ep.secret ? { Authorization: `Bearer ${ep.secret}` } : {}),
        },
        body: JSON.stringify(payload),
      }),
      FETCH_TIMEOUT_MS,
    );
    if (!resp.ok) return { id: ep.id, ok: false, reason: `${ep.kind} ${resp.status}` };
    return { id: ep.id, ok: true };
  } catch (e) {
    return { id: ep.id, ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function fireSmartHomeAlarm(opts?: {
  message?: string;
  severity?: 'high' | 'low';
}): Promise<FireResult[]> {
  const eps = await loadEndpoints();
  if (eps.length === 0) return [];
  const message =
    opts?.message ??
    'HearMe SOS triggered — please check on the user immediately.';
  const payload = {
    event: 'hearme_sos',
    severity: opts?.severity ?? 'high',
    message,
    at: new Date().toISOString(),
  };
  return Promise.all(
    eps.map(async (ep) => {
      switch (ep.kind) {
        case 'hue-bridge':
          return fireHue(ep);
        case 'google-home':
        case 'alexa-routine':
        case 'ifttt-webhook':
        case 'generic-webhook':
        default:
          return fireWebhook(ep, payload);
      }
    }),
  );
}

/**
 * Recipes:
 *
 *   Hue local bridge: discover bridges via SSDP / `https://discovery.meethue.com/`,
 *   then push a button on the bridge and POST `/api` with `{devicetype:"hearme"}` —
 *   you get a `username` back. Save bridge_ip + username; url = `http://<ip>/api/<username>`.
 *
 *   Google Home: cast a TTS message via Home Assistant's TTS service
 *   (the user must run HA + nabu-casa). We POST to `<ha-url>/api/services/tts/google_say`
 *   with `entity_id: media_player.kitchen_speaker, message: ...`. Auth via long-lived
 *   access token in `secret`.
 *
 *   Alexa Routine: triggered via IFTTT or via Voice Monkey webhook. Either way
 *   you POST to a webhook URL.
 *
 *   IFTTT Webhooks: classic v1 endpoint `https://maker.ifttt.com/trigger/<event>/with/key/<key>`.
 *
 * Each endpoint type uses the same `addEndpoint` shape; user only needs to
 * paste a URL + optional key.
 */
export const RECIPES = '__see lib/smart-home.ts source for endpoint recipes__';
