import AsyncStorage from '@react-native-async-storage/async-storage';

export type EvidenceType = 'photo' | 'audio' | 'location' | 'text';

export type EvidenceSyncStatus = 'local' | 'pending' | 'synced' | 'failed';

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
  /** SHA-256 of canonical item content (hex). Set during sync or manually. */
  contentHash: string | null;
  /** SHA-256 of (previous item's chainHash || contentHash). The tamper chain. */
  chainHash: string | null;
  /** Supabase Storage path after upload (e.g. user/session/item.m4a). */
  cloudPath: string | null;
};

export type EvidenceSession = {
  id: string;
  startTime: string;
  endTime: string | null;
  items: EvidenceItem[];
  status: 'collecting' | 'completed' | 'uploaded';
  triggerType: string;
  /** Final chain hash = last item's chainHash. Empty session => null. */
  chainHash: string | null;
  /** When sync last ran. */
  lastSyncAt: string | null;
  syncStatus: EvidenceSyncStatus;
  syncError: string | null;
};

const KEY = '@hearme/evidence_v2';
const LEGACY_KEY = '@hearme/evidence_v1';

function migrateLegacyItem(item: Partial<EvidenceItem>): EvidenceItem {
  return {
    id: item.id ?? `evi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: item.type ?? 'text',
    uri: item.uri ?? null,
    text: item.text ?? null,
    lat: item.lat ?? null,
    lon: item.lon ?? null,
    timestamp: item.timestamp ?? new Date().toISOString(),
    alertId: item.alertId ?? null,
    tags: item.tags ?? [],
    contentHash: item.contentHash ?? null,
    chainHash: item.chainHash ?? null,
    cloudPath: item.cloudPath ?? null,
  };
}

function migrateLegacySession(s: Partial<EvidenceSession>): EvidenceSession {
  return {
    id: s.id ?? `ev-${Date.now()}`,
    startTime: s.startTime ?? new Date().toISOString(),
    endTime: s.endTime ?? null,
    items: (s.items ?? []).map(migrateLegacyItem),
    status: s.status ?? 'collecting',
    triggerType: s.triggerType ?? 'manual',
    chainHash: s.chainHash ?? null,
    lastSyncAt: s.lastSyncAt ?? null,
    syncStatus: s.syncStatus ?? 'local',
    syncError: s.syncError ?? null,
  };
}

export async function loadEvidenceSessions(): Promise<EvidenceSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as EvidenceSession[];
    // One-shot migration from v1 if present.
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (!legacy) return [];
    const sessions = (JSON.parse(legacy) as EvidenceSession[]).map(migrateLegacySession);
    await AsyncStorage.setItem(KEY, JSON.stringify(sessions));
    return sessions;
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
    chainHash: null,
    lastSyncAt: null,
    syncStatus: 'local',
    syncError: null,
  };
}

export function addEvidenceItem(
  session: EvidenceSession,
  item: Omit<EvidenceItem, 'id' | 'timestamp' | 'contentHash' | 'chainHash' | 'cloudPath'>,
): EvidenceSession {
  return {
    ...session,
    items: [
      ...session.items,
      {
        ...item,
        id: `evi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        contentHash: null,
        chainHash: null,
        cloudPath: null,
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
