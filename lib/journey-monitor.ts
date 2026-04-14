import AsyncStorage from '@react-native-async-storage/async-storage';

export type JourneyStatus = 'active' | 'completed' | 'expired' | 'cancelled';

export type Journey = {
  id: string;
  destination: string;
  expectedArrivalTime: string; // ISO
  startTime: string; // ISO
  startLat: number;
  startLon: number;
  checkIns: JourneyCheckIn[];
  status: JourneyStatus;
  notifiedContacts: boolean;
};

export type JourneyCheckIn = {
  timestamp: string;
  lat: number;
  lon: number;
};

const KEY = '@hearme/journeys_v1';
const ACTIVE_KEY = '@hearme/active_journey_v1';

export async function saveActiveJourney(journey: Journey): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(journey));
}

export async function getActiveJourney(): Promise<Journey | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Journey;
  } catch {
    return null;
  }
}

export async function clearActiveJourney(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_KEY);
}

export async function addCheckIn(lat: number, lon: number): Promise<Journey | null> {
  const journey = await getActiveJourney();
  if (!journey || journey.status !== 'active') return null;

  journey.checkIns.push({
    timestamp: new Date().toISOString(),
    lat,
    lon,
  });
  await saveActiveJourney(journey);
  return journey;
}

export async function saveJourneyHistory(journey: Journey): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const history: Journey[] = raw ? JSON.parse(raw) : [];
    history.unshift(journey);
    await AsyncStorage.setItem(KEY, JSON.stringify(history.slice(0, 20)));
  } catch {
    // ignore
  }
}

export async function loadJourneyHistory(): Promise<Journey[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Journey[];
  } catch {
    return [];
  }
}

export function isJourneyExpired(journey: Journey): boolean {
  return new Date() > new Date(journey.expectedArrivalTime);
}

export function getTimeRemaining(journey: Journey): number {
  return Math.max(0, new Date(journey.expectedArrivalTime).getTime() - Date.now());
}

export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'EXPIRED';
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
