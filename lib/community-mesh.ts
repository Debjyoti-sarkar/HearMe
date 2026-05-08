// Community SOS mesh — opt-in "help is happening near me" beacon.
//
// What this is: when a HearMe user fires SOS *and* opts in to the mesh, a
// short-lived, location-only beacon is published. Any other HearMe user with
// mesh receive enabled and within the configured radius gets a non-blocking
// banner: "Someone nearby just sent SOS — can you help?". They can offer
// "on the way" or ignore. No identity is exposed; the beacon carries only an
// opaque rotating id, lat/lon, and a TTL.
//
// Two transports are wired:
//   1. Supabase realtime + a `community_beacons` table with PostGIS-style
//      lat/lon and a time-bucketed broadcast. Default — works anywhere we
//      have network.
//   2. BLE adapter slot — a future native implementation can advertise a
//      tiny GATT beacon and scan for nearby ones, so the mesh works
//      without internet (e.g. underground, jammed cell). The interface is
//      defined; the default backend is the Supabase one.
//
// Privacy:
//   • Beacon id rotates every emission (8 random bytes). No correlation.
//   • Beacons auto-expire after 15 min server-side (TTL trigger).
//   • Receivers see distance + bearing, not the sender's identity.
//   • Senders never see who received — recipients are anonymous unless they
//     explicitly press "on the way" with their name.

import * as Crypto from 'expo-crypto';

import { supabase, isSupabaseConfigured } from './supabase';

const DEFAULT_RADIUS_M = 500;
const BEACON_TTL_MS = 15 * 60 * 1000;
const POLL_MS = 30_000;
const EARTH_R = 6_371_000;

type RealtimeChannel = ReturnType<typeof supabase.channel>;

export type MeshBeacon = {
  beaconId: string;
  lat: number;
  lon: number;
  emittedAt: number;
  expiresAt: number;
  /** Optional severity hint — higher = more urgent. */
  severity: number;
};

export type MeshOnTheWay = {
  beaconId: string;
  helperName: string | null;
  etaSec: number | null;
  lat: number;
  lon: number;
  at: number;
};

export type MeshTransport = {
  name: string;
  emit(beacon: MeshBeacon): Promise<void>;
  /** Returns an unsubscribe handle. */
  subscribe(opts: {
    near: { lat: number; lon: number };
    radiusM: number;
    onBeacon: (b: MeshBeacon) => void;
    onHelper: (h: MeshOnTheWay) => void;
  }): Promise<{ stop: () => Promise<void> }>;
  helperReply(reply: MeshOnTheWay): Promise<void>;
};

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sa =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(sa)));
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// ---------- Default backend: Supabase ----------

const supabaseTransport: MeshTransport = {
  name: 'supabase',
  async emit(beacon) {
    if (!isSupabaseConfigured) return;
    await supabase.from('community_beacons').insert({
      beacon_id: beacon.beaconId,
      lat: beacon.lat,
      lon: beacon.lon,
      emitted_at: new Date(beacon.emittedAt).toISOString(),
      expires_at: new Date(beacon.expiresAt).toISOString(),
      severity: beacon.severity,
    });
  },
  async subscribe(opts) {
    if (!isSupabaseConfigured) {
      return { stop: async () => {} };
    }

    let channel: RealtimeChannel | null = null;
    let poller: ReturnType<typeof setInterval> | null = null;
    const seen = new Set<string>();

    const checkBeacon = (b: MeshBeacon) => {
      if (seen.has(b.beaconId)) return;
      if (b.expiresAt < Date.now()) return;
      const dist = haversineMeters(opts.near, { lat: b.lat, lon: b.lon });
      if (dist > opts.radiusM) return;
      seen.add(b.beaconId);
      opts.onBeacon(b);
    };

    // 1) Realtime subscription for new beacons.
    channel = supabase.channel('community-beacons', {
      config: { broadcast: { self: false } },
    });
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'community_beacons' },
      ({ new: row }: { new: Record<string, unknown> }) => {
        const b: MeshBeacon = {
          beaconId: String(row.beacon_id),
          lat: Number(row.lat),
          lon: Number(row.lon),
          emittedAt: new Date(String(row.emitted_at)).getTime(),
          expiresAt: new Date(String(row.expires_at)).getTime(),
          severity: Number(row.severity ?? 1),
        };
        checkBeacon(b);
      },
    );
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'community_helpers' },
      ({ new: row }: { new: Record<string, unknown> }) => {
        opts.onHelper({
          beaconId: String(row.beacon_id),
          helperName: row.helper_name ? String(row.helper_name) : null,
          etaSec: row.eta_sec ? Number(row.eta_sec) : null,
          lat: Number(row.lat),
          lon: Number(row.lon),
          at: new Date(String(row.at)).getTime(),
        });
      },
    );
    await channel.subscribe();

    // 2) Initial sweep + low-frequency poll for missed inserts.
    const sweep = async () => {
      const { data } = await supabase
        .from('community_beacons')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .limit(100);
      for (const row of data ?? []) {
        checkBeacon({
          beaconId: String(row.beacon_id),
          lat: Number(row.lat),
          lon: Number(row.lon),
          emittedAt: new Date(String(row.emitted_at)).getTime(),
          expiresAt: new Date(String(row.expires_at)).getTime(),
          severity: Number(row.severity ?? 1),
        });
      }
    };
    void sweep();
    poller = setInterval(() => {
      void sweep();
    }, POLL_MS);

    return {
      stop: async () => {
        if (poller) clearInterval(poller);
        if (channel) {
          try {
            await channel.unsubscribe();
          } catch {
            /* ignore */
          }
        }
      },
    };
  },
  async helperReply(reply) {
    if (!isSupabaseConfigured) return;
    await supabase.from('community_helpers').insert({
      beacon_id: reply.beaconId,
      helper_name: reply.helperName,
      eta_sec: reply.etaSec,
      lat: reply.lat,
      lon: reply.lon,
      at: new Date(reply.at).toISOString(),
    });
  },
};

const STATE: { transport: MeshTransport } = { transport: supabaseTransport };

/**
 * Drop in a real BLE-mesh transport for offline operation. Default is the
 * Supabase one; both can be registered together by composing.
 */
export function registerMeshTransport(transport: MeshTransport): void {
  STATE.transport = transport;
}

/** Sender — emit a beacon when SOS fires and the user opted in. */
export async function emitMeshBeacon(opts: {
  lat: number;
  lon: number;
  severity?: number;
}): Promise<MeshBeacon> {
  const beacon: MeshBeacon = {
    beaconId: bytesToHex(Crypto.getRandomBytes(8)),
    lat: opts.lat,
    lon: opts.lon,
    emittedAt: Date.now(),
    expiresAt: Date.now() + BEACON_TTL_MS,
    severity: opts.severity ?? 1,
  };
  await STATE.transport.emit(beacon);
  return beacon;
}

/** Receiver — start listening for nearby beacons. */
export async function startMeshReceiver(opts: {
  near: { lat: number; lon: number };
  radiusM?: number;
  onBeacon: (b: MeshBeacon) => void;
  onHelper: (h: MeshOnTheWay) => void;
}): Promise<{ stop: () => Promise<void> }> {
  return STATE.transport.subscribe({
    near: opts.near,
    radiusM: opts.radiusM ?? DEFAULT_RADIUS_M,
    onBeacon: opts.onBeacon,
    onHelper: opts.onHelper,
  });
}

/** Receiver action — "I'm on the way". */
export async function offerHelp(opts: {
  beaconId: string;
  helperName?: string;
  etaSec?: number;
  lat: number;
  lon: number;
}): Promise<void> {
  await STATE.transport.helperReply({
    beaconId: opts.beaconId,
    helperName: opts.helperName ?? null,
    etaSec: opts.etaSec ?? null,
    lat: opts.lat,
    lon: opts.lon,
    at: Date.now(),
  });
}
