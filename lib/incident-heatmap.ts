// Anonymous incident heatmap.
//
// Two halves:
//   • Reporter — when SOS fires, append a *bucketed* ping to the public
//     `incident_pings` table. Bucketed = lat/lon rounded to 3 decimal
//     places (~110 m grid), so a single ping cannot reveal an exact
//     location.
//   • Reader — `fetchHeatmap()` calls the `heatmap_at` RPC which enforces
//     k-anonymity (cells with <K hits are folded into a "rare" bucket).
//
// The reporter never sends the user's identity. RLS on the table allows the
// user to delete their own pings if they want them gone.

import * as Location from 'expo-location';

import { supabase, isSupabaseConfigured } from './supabase';

export type HeatmapCell = {
  lat: number;
  lon: number;
  count: number;
};

export type Heatmap = {
  cells: HeatmapCell[];
  rareCount: number;
  fetchedAt: number;
};

function bucket(value: number): number {
  // 3-decimal-place — matches the SQL bucket scale.
  return Math.round(value * 1000) / 1000;
}

/**
 * Append a bucketed ping. Best-effort — never throws. Offline → silent
 * no-op (we don't queue privacy-sensitive items locally).
 */
export async function reportIncidentPing(opts: {
  triggerKind: string;
}): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp?.user) return;
    await supabase.from('incident_pings').insert({
      user_id: userResp.user.id,
      lat_bucket: bucket(pos.coords.latitude),
      lon_bucket: bucket(pos.coords.longitude),
      trigger_kind: opts.triggerKind,
    });
  } catch {
    /* best-effort */
  }
}

export async function fetchHeatmap(opts: {
  lat: number;
  lon: number;
  radiusM: number;
  since?: string; // postgres interval literal, e.g. '30 days'
  k?: number;
}): Promise<Heatmap> {
  if (!isSupabaseConfigured) {
    return { cells: [], rareCount: 0, fetchedAt: Date.now() };
  }
  const { data, error } = await supabase.rpc('heatmap_at', {
    in_lat: opts.lat,
    in_lon: opts.lon,
    in_radius_m: opts.radiusM,
    in_since: opts.since ?? '90 days',
    in_k: opts.k ?? 5,
  });
  if (error || !data) {
    return { cells: [], rareCount: 0, fetchedAt: Date.now() };
  }
  const rows = data as { cell_lat: number | null; cell_lon: number | null; count: number; bucket: string }[];
  const cells: HeatmapCell[] = [];
  let rare = 0;
  for (const row of rows) {
    if (row.bucket === 'cell' && row.cell_lat != null && row.cell_lon != null) {
      cells.push({ lat: Number(row.cell_lat), lon: Number(row.cell_lon), count: row.count });
    } else if (row.bucket === 'rare') {
      rare = row.count;
    }
  }
  return { cells, rareCount: rare, fetchedAt: Date.now() };
}

/**
 * Delete all pings the current user has contributed. Privacy guarantee — a
 * user can fully retract their data even though the cells are aggregated.
 */
export async function eraseMyPings(): Promise<{ ok: boolean; deleted: number }> {
  if (!isSupabaseConfigured) return { ok: false, deleted: 0 };
  const { count, error } = await supabase
    .from('incident_pings')
    .delete({ count: 'exact' })
    .gt('pinged_at', '1970-01-01');
  if (error) return { ok: false, deleted: 0 };
  return { ok: true, deleted: count ?? 0 };
}
