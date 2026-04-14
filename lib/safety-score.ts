import AsyncStorage from '@react-native-async-storage/async-storage';

export type IncidentReport = {
  id: string;
  type: 'harassment' | 'stalking' | 'unsafe_area' | 'theft' | 'assault' | 'other';
  description: string;
  lat: number;
  lon: number;
  timestamp: string;
  severity: 1 | 2 | 3 | 4 | 5;
};

const INCIDENTS_KEY = '@hearme/incidents_v1';

export type SafetyLevel = 'safe' | 'moderate' | 'caution' | 'danger';

export type SafetyScoreResult = {
  score: number; // 0-100
  level: SafetyLevel;
  factors: SafetyFactor[];
};

export type SafetyFactor = {
  label: string;
  impact: 'positive' | 'negative' | 'neutral';
  detail: string;
};

/**
 * Calculate a safety score based on local context.
 * In production, this would integrate with crime data APIs,
 * but we use time-of-day and local incident history as signals.
 */
export function calculateSafetyScore(
  hour: number,
  nearbyIncidents: number,
  isInSafeZone: boolean,
  hasContacts: boolean,
  shakeEnabled: boolean,
): SafetyScoreResult {
  let score = 70; // baseline
  const factors: SafetyFactor[] = [];

  // Time of day factor
  if (hour >= 6 && hour < 18) {
    score += 15;
    factors.push({ label: 'Daytime', impact: 'positive', detail: 'Daylight hours are generally safer' });
  } else if (hour >= 18 && hour < 22) {
    score += 5;
    factors.push({ label: 'Evening', impact: 'neutral', detail: 'Stay alert and in well-lit areas' });
  } else {
    score -= 15;
    factors.push({ label: 'Late night', impact: 'negative', detail: 'Higher risk hours — stay vigilant' });
  }

  // Safe zone factor
  if (isInSafeZone) {
    score += 15;
    factors.push({ label: 'Safe zone', impact: 'positive', detail: 'You are in a defined safe zone' });
  }

  // Nearby incidents factor
  if (nearbyIncidents > 5) {
    score -= 20;
    factors.push({ label: 'High incidents', impact: 'negative', detail: `${nearbyIncidents} incidents reported nearby` });
  } else if (nearbyIncidents > 2) {
    score -= 10;
    factors.push({ label: 'Some incidents', impact: 'negative', detail: `${nearbyIncidents} incidents reported nearby` });
  } else if (nearbyIncidents === 0) {
    score += 5;
    factors.push({ label: 'No incidents', impact: 'positive', detail: 'No recent incidents reported nearby' });
  }

  // Preparedness factors
  if (hasContacts) {
    score += 5;
    factors.push({ label: 'Contacts ready', impact: 'positive', detail: 'Emergency contacts configured' });
  } else {
    score -= 10;
    factors.push({ label: 'No contacts', impact: 'negative', detail: 'Add emergency contacts for quick alerts' });
  }

  if (shakeEnabled) {
    score += 5;
    factors.push({ label: 'Shake active', impact: 'positive', detail: 'Shake-to-SOS is enabled' });
  }

  score = Math.max(0, Math.min(100, score));

  let level: SafetyLevel;
  if (score >= 75) level = 'safe';
  else if (score >= 55) level = 'moderate';
  else if (score >= 35) level = 'caution';
  else level = 'danger';

  return { score, level, factors };
}

export const LEVEL_COLORS: Record<SafetyLevel, string> = {
  safe: '#10b981',
  moderate: '#3b82f6',
  caution: '#f59e0b',
  danger: '#ef4444',
};

export const LEVEL_LABELS: Record<SafetyLevel, string> = {
  safe: 'Safe',
  moderate: 'Moderate',
  caution: 'Caution',
  danger: 'Danger',
};

export const INCIDENT_TYPES: { value: IncidentReport['type']; label: string; icon: string }[] = [
  { value: 'harassment', label: 'Harassment', icon: 'account-alert' },
  { value: 'stalking', label: 'Stalking', icon: 'eye-outline' },
  { value: 'unsafe_area', label: 'Unsafe Area', icon: 'map-marker-alert' },
  { value: 'theft', label: 'Theft', icon: 'hand-coin' },
  { value: 'assault', label: 'Assault', icon: 'alert-octagon' },
  { value: 'other', label: 'Other', icon: 'flag-outline' },
];

export async function loadIncidents(): Promise<IncidentReport[]> {
  try {
    const raw = await AsyncStorage.getItem(INCIDENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as IncidentReport[];
  } catch {
    return [];
  }
}

export async function saveIncident(incident: IncidentReport): Promise<void> {
  const incidents = await loadIncidents();
  incidents.unshift(incident);
  await AsyncStorage.setItem(INCIDENTS_KEY, JSON.stringify(incidents.slice(0, 100)));
}

export async function deleteIncident(id: string): Promise<void> {
  const incidents = await loadIncidents();
  await AsyncStorage.setItem(
    INCIDENTS_KEY,
    JSON.stringify(incidents.filter((i) => i.id !== id)),
  );
}
