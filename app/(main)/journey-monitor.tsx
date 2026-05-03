import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../components/GradientBackground';
import { GlassCard } from '../../components/GlassCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { radii } from '../../constants/theme';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useTheme, type ThemeColors } from '../../providers/ThemeProvider';
import { useHearMe } from '../../providers/HearMeProvider';
import { saveAlertRecord } from '../../lib/alert-history';
import { generateSafetyCode } from '../../lib/siren';
import {
  addCheckIn,
  clearActiveJourney,
  formatTimeRemaining,
  getActiveJourney,
  getTimeRemaining,
  isJourneyExpired,
  saveActiveJourney,
  saveJourneyHistory,
  type Journey,
} from '../../lib/journey-monitor';

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export default function JourneyMonitorScreen() {
  const insets = useSafeAreaInsets();
  const { contacts, executeSos } = useHearMe();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [destination, setDestination] = useState('');
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    void getActiveJourney().then((j) => {
      setJourney(j);
      setLoading(false);
    });
  }, []);

  // Timer tick
  useEffect(() => {
    if (!journey || journey.status !== 'active') return;
    const tick = setInterval(() => {
      const remaining = getTimeRemaining(journey);
      setTimeLeft(formatTimeRemaining(remaining));

      if (remaining <= 0 && !journey.notifiedContacts) {
        handleExpired();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [journey]);

  // Pulse animation when expired
  useEffect(() => {
    if (!journey || !isJourneyExpired(journey)) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [journey, pulseAnim]);

  const handleExpired = useCallback(async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert(
      'Journey Timer Expired!',
      "You haven't checked in. Are you safe?\n\nContacts will be alerted in 30 seconds if you don't respond.",
      [
        {
          text: "I'm Safe",
          onPress: async () => {
            if (!journey) return;
            const updated = { ...journey, status: 'completed' as const };
            await saveJourneyHistory(updated);
            await clearActiveJourney();
            setJourney(null);
          },
        },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: async () => {
            const code = generateSafetyCode();
            const result = await executeSos();
            await saveAlertRecord({
              id: `alert-${Date.now()}`,
              type: 'sos',
              timestamp: new Date().toISOString(),
              location: null,
              safetyCode: code,
              contactsNotified: contacts.length,
              status: result.ok ? 'sent' : 'failed',
            });
            if (journey) {
              const updated = { ...journey, status: 'expired' as const, notifiedContacts: true };
              await saveJourneyHistory(updated);
              await clearActiveJourney();
              setJourney(updated);
            }
          },
        },
      ],
      { cancelable: false },
    );
  }, [journey, contacts, executeSos]);

  const startJourney = async () => {
    if (!destination.trim()) {
      Alert.alert('Enter destination', 'Tell us where you are heading.');
      return;
    }
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location is required for journey monitoring.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const arrivalTime = new Date(Date.now() + duration * 60000).toISOString();

      const newJourney: Journey = {
        id: `j-${Date.now()}`,
        destination: destination.trim(),
        expectedArrivalTime: arrivalTime,
        startTime: new Date().toISOString(),
        startLat: loc.coords.latitude,
        startLon: loc.coords.longitude,
        checkIns: [],
        status: 'active',
        notifiedContacts: false,
      };

      await saveActiveJourney(newJourney);
      setJourney(newJourney);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert(
        'Could not start journey',
        err instanceof Error
          ? `Location lookup failed: ${err.message}`
          : 'Could not get your current location. Try again outdoors or with a stronger GPS signal.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location is required to check in.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const updated = await addCheckIn(loc.coords.latitude, loc.coords.longitude);
      if (updated) setJourney(updated);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      Alert.alert(
        'Check-in failed',
        err instanceof Error
          ? err.message
          : 'Could not get your current location. Try again in a moment.',
      );
    }
  };

  const endJourney = async () => {
    if (!journey) return;
    const updated = { ...journey, status: 'completed' as const };
    await saveJourneyHistory(updated);
    await clearActiveJourney();
    setJourney(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (loading) {
    return <GradientBackground><View style={{ flex: 1 }} /></GradientBackground>;
  }

  return (
    <GradientBackground>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={tc.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Journey Monitor</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {!journey ? (
          <>
            <GlassCard variant="accent" style={styles.infoCard}>
              <MaterialCommunityIcons name="shield-account" size={24} color={tc.accentViolet} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoTitle}>Dead Man's Switch</Text>
                <Text style={styles.infoText}>
                  Set your destination and expected arrival time. If you don't check in or arrive on time,
                  HearMe will automatically alert your emergency contacts with your last known location.
                </Text>
              </View>
            </GlassCard>

            <Text style={styles.label}>WHERE ARE YOU GOING?</Text>
            <TextInput
              value={destination}
              onChangeText={setDestination}
              placeholder="e.g. Office, Friend's place, Airport"
              placeholderTextColor={tc.textSecondary}
              style={styles.input}
            />

            <Text style={styles.label}>EXPECTED TRAVEL TIME</Text>
            <View style={styles.durationGrid}>
              {DURATION_OPTIONS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDuration(d)}
                  style={[styles.durationChip, duration === d && styles.durationActive]}
                >
                  <Text style={[styles.durationText, duration === d && styles.durationTextActive]}>
                    {d >= 60 ? `${d / 60}h` : `${d}m`}
                  </Text>
                </Pressable>
              ))}
            </View>

            <PrimaryButton
              title="Start Journey"
              icon={<MaterialCommunityIcons name="navigation" size={20} color="#fff" />}
              onPress={() => void startJourney()}
              style={{ marginTop: 24 }}
            />

            {contacts.length === 0 && (
              <GlassCard style={styles.warnCard}>
                <MaterialCommunityIcons name="alert" size={20} color={tc.warning} />
                <Text style={styles.warnText}>
                  Add emergency contacts first — they'll be notified if you don't check in.
                </Text>
              </GlassCard>
            )}
          </>
        ) : (
          <>
            <Animated.View style={[styles.timerCard, isJourneyExpired(journey) && { transform: [{ scale: pulseAnim }] }]}>
              <GlassCard
                variant="elevated"
                style={[styles.timerInner, isJourneyExpired(journey) && styles.timerExpired]}
              >
                <Text style={styles.timerLabel}>
                  {isJourneyExpired(journey) ? 'TIMER EXPIRED' : 'TIME REMAINING'}
                </Text>
                <Text style={[styles.timerValue, isJourneyExpired(journey) && styles.timerValueExpired]}>
                  {timeLeft || '—'}
                </Text>
                <Text style={styles.destLabel}>to {journey.destination}</Text>

                <View style={styles.journeyStats}>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{journey.checkIns.length}</Text>
                    <Text style={styles.statLabel}>Check-ins</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>
                      {new Date(journey.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={styles.statLabel}>Started</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>
                      {new Date(journey.expectedArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={styles.statLabel}>ETA</Text>
                  </View>
                </View>
              </GlassCard>
            </Animated.View>

            <View style={styles.actionRow}>
              <Pressable onPress={() => void handleCheckIn()} style={styles.checkInBtn}>
                <LinearGradient colors={['#10b981', '#059669']} style={styles.checkInGrad}>
                  <MaterialCommunityIcons name="check-circle" size={24} color="#fff" />
                  <Text style={styles.checkInText}>I'm Safe</Text>
                </LinearGradient>
              </Pressable>

              <Pressable onPress={() => void endJourney()} style={styles.endBtn}>
                <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.endGrad}>
                  <MaterialCommunityIcons name="flag-checkered" size={24} color="#fff" />
                  <Text style={styles.endText}>Arrived</Text>
                </LinearGradient>
              </Pressable>
            </View>

            <PrimaryButton
              title="Emergency SOS"
              variant="danger"
              icon={<MaterialCommunityIcons name="alert" size={20} color="#fff" />}
              onPress={() => void handleExpired()}
              style={{ marginTop: 12 }}
            />

            {journey.checkIns.length > 0 && (
              <>
                <Text style={[styles.label, { marginTop: 24 }]}>RECENT CHECK-INS</Text>
                {journey.checkIns.slice(-5).reverse().map((ci, i) => (
                  <GlassCard key={i} style={styles.checkInCard}>
                    <MaterialCommunityIcons name="map-marker-check" size={20} color={tc.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.checkInTime}>
                        {new Date(ci.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </Text>
                      <Text style={styles.checkInCoords}>
                        {ci.lat.toFixed(5)}, {ci.lon.toFixed(5)}
                      </Text>
                    </View>
                  </GlassCard>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
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
  scroll: { paddingHorizontal: 20 },
  infoCard: {
    flexDirection: 'row',
    gap: 14,
    padding: 18,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  infoTitle: { fontSize: 16, fontWeight: '800', color: c.text, marginBottom: 4 },
  infoText: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
  label: {
    color: c.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 8,
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.inputBorder,
    backgroundColor: c.inputBg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: c.text,
    fontSize: 16,
    marginBottom: 20,
  },
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  durationChip: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: c.cardBorder,
    backgroundColor: c.card,
  },
  durationActive: {
    borderColor: c.accentViolet,
    backgroundColor: 'rgba(167,139,250,0.15)',
  },
  durationText: {
    color: c.textMuted,
    fontWeight: '700',
    fontSize: 15,
  },
  durationTextActive: {
    color: c.accentViolet,
  },
  warnCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    marginTop: 16,
    alignItems: 'flex-start',
  },
  warnText: { flex: 1, color: c.warning, fontSize: 13, lineHeight: 18 },
  timerCard: { marginBottom: 20 },
  timerInner: {
    padding: 28,
    alignItems: 'center',
  },
  timerExpired: {
    borderColor: 'rgba(239,68,68,0.3)',
  },
  timerLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: c.textSecondary,
    letterSpacing: 2,
    marginBottom: 8,
  },
  timerValue: {
    fontSize: 56,
    fontWeight: '900',
    color: c.text,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  timerValueExpired: { color: c.danger },
  destLabel: {
    color: c.textMuted,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 20,
  },
  journeyStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: c.text },
  statLabel: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.08)' },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  checkInBtn: { flex: 1, borderRadius: radii.lg, overflow: 'hidden' },
  checkInGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  checkInText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  endBtn: { flex: 1, borderRadius: radii.lg, overflow: 'hidden' },
  endGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  endText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  checkInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 8,
  },
  checkInTime: { color: c.text, fontWeight: '700', fontSize: 14 },
  checkInCoords: { color: c.textSecondary, fontSize: 11, marginTop: 2 },
});
