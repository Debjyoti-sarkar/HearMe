import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../components/GradientBackground';
import { GlassCard } from '../../components/GlassCard';
import { radii } from '../../constants/theme';
import { useScreenAnnounce } from '../../hooks/useScreenAnnounce';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useTheme, type ThemeColors } from '../../providers/ThemeProvider';
import {
  deleteEvidenceSession,
  formatEvidenceCount,
  loadEvidenceSessions,
  type EvidenceSession,
  type EvidenceSyncStatus,
} from '../../lib/evidence-locker';
import { syncSessionAsync, verifyChainAsync } from '../../lib/evidence-cloud';
import { isSupabaseConfigured } from '../../lib/supabase';

function makeStatusColor(c: ThemeColors) {
  return (s: EvidenceSyncStatus): string => {
    switch (s) {
      case 'synced': return c.success;
      case 'pending': return c.info;
      case 'failed': return c.danger;
      default: return c.textMuted;
    }
  };
}

function statusLabel(s: EvidenceSyncStatus): string {
  switch (s) {
    case 'synced': return 'Synced';
    case 'pending': return 'Syncing…';
    case 'failed': return 'Failed';
    default: return 'Local only';
  }
}

function shortHash(h: string | null): string {
  if (!h) return '—';
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

export default function EvidenceLockerScreen() {
  useScreenAnnounce('screenEvidenceLocker', 'hintEvidenceLocker');
  const insets = useSafeAreaInsets();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const statusColor = makeStatusColor(tc);
  const [sessions, setSessions] = useState<EvidenceSession[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await loadEvidenceSessions();
    setSessions(list);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSync = async (s: EvidenceSession) => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Cloud sync unavailable',
        'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY must be set, and you must be signed in.',
      );
      return;
    }
    setBusyId(s.id);
    const r = await syncSessionAsync(s);
    setBusyId(null);
    await reload();
    Alert.alert(
      r.ok ? 'Synced' : 'Sync failed',
      r.ok ? 'Evidence uploaded with hash chain attached.' : ('reason' in r ? r.reason : ''),
    );
  };

  const onVerify = async (s: EvidenceSession) => {
    setBusyId(s.id);
    const broken = await verifyChainAsync(s);
    setBusyId(null);
    if (broken === -1) {
      Alert.alert('Chain valid', 'All items hash to the recorded chain.');
    } else {
      Alert.alert('Tamper detected', `Item ${broken + 1} no longer matches its recorded hash.`);
    }
  };

  const onDelete = (s: EvidenceSession) => {
    Alert.alert(
      'Delete locally?',
      'This removes the local copy. Already-synced files stay in the cloud.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteEvidenceSession(s.id);
            await reload();
          },
        },
      ],
    );
  };

  return (
    <GradientBackground>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <MaterialCommunityIcons name="close" size={22} color={tc.text} />
        </Pressable>
        <Text style={styles.title}>Evidence Locker</Text>
        <View style={{ width: 40 }} />
      </View>
      <Text style={styles.sub}>
        Sessions are hash-chained locally. Cloud sync uploads media to a private
        bucket and stores the chain hash server-side as a tamper-evident
        timestamp.
      </Text>

      {sessions === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={tc.accentViolet} />
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons
            name="folder-open-outline"
            size={48}
            color={tc.textMuted}
          />
          <Text style={styles.empty}>No evidence sessions yet.</Text>
          <Text style={styles.emptySub}>
            An SOS automatically creates a stamped session.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={reload}
              tintColor={tc.accentViolet}
            />
          }
          renderItem={({ item }) => (
            <GlassCard style={styles.card}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>
                    {item.triggerType.toUpperCase()} ·{' '}
                    {new Date(item.startTime).toLocaleString()}
                  </Text>
                  <Text style={styles.cardSub}>{formatEvidenceCount(item)}</Text>
                </View>
                <View style={[styles.badge, { borderColor: statusColor(item.syncStatus) }]}>
                  <View style={[styles.dot, { backgroundColor: statusColor(item.syncStatus) }]} />
                  <Text style={[styles.badgeTxt, { color: statusColor(item.syncStatus) }]}>
                    {statusLabel(item.syncStatus)}
                  </Text>
                </View>
              </View>

              <View style={styles.hashRow}>
                <MaterialCommunityIcons name="key-link" size={14} color={tc.accentEmerald} />
                <Text style={styles.hashTxt}>chain: {shortHash(item.chainHash)}</Text>
              </View>
              {item.syncError && (
                <Text style={styles.errorTxt} numberOfLines={2}>
                  {item.syncError}
                </Text>
              )}

              <View style={styles.actions}>
                <Pressable
                  onPress={() => void onSync(item)}
                  disabled={busyId === item.id}
                  style={({ pressed }) => [styles.actBtn, pressed && { opacity: 0.85 }]}
                >
                  <LinearGradient
                    colors={[tc.accentViolet, tc.accentPink]}
                    style={styles.actGrad}
                  >
                    {busyId === item.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="cloud-upload-outline" size={16} color="#fff" />
                        <Text style={styles.actTxt}>
                          {item.syncStatus === 'synced' ? 'Re-sync' : 'Sync'}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
                <Pressable
                  onPress={() => void onVerify(item)}
                  disabled={busyId === item.id || !item.chainHash}
                  style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.85 }]}
                >
                  <MaterialCommunityIcons name="check-decagram-outline" size={16} color={tc.text} />
                  <Text style={styles.ghostTxt}>Verify chain</Text>
                </Pressable>
                <Pressable
                  onPress={() => onDelete(item)}
                  style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.85 }]}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color={tc.accentRose} />
                </Pressable>
              </View>
            </GlassCard>
          )}
        />
      )}
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  title: { fontSize: 20, fontWeight: '900', color: c.text },
  sub: {
    color: c.textMuted,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  list: { paddingHorizontal: 22, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  empty: { color: c.textMuted, fontSize: 15, fontWeight: '700' },
  emptySub: { color: c.textSecondary, fontSize: 12, textAlign: 'center' },
  card: { padding: 16, marginBottom: 0, gap: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { color: c.text, fontWeight: '800', fontSize: 14 },
  cardSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeTxt: { fontSize: 11, fontWeight: '800' },
  hashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hashTxt: {
    color: c.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  errorTxt: { color: c.accentRose, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' },
  actBtn: { borderRadius: radii.md, overflow: 'hidden', flex: 1 },
  actGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  actTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.cardBorder,
  },
  ghostTxt: { color: c.text, fontSize: 13, fontWeight: '700' },
});
