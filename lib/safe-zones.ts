import AsyncStorage from '@react-native-async-storage/async-storage';

export type SafeZone = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusMeters: number;
  icon: string;
  alertOnExit: boolean;
  alertOnEntry: boolean;
  quietHoursStart: number; // 0-23
  quietHoursEnd: number; // 0-23
};

export type ZoneEvent = {
  id: string;
  zoneId: string;
  zoneName: string;
  type: 'enter' | 'exit';
  timestamp: string;
  lat: number;
  lon: number;
};

const ZONES_KEY = '@hearme/safe_zones_v1';
const EVENTS_KEY = '@hearme/zone_events_v1';

export async function loadSafeZones(): Promise<SafeZone[]> {
  try {
    const raw = await AsyncStorage.getItem(ZONES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SafeZone[];
  } catch {
    return [];
  }
}

export async function saveSafeZones(zones: SafeZone[]): Promise<void> {
  await AsyncStorage.setItem(ZONES_KEY, JSON.stringify(zones));
}

export async function addSafeZone(zone: SafeZone): Promise<void> {
  const zones = await loadSafeZones();
  zones.push(zone);
  await saveSafeZones(zones);
}

export async function removeSafeZone(id: string): Promise<void> {
  const zones = await loadSafeZones();
  await saveSafeZones(zones.filter((z) => z.id !== id));
}

export async function saveZoneEvent(event: ZoneEvent): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(EVENTS_KEY);
    const events: ZoneEvent[] = raw ? JSON.parse(raw) : [];
    events.unshift(event);
    await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(0, 100)));
  } catch {
    // ignore
  }
}

export async function loadZoneEvents(): Promise<ZoneEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(EVENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ZoneEvent[];
  } catch {
    return [];
  }
}

export function distanceBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isInsideZone(
  lat: number,
  lon: number,
  zone: SafeZone,
): boolean {
  return distanceBetween(lat, lon, zone.lat, zone.lon) <= zone.radiusMeters;
}

export function isQuietHours(zone: SafeZone): boolean {
  const hour = new Date().getHours();
  if (zone.quietHoursStart <= zone.quietHoursEnd) {
    return hour >= zone.quietHoursStart && hour < zone.quietHoursEnd;
  }
  // Wraps midnight, e.g., 22-6
  return hour >= zone.quietHoursStart || hour < zone.quietHoursEnd;
}
