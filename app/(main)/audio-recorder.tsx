import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Pressable,
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
  deleteRecording,
  isRecording,
  loadRecordings,
  playRecording,
  startRecording,
  stopRecording,
  type RecordingEntry,
} from '../../lib/audio-recorder';

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AudioRecorderScreen() {
  useScreenAnnounce('screenAudioRecorder', 'hintAudioRecorder');
  const insets = useSafeAreaInsets();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void loadRecordings().then(setRecordings);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [recording, pulseAnim]);

  const handleRecord = useCallback(async () => {
    if (recording) {
      // Stop
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      const entry = await stopRecording();
      setRecording(false);
      setElapsed(0);
      if (entry) {
        setRecordings((prev) => [entry, ...prev]);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      // Start
      const ok = await startRecording();
      if (!ok) {
        Alert.alert('Permission denied', 'Microphone access is required to record audio evidence.');
        return;
      }
      setRecording(true);
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [recording]);

  const handlePlay = useCallback(async (entry: RecordingEntry) => {
    if (playingId === entry.id) {
      setPlayingId(null);
      return;
    }
    setPlayingId(entry.id);
    const sound = await playRecording(entry.uri);
    if (sound) {
      sound.setOnPlaybackStatusUpdate((status) => {
        if ('didJustFinish' in status && status.didJustFinish) {
          setPlayingId(null);
          void sound.unloadAsync();
        }
      });
    } else {
      setPlayingId(null);
      Alert.alert('Playback failed', 'Could not play the recording. The file may have been deleted.');
    }
  }, [playingId]);

  const handleDelete = useCallback((entry: RecordingEntry) => {
    Alert.alert('Delete recording?', `"${formatDate(entry.timestamp)}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRecording(entry.id);
          setRecordings((prev) => prev.filter((r) => r.id !== entry.id));
        },
      },
    ]);
  }, []);

  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  return (
    <GradientBackground>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={tc.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Audio Recorder</Text>
        <View style={{ width: 28 }} />
      </View>

      <GlassCard variant="elevated" style={styles.recorderCard}>
        <Animated.View style={[styles.micContainer, recording && { transform: [{ scale: pulseAnim }] }]}>
          <LinearGradient
            colors={recording ? ['#ef4444', '#dc2626'] : ['#7c3aed', '#a78bfa']}
            style={styles.micCircle}
          >
            <MaterialCommunityIcons
              name={recording ? 'microphone' : 'microphone-outline'}
              size={48}
              color="#fff"
            />
          </LinearGradient>
        </Animated.View>

        <Text style={styles.timerText}>
          {elapsedMin.toString().padStart(2, '0')}:{elapsedSec.toString().padStart(2, '0')}
        </Text>

        <Text style={styles.recStatus}>
          {recording ? 'Recording audio evidence...' : 'Tap to start recording'}
        </Text>

        <Pressable onPress={() => void handleRecord()}>
          <LinearGradient
            colors={recording ? ['#ef4444', '#dc2626'] : ['#7c3aed', '#a78bfa']}
            style={styles.recordBtn}
          >
            <MaterialCommunityIcons
              name={recording ? 'stop' : 'record-circle'}
              size={24}
              color="#fff"
            />
            <Text style={styles.recordBtnText}>
              {recording ? 'Stop Recording' : 'Start Recording'}
            </Text>
          </LinearGradient>
        </Pressable>
      </GlassCard>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Saved Recordings</Text>
        <Text style={styles.listCount}>{recordings.length}</Text>
      </View>

      <FlatList
        data={recordings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="microphone-off" size={40} color={tc.textSecondary} />
            <Text style={styles.emptyText}>No recordings yet</Text>
            <Text style={styles.emptySubtext}>
              Audio recordings can serve as evidence. Start recording in unsafe situations.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <GlassCard style={styles.recCard}>
            <View style={styles.recRow}>
              <Pressable onPress={() => void handlePlay(item)} style={styles.playBtn}>
                <LinearGradient
                  colors={playingId === item.id ? ['#ef4444', '#dc2626'] : ['#7c3aed', '#a78bfa']}
                  style={styles.playCircle}
                >
                  <MaterialCommunityIcons
                    name={playingId === item.id ? 'pause' : 'play'}
                    size={22}
                    color="#fff"
                  />
                </LinearGradient>
              </Pressable>
              <View style={styles.recMeta}>
                <Text style={styles.recDate}>{formatDate(item.timestamp)}</Text>
                <Text style={styles.recDuration}>{formatDuration(item.duration)}</Text>
              </View>
              <Pressable onPress={() => handleDelete(item)} hitSlop={10}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={tc.accentRose} />
              </Pressable>
            </View>
          </GlassCard>
        )}
      />
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: c.text },
  recorderCard: {
    marginHorizontal: 20,
    padding: 28,
    alignItems: 'center',
    marginBottom: 24,
  },
  micContainer: { marginBottom: 16 },
  micCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  timerText: {
    fontSize: 48,
    fontWeight: '900',
    color: c.text,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
  },
  recStatus: {
    color: c.textMuted,
    fontSize: 14,
    marginBottom: 20,
  },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: radii.full,
  },
  recordBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: c.text,
  },
  listCount: {
    fontSize: 14,
    fontWeight: '700',
    color: c.textMuted,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    overflow: 'hidden',
  },
  list: { paddingHorizontal: 20 },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    color: c.textMuted,
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtext: {
    color: c.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  recCard: {
    padding: 14,
    marginBottom: 8,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  playBtn: {},
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recMeta: { flex: 1 },
  recDate: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
  },
  recDuration: {
    color: c.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
