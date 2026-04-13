import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../../components/GradientBackground';
import { GlassCard } from '../../../components/GlassCard';
import { StatusBadge } from '../../../components/StatusBadge';
import { colors, radii } from '../../../constants/theme';
import { useHearMe } from '../../../providers/HearMeProvider';
import { saveAlertRecord } from '../../../lib/alert-history';
import { generateSafetyCode } from '../../../lib/siren';

export default function SpeedTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { settings, contacts, executeSos } = useHearMe();
  const [kmh, setKmh] = useState<number | null>(null);
  const [maxKmh, setMaxKmh] = useState(0);
  const [status, setStatus] = useState('Starting...');
  const [crashAlert, setCrashAlert] = useState(false);
  const prevSpeed = useRef<number>(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let alive = true;

    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (perm !== Location.PermissionStatus.GRANTED) {
        setStatus('Location permission denied');
        return;
      }
      const on = await Location.hasServicesEnabledAsync();
      if (!alive) return;
      if (!on) {
        setStatus('Turn on device location');
        return;
      }
      setStatus('Acquiring GPS signal...');
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,
          timeInterval: 1000,
        },
        (loc) => {
          const mps = loc.coords.speed;
          if (mps == null || mps < 0) {
            setKmh(null);
            return;
          }
          const currentKmh = mps * 3.6;
          setKmh(currentKmh);
          setMaxKmh((m) => Math.max(m, currentKmh));
          setStatus('GPS active');

          // Crash detection
          if (settings.crashDetection && prevSpeed.current > settings.crashSpeedThreshold) {
            const decel = prevSpeed.current - currentKmh;
            if (decel > settings.crashSpeedThreshold * 0.7) {
              handleCrashDetected();
            }
          }
          prevSpeed.current = currentKmh;
        },
      );
    })();

    return () => {
      alive = false;
      sub?.remove();
    };
  }, [settings.crashDetection, settings.crashSpeedThreshold]);

  const handleCrashDetected = () => {
    if (crashAlert) return;
    setCrashAlert(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    Alert.alert(
      'Crash Detected!',
      'A sudden deceleration was detected. Are you safe?\n\nAuto-alerting contacts in 10 seconds...',
      [
        {
          text: "I'm Safe",
          style: 'cancel',
          onPress: () => setCrashAlert(false),
        },
        {
          text: 'Send SOS Now',
          style: 'destructive',
          onPress: async () => {
            const code = generateSafetyCode();
            const result = await executeSos();
            await saveAlertRecord({
              id: `alert-${Date.now()}`,
              type: 'crash',
              timestamp: new Date().toISOString(),
              location: null,
              safetyCode: code,
              contactsNotified: contacts.length,
              status: result.ok ? 'sent' : 'failed',
            });
            setCrashAlert(false);
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (!crashAlert) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [crashAlert, pulseAnim]);

  const getSpeedColor = (): [string, string] => {
    if (kmh == null) return ['rgba(99,102,241,0.4)', 'rgba(129,140,248,0.3)'];
    if (kmh > 100) return ['rgba(239,68,68,0.5)', 'rgba(220,38,38,0.4)'];
    if (kmh > 60) return ['rgba(245,158,11,0.5)', 'rgba(217,119,6,0.4)'];
    return ['rgba(16,185,129,0.4)', 'rgba(5,150,105,0.3)'];
  };

  const getSpeedTextColor = () => {
    if (kmh == null) return colors.text;
    if (kmh > 100) return '#ef4444';
    if (kmh > 60) return '#f59e0b';
    return '#10b981';
  };

  return (
    <GradientBackground>
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: tabBarHeight + 24 },
        ]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Speed Monitor</Text>
            <Text style={styles.sub}>GPS-based speed with crash detection</Text>
          </View>
          <StatusBadge
            label={settings.crashDetection ? 'Crash ON' : 'Crash OFF'}
            variant={settings.crashDetection ? 'success' : 'info'}
          />
        </View>

        <Animated.View style={[styles.dialContainer, crashAlert && { transform: [{ scale: pulseAnim }] }]}>
          <LinearGradient colors={getSpeedColor()} style={styles.dialOuter}>
            <GlassCard variant="elevated" style={styles.dial}>
              <Text style={[styles.speedValue, { color: getSpeedTextColor() }]}>
                {kmh == null ? '—' : kmh.toFixed(0)}
              </Text>
              <Text style={styles.speedUnit}>km/h</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: kmh != null ? colors.success : colors.textMuted }]} />
                <Text style={styles.statusText}>{status}</Text>
              </View>
            </GlassCard>
          </LinearGradient>
        </Animated.View>

        <View style={styles.statsRow}>
          <GlassCard style={styles.statCard}>
            <MaterialCommunityIcons name="speedometer-slow" size={22} color={colors.accentCyan} />
            <Text style={styles.statValue}>{kmh?.toFixed(1) ?? '—'}</Text>
            <Text style={styles.statLabel}>Current</Text>
          </GlassCard>
          <GlassCard style={styles.statCard}>
            <MaterialCommunityIcons name="speedometer" size={22} color={colors.accentPink} />
            <Text style={styles.statValue}>{maxKmh > 0 ? maxKmh.toFixed(1) : '—'}</Text>
            <Text style={styles.statLabel}>Max</Text>
          </GlassCard>
          <GlassCard style={styles.statCard}>
            <MaterialCommunityIcons name="car-emergency" size={22} color={colors.warning} />
            <Text style={styles.statValue}>{settings.crashSpeedThreshold}</Text>
            <Text style={styles.statLabel}>Threshold</Text>
          </GlassCard>
        </View>

        {crashAlert && (
          <GlassCard style={styles.crashBanner}>
            <MaterialCommunityIcons name="alert" size={24} color={colors.danger} />
            <Text style={styles.crashText}>
              Sudden deceleration detected! Respond within 10 seconds or contacts will be alerted.
            </Text>
          </GlassCard>
        )}

        <GlassCard style={styles.infoCard}>
          <MaterialCommunityIcons name="information-outline" size={20} color={colors.accentViolet} />
          <Text style={styles.infoText}>
            Enable crash detection in Settings to auto-alert contacts when sudden deceleration
            is detected. GPS speed may lag indoors — use as a situational tool.
          </Text>
        </GlassCard>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  sub: { marginTop: 6, color: colors.textMuted, fontSize: 14 },
  dialContainer: { alignItems: 'center', marginBottom: 24 },
  dialOuter: {
    borderRadius: radii.xl + 4,
    padding: 3,
  },
  dial: {
    paddingVertical: 40,
    paddingHorizontal: 48,
    alignItems: 'center',
    backgroundColor: 'rgba(10,1,24,0.5)',
  },
  speedValue: {
    fontSize: 72,
    fontWeight: '900',
    letterSpacing: -3,
    fontVariant: ['tabular-nums'],
  },
  speedUnit: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  crashBanner: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    marginBottom: 12,
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  crashText: {
    flex: 1,
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  infoCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
