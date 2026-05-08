// Group band roaming.
//
// One Hear-Me account, multiple bands worn by family members. The classic
// pairing flow (lib/neuroband-pairing.ts) assumes a single band per phone.
// Roaming layers on top:
//
//   • A `BandRegistry` keyed on memberId (kid, parent, grandparent…). The
//     phone can scan / subscribe to any registered band. Connecting cycles
//     through the list, picking the strongest RSSI.
//
//   • A group realtime channel keyed on `groupId`. Whenever a fusion verdict
//     fires for any band on this phone, we broadcast the verdict + member
//     identity. Other phones in the group (the parent's, the grandparent's)
//     subscribe and surface a banner: "Asha's band — duress (HR + GSR + temp)".
//
//   • Optional geofence per member. If a member leaves their assigned zone
//     (kid leaves school during school hours), the group sees a soft alert.
//
// We do NOT subsume the existing single-band storage; we wrap it. A user
// who never enables roaming sees no behavioural change.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import type { Verdict } from './neuroband-fusion';
import type { NeuroBandPairRecord } from './neuroband-storage';

const REGISTRY_KEY = '@hearme/band_roaming_registry_v1';
const GROUP_KEY = '@hearme/band_roaming_group_v1';

type RealtimeChannel = ReturnType<typeof supabase.channel>;

export type GroupRole = 'self' | 'kid' | 'parent' | 'grandparent' | 'partner' | 'sibling' | 'friend';

export type BandMember = {
  memberId: string;
  displayName: string;
  role: GroupRole;
  band: NeuroBandPairRecord;
  /** Optional geofence — outside this triggers a soft alert. */
  homeZone: { lat: number; lon: number; radiusM: number } | null;
};

export type GroupConfig = {
  groupId: string;
  /** Members owned by *this* phone (each has its own band). */
  members: BandMember[];
};

export type RoamingAlert =
  | {
      kind: 'fusion-fire';
      memberId: string;
      memberName: string;
      verdict: Verdict;
      at: number;
    }
  | {
      kind: 'geofence-leave';
      memberId: string;
      memberName: string;
      lat: number;
      lon: number;
      at: number;
    }
  | {
      kind: 'tamper';
      memberId: string;
      memberName: string;
      at: number;
    }
  | {
      kind: 'low-battery';
      memberId: string;
      memberName: string;
      battery: number;
      at: number;
    };

export async function loadRegistry(): Promise<BandMember[]> {
  try {
    const raw = await AsyncStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BandMember[];
  } catch {
    return [];
  }
}

export async function saveRegistry(members: BandMember[]): Promise<void> {
  await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(members));
}

export async function addMember(member: BandMember): Promise<void> {
  const list = await loadRegistry();
  const idx = list.findIndex((m) => m.memberId === member.memberId);
  if (idx >= 0) list[idx] = member;
  else list.push(member);
  await saveRegistry(list);
}

export async function removeMember(memberId: string): Promise<void> {
  const list = await loadRegistry();
  await saveRegistry(list.filter((m) => m.memberId !== memberId));
}

export async function loadGroup(): Promise<GroupConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(GROUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GroupConfig;
  } catch {
    return null;
  }
}

export async function saveGroup(g: GroupConfig): Promise<void> {
  await AsyncStorage.setItem(GROUP_KEY, JSON.stringify(g));
}

const STATE: {
  channel: RealtimeChannel | null;
  onAlert: ((a: RoamingAlert) => void) | null;
} = { channel: null, onAlert: null };

export async function joinGroupChannel(opts: {
  groupId: string;
  onAlert: (a: RoamingAlert) => void;
}): Promise<void> {
  await leaveGroupChannel();
  STATE.channel = supabase.channel(`band-group-${opts.groupId}`, {
    config: { broadcast: { self: false } },
  });
  STATE.channel.on('broadcast', { event: 'alert' }, ({ payload }: { payload: RoamingAlert }) => {
    STATE.onAlert?.(payload);
  });
  await STATE.channel.subscribe();
  STATE.onAlert = opts.onAlert;
}

export async function leaveGroupChannel(): Promise<void> {
  if (STATE.channel) {
    try {
      await STATE.channel.unsubscribe();
    } catch {
      /* ignore */
    }
  }
  STATE.channel = null;
  STATE.onAlert = null;
}

export async function broadcastAlert(alert: RoamingAlert): Promise<void> {
  if (!STATE.channel) return;
  await STATE.channel.send({ type: 'broadcast', event: 'alert', payload: alert });
}

const EARTH_R = 6_371_000;

export function isOutsideZone(
  member: BandMember,
  pos: { lat: number; lon: number },
): boolean {
  if (!member.homeZone) return false;
  const dLat = ((pos.lat - member.homeZone.lat) * Math.PI) / 180;
  const dLon = ((pos.lon - member.homeZone.lon) * Math.PI) / 180;
  const lat1 = (member.homeZone.lat * Math.PI) / 180;
  const lat2 = (pos.lat * Math.PI) / 180;
  const sa =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const dist = 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(sa)));
  return dist > member.homeZone.radiusM;
}
