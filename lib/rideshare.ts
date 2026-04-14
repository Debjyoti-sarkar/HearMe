import AsyncStorage from '@react-native-async-storage/async-storage';

export type RideRecord = {
  id: string;
  driverName: string;
  vehicleNumber: string;
  vehicleType: string;
  vehicleColor: string;
  photoUri: string | null;
  platform: string; // Uber, Ola, Rapido, etc.
  startTime: string;
  endTime: string | null;
  startLocation: string | null;
  destination: string | null;
  status: 'active' | 'completed' | 'alerted';
  sharedWithContacts: boolean;
};

const KEY = '@hearme/rides_v1';
const ACTIVE_KEY = '@hearme/active_ride_v1';

export async function saveActiveRide(ride: RideRecord): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(ride));
}

export async function getActiveRide(): Promise<RideRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RideRecord;
  } catch {
    return null;
  }
}

export async function clearActiveRide(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_KEY);
}

export async function completeActiveRide(): Promise<RideRecord | null> {
  const ride = await getActiveRide();
  if (!ride) return null;
  ride.status = 'completed';
  ride.endTime = new Date().toISOString();
  await saveRideHistory(ride);
  await clearActiveRide();
  return ride;
}

export async function saveRideHistory(ride: RideRecord): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const history: RideRecord[] = raw ? JSON.parse(raw) : [];
    history.unshift(ride);
    await AsyncStorage.setItem(KEY, JSON.stringify(history.slice(0, 30)));
  } catch {
    // ignore
  }
}

export async function loadRideHistory(): Promise<RideRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RideRecord[];
  } catch {
    return [];
  }
}

export function formatRideMessage(ride: RideRecord): string {
  const parts = [
    `HearMe Ride Safety Alert`,
    `Driver: ${ride.driverName}`,
    `Vehicle: ${ride.vehicleColor} ${ride.vehicleType} — ${ride.vehicleNumber}`,
    `Platform: ${ride.platform}`,
    `Started: ${new Date(ride.startTime).toLocaleString()}`,
  ];
  if (ride.destination) parts.push(`Destination: ${ride.destination}`);
  if (ride.startLocation) parts.push(`Pickup: ${ride.startLocation}`);
  return parts.join('\n');
}
