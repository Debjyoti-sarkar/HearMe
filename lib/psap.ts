// PSAP / 112 / RapidSOS adapter.
//
// In jurisdictions that allow it, HearMe can forward an SOS directly to the
// nearest Public Safety Answering Point (the local 911 / 112 dispatch
// centre) with the user's verified location, medical info, and incident
// metadata — bypassing the manual "tell the operator your address" step
// that costs critical seconds.
//
// Real PSAP integration is a contractual relationship:
//   • US: RapidSOS Premium / Emergency Data Hub — REST API + signed access
//     tokens. Apps are vetted before they get write access.
//   • EU: 112 / eCall — operator-specific. Some EU regions accept advanced
//     mobile location (AML) over standard 112 SMS / call channels.
//   • IN: 112 India — SMS + voice; can include ERSS metadata if the issuing
//     state has integration (Punjab, MP, Telangana have piloted SDKs).
//
// This module exposes a clean adapter so any of those backends drops in.
// Without a registered backend, the JS layer falls back to a `tel:`
// emergency-number dial — same as the existing `dialEmergency`.

import { Linking, Platform } from 'react-native';

export type PsapBackendName = 'rapidsos' | 'eu-112-aml' | 'in-ersos' | 'fallback-tel';

export type PsapPayload = {
  /** ISO timestamp the incident fired. */
  at: string;
  lat: number | null;
  lon: number | null;
  /** GPS accuracy meters. */
  accuracyM: number | null;
  /** Optional indoor floor estimate. */
  floor: number | null;
  /** Speed in m/s if available. */
  speedMps: number | null;
  /** Bearing degrees if available. */
  bearingDeg: number | null;
  callerName: string | null;
  callerPhone: string | null;
  callerDob: string | null;
  bloodType: string | null;
  knownConditions: string[];
  preferredLanguages: string[];
  triggerSource: string;
  /** Free-form note ("audio captured", "fall detected", …). */
  note: string;
};

export type PsapBackend = {
  name: PsapBackendName;
  /** True if the backend has credentials and is reachable. */
  isAvailable(): Promise<boolean>;
  /** Forward the incident. */
  send(payload: PsapPayload): Promise<{ ok: boolean; reason?: string; incidentId?: string }>;
};

const fallbackTelBackend: PsapBackend = {
  name: 'fallback-tel',
  async isAvailable() {
    return true;
  },
  async send(payload) {
    // No real PSAP backend — dial the OS-level emergency number. The user is
    // expected to read out their location to the operator.
    const num = Platform.OS === 'ios' ? '112' : '112';
    const tel = `tel:${num}`;
    try {
      await Linking.openURL(tel);
      return { ok: true, incidentId: `tel-${payload.at}` };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  },
};

let backend: PsapBackend = fallbackTelBackend;

export function registerPsapBackend(b: PsapBackend): void {
  backend = b;
}

export function getActivePsapBackendName(): PsapBackendName {
  return backend.name;
}

export async function isPsapAvailable(): Promise<boolean> {
  return backend.isAvailable();
}

export async function sendToPsap(payload: PsapPayload): Promise<{
  ok: boolean;
  reason?: string;
  incidentId?: string;
  via: PsapBackendName;
}> {
  const r = await backend.send(payload);
  return { ...r, via: backend.name };
}

// =====================================================
// Reference: a sketch of the RapidSOS adapter.
//
// Real auth is OAuth2 client-credentials with a vendor-issued client_id /
// client_secret. The token gets refreshed every ~24 h. The sketch below
// shows the request shape but never embeds keys — they must be injected
// at registration time.
// =====================================================

export type RapidSOSCredentials = {
  clientId: string;
  clientSecret: string;
  /** Whether to use the staging or production endpoint. */
  env: 'sandbox' | 'production';
};

export function buildRapidSOSBackend(_creds: RapidSOSCredentials): PsapBackend {
  return {
    name: 'rapidsos',
    async isAvailable() {
      // The honest answer until the real OAuth + REST client is wired:
      return false;
    },
    async send() {
      return { ok: false, reason: 'rapidsos-bridge-not-installed' };
    },
  };
}

/**
 * Recipe:
 *
 *   1. Apply for RapidSOS Emergency Data Hub access with your safety-app
 *      use case. They issue client_id / client_secret.
 *   2. Implement OAuth2 client-credentials flow against their token URL
 *      (sandbox: https://auth-sandbox.rapidsos.com/oauth2/token).
 *   3. POST the incident JSON to /v3/incident with a Bearer token. Their
 *      response includes an incident URN that the dispatcher can subscribe
 *      to for live updates.
 *   4. Replace the body of `buildRapidSOSBackend` with the real client and
 *      `registerPsapBackend(buildRapidSOSBackend(creds))` from your custom
 *      dev client (never bundle creds into the open-source build).
 *
 *   EU 112 AML: depends on operator. In ~25 EU countries, sending an AML SMS
 *   immediately after a 112 call delivers GPS to the dispatcher with no app
 *   integration needed. Our `dialEmergency` already triggers that path.
 */
export const NATIVE_RECIPE = '__see lib/psap.ts source for full recipe__';
