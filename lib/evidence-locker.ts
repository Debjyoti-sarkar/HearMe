import AsyncStorage from '@react-native-async-storage/async-storage';

export type EvidenceType = 'photo' | 'audio' | 'location' | 'text';

export type EvidenceItem = {
  id: string;
  type: EvidenceType;
  uri: string | null;
  text: string | null;
  lat: number | null;
  lon: number | null;
  timestamp: string;
  alertId: string | null;
  tags: string[];
};

export type EvidenceSession = {
  id: string;
  startTime: string;
  endTime: string | null;
  items: EvidenceItem[];
  status: 'collecting' | 'completed' | 'uploaded';
  triggerType: string;
};

const KEY = '@hearme/evidence_v1';

export async function loadEvidenceSessions(): Promise<EvidenceSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as EvidenceSession[];
  } catch {
    return [];
  }
}

export async function saveEvidenceSession(session: EvidenceSession): Promise<void> {
  const sessions = await loadEvidenceSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(sessions.slice(0, 20)));
}

export async function deleteEvidenceSession(id: string): Promise<void> {
  const sessions = await loadEvidenceSessions();
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify(sessions.filter((s) => s.id !== id)),
  );
}

export function createEvidenceSession(triggerType: string): EvidenceSession {
  return {
    id: `ev-${Date.now()}`,
    startTime: new Date().toISOString(),
    endTime: null,
    items: [],
    status: 'collecting',
    triggerType,
  };
}

export function addEvidenceItem(
  session: EvidenceSession,
  item: Omit<EvidenceItem, 'id' | 'timestamp'>,
): EvidenceSession {
  return {
    ...session,
    items: [
      ...session.items,
      {
        ...item,
        id: `evi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export function completeEvidenceSession(session: EvidenceSession): EvidenceSession {
  return {
    ...session,
    endTime: new Date().toISOString(),
    status: 'completed',
  };
}

export function formatEvidenceCount(session: EvidenceSession): string {
  const photos = session.items.filter((i) => i.type === 'photo').length;
  const audio = session.items.filter((i) => i.type === 'audio').length;
  const locations = session.items.filter((i) => i.type === 'location').length;
  const parts: string[] = [];
  if (photos > 0) parts.push(`${photos} photo${photos !== 1 ? 's' : ''}`);
  if (audio > 0) parts.push(`${audio} audio`);
  if (locations > 0) parts.push(`${locations} location${locations !== 1 ? 's' : ''}`);
  return parts.join(', ') || 'No evidence';
}
