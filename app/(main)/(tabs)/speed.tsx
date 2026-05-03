import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../../components/GradientBackground';
import { GlassCard } from '../../../components/GlassCard';
import { StatusBadge } from '../../../components/StatusBadge';
import { radii } from '../../../constants/theme';
import { useThemedStyles } from '../../../hooks/useThemedStyles';
import { useAccessibility } from '../../../providers/AccessibilityProvider';
import { useHearMe } from '../../../providers/HearMeProvider';
import { useTheme, type ThemeColors } from '../../../providers/ThemeProvider';
import { saveAlertRecord } from '../../../lib/alert-history';
import { generateSafetyCode } from '../../../lib/siren';

const COUNTDOWN_SECONDS = 15;

export default function SpeedTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { settings, contacts, executeSos } = useHearMe();
  const { oneHandedShift, bodyText, headingText } = useAccessibility();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [kmh, setKmh] = useState<number>(0);
  const [maxKmh, setMaxKmh] = useState(0);
  const [status, setStatus] = useState('Starting...');
  const [crashAlert, setCrashAlert] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const prevSpeed = useRef<number>(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const crashAlertRef = useRef(false);

  // Keep refs in sync so the location callback always sees latest values
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;

  const sendCrashSos = useCallback(async () => {
    clearCountdown();
    setCrashAlert(false);
    crashAlertRef.current = false;

    const code = generateSafetyCode();
    const result = await executeSos();
    await saveAlertRecord({
      id: `alert-${Date.now()}`,
      type: 'crash',
      timestamp: new Date().toISOString(),
      location: null,
      safetyCode: code,
      contactsNotified: contactsRef.current.length,
      status: result.ok ? 'sent' : 'failed',
    });

    Alert.alert(
      result.ok ? 'SOS Sent' : 'SOS Failed',
      result.ok
        ? `Emergency contacts have been notified.\nSafety Code: ${code}`
        : result.message,
    );
  }, [executeSos]);

  const clearCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const dismissCrash = () => {
    clearCountdown();
    setCrashAlert(false);
    crashAlertRef.current = false;
  };

  const startCrashCountdown = useCallback(() => {
    if (crashAlertRef.current) return;
    crashAlertRef.current = true;
    setCrashAlert(true);
    setCountdown(COUNTDOWN_SECONDS);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    let remaining = COUNTDOWN_SECONDS;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);

      // Haptic tick every 3 seconds
      if (remaining % 3 === 0 && remaining > 0) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }

      if (remaining <= 0) {
        clearCountdown();
        void sendCrashSos();
      }
    }, 1000);
  }, [sendCrashSos]);

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => clearCountdown();
  }, []);

  // GPS tracking
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
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 3,
          timeInterval: 1000,
        },
        (loc) => {
          const mps = loc.coords.speed;
          const currentKmh = mps != null && mps > 0 ? mps * 3.6 : 0;
          setKmh(currentKmh);
          if (currentKmh > 0) {
            setMaxKmh((m) => Math.max(m, currentKmh));
          }
          setStatus(loc.coords.speed != null ? 'GPS active' : 'GPS active (no speed data)');

          // Crash detection — check using refs for latest settings.
          // Hard floor of 20 km/h so a corrupt/zero threshold can't fire on any motion.
          const s = settingsRef.current;
          const threshold = Math.max(20, s.crashSpeedThreshold);
          if (s.crashDetection && prevSpeed.current > threshold) {
            const decel = prevSpeed.current - currentKmh;
            if (decel >= threshold && decel > prevSpeed.current * 0.6) {
              startCrashCountdown();
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
  }, [startCrashCountdown]);

  // Pulse animation for crash alert
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
    if (kmh > 100) return ['rgba(239,68,68,0.5)', 'rgba(220,38,38,0.4)'];
    if (kmh > 60) return ['rgba(245,158,11,0.5)', 'rgba(217,119,6,0.4)'];
    if (kmh > 0) return ['rgba(16,185,129,0.4)', 'rgba(5,150,105,0.3)'];
    return ['rgba(99,102,241,0.4)', 'rgba(129,140,248,0.3)'];
  };

  const getSpeedTextColor = () => {
    if (kmh > 100) return '#ef4444';
    if (kmh > 60) return '#f59e0b';
    if (kmh > 0) return '#10b981';
    return tc.text;
  };

  return (
    <GradientBackground>
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 16 + oneHandedShift, paddingBottom: tabBarHeight + 24 },
        ]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, headingText]}>Speed Monitor</Text>
            <Text style={[styles.sub, bodyText]}>GPS-based speed with crash detection</Text>
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
                {kmh.toFixed(0)}
              </Text>
              <Text style={styles.speedUnit}>km/h</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: status === 'GPS active' ? tc.success : tc.textMuted }]} />
                <Text style={styles.statusText}>{status}</Text>
              </View>
            </GlassCard>
          </LinearGradient>
        </Animated.View>

        <View style={styles.statsRow}>
          <GlassCard style={styles.statCard}>
            <MaterialCommunityIcons name="speedometer-slow" size={22} color={tc.accentCyan} />
            <Text style={styles.statValue}>{kmh.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Current</Text>
          </GlassCard>
          <GlassCard style={styles.statCard}>
            <MaterialCommunityIcons name="speedometer" size={22} color={tc.accentPink} />
            <Text style={styles.statValue}>{maxKmh > 0 ? maxKmh.toFixed(1) : '0'}</Text>
            <Text style={styles.statLabel}>Max</Text>
          </GlassCard>
          <GlassCard style={styles.statCard}>
            <MaterialCommunityIcons name="car-emergency" size={22} color={tc.warning} />
            <Text style={styles.statValue}>{settings.crashSpeedThreshold}</Text>
            <Text style={styles.statLabel}>Threshold</Text>
          </GlassCard>
        </View>

        {crashAlert && (
          <GlassCard style={styles.crashBanner}>
            <View style={styles.crashHeader}>
              <MaterialCommunityIcons name="alert" size={24} color={tc.danger} />
              <View style={styles.crashCountdownCircle}>
                <Text style={styles.crashCountdownText}>{countdown}</Text>
              </View>
            </View>
            <Text style={styles.crashText}>
              Sudden deceleration detected! Auto-sending SOS in {countdown}s.
            </Text>
            <View style={styles.crashActions}>
              <Pressable
                onPress={dismissCrash}
                style={({ pressed }) => [styles.crashSafeBtn, pressed && { opacity: 0.8 }]}
              >
                <MaterialCommunityIcons name="shield-check" size={18} color={tc.success} />
                <Text style={styles.crashSafeText}>I'm Safe</Text>
              </Pressable>
              <Pressable
                onPress={() => void sendCrashSos()}
                style={({ pressed }) => [styles.crashSosBtn, pressed && { opacity: 0.8 }]}
              >
                <MaterialCommunityIcons name="alert-circle" size={18} color="#fff" />
                <Text style={styles.crashSosText}>Send SOS Now</Text>
              </Pressable>
            </View>
          </GlassCard>
        )}

        <GlassCard style={styles.infoCard}>
          <MaterialCommunityIcons name="information-outline" size={20} color={tc.accentViolet} />
          <Text style={styles.infoText}>
            Enable crash detection in Settings to auto-alert contacts when sudden deceleration
            is detected. If you don't respond within {COUNTDOWN_SECONDS} seconds, SOS is sent automatically.
          </Text>
        </GlassCard>
      </View>
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: '900', color: c.text, letterSpacing: -0.5 },
  sub: { marginTop: 6, color: c.textMuted, fontSize: 14 },
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
    color: c.textMuted,
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
    color: c.textMuted,
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
    color: c.text,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: c.textMuted,
  },
  crashBanner: {
    padding: 16,
    marginBottom: 12,
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  crashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  crashCountdownCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderWidth: 2,
    borderColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crashCountdownText: {
    fontSize: 18,
    fontWeight: '900',
    color: c.danger,
  },
  crashText: {
    color: c.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 14,
  },
  crashActions: {
    flexDirection: 'row',
    gap: 10,
  },
  crashSafeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  crashSafeText: {
    color: c.success,
    fontWeight: '800',
    fontSize: 14,
  },
  crashSosBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: c.danger,
  },
  crashSosText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  infoCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    color: c.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
