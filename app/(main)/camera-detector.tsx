import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Magnetometer } from 'expo-sensors';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../components/GradientBackground';
import { GlassCard } from '../../components/GlassCard';
import { colors, radii } from '../../constants/theme';

// Baseline calibration: collect N samples then alert on deviation
const CALIBRATION_SAMPLES = 20;
const DEVIATION_CAUTION = 80;   // μT above baseline
const DEVIATION_DANGER = 180;   // μT above baseline
const HAPTIC_COOLDOWN_MS = 1500;

type Mode = 'magnet' | 'ir';

const TIPS = [
  { icon: 'shower-head' as const, title: 'Bathrooms', tip: 'Check mirrors, vents, tissue boxes, smoke detectors, and power outlets.' },
  { icon: 'bed' as const, title: 'Hotel rooms', tip: 'Inspect alarm clocks, TV frames, picture frames, and any unusual objects.' },
  { icon: 'hanger' as const, title: 'Changing rooms', tip: 'Look for holes in walls, unusual hooks, or items with tiny lenses.' },
  { icon: 'lightbulb' as const, title: 'General', tip: 'Turn off lights and look for tiny LED glows. Hidden cameras often have IR LEDs.' },
];

export default function CameraDetectorScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('magnet');
  const [active, setActive] = useState(false);
  const [magnitude, setMagnitude] = useState(0);
  const [deviation, setDeviation] = useState(0);
  const [peak, setPeak] = useState(0);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [alertLevel, setAlertLevel] = useState<'safe' | 'caution' | 'danger'>('safe');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lastHapticRef = useRef(0);
  const calibrationSamples = useRef<number[]>([]);

  // IR camera mode
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // Magnetometer scanning
  useEffect(() => {
    if (!active || mode !== 'magnet') return;

    // Start calibration
    setCalibrating(true);
    setCalibrationProgress(0);
    setBaseline(null);
    calibrationSamples.current = [];

    Magnetometer.setUpdateInterval(100);
    const sub = Magnetometer.addListener((data) => {
      const mag = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
      const rounded = Math.round(mag);
      setMagnitude(rounded);

      // Calibration phase
      if (calibrationSamples.current.length < CALIBRATION_SAMPLES) {
        calibrationSamples.current.push(mag);
        setCalibrationProgress(calibrationSamples.current.length / CALIBRATION_SAMPLES);

        if (calibrationSamples.current.length === CALIBRATION_SAMPLES) {
          const avg = calibrationSamples.current.reduce((a, b) => a + b, 0) / CALIBRATION_SAMPLES;
          setBaseline(Math.round(avg));
          setCalibrating(false);
        }
        return;
      }

      // Detection phase — alert on deviation from baseline
      const base = calibrationSamples.current.reduce((a, b) => a + b, 0) / CALIBRATION_SAMPLES;
      const dev = Math.max(0, Math.round(mag - base));
      setDeviation(dev);
      setPeak((p) => Math.max(p, dev));

      const now = Date.now();
      if (dev > DEVIATION_DANGER) {
        setAlertLevel('danger');
        if (now - lastHapticRef.current > HAPTIC_COOLDOWN_MS) {
          lastHapticRef.current = now;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      } else if (dev > DEVIATION_CAUTION) {
        setAlertLevel('caution');
        if (now - lastHapticRef.current > HAPTIC_COOLDOWN_MS) {
          lastHapticRef.current = now;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } else {
        setAlertLevel('safe');
      }
    });

    return () => sub.remove();
  }, [active, mode]);

  // Pulse animation for danger
  useEffect(() => {
    if (alertLevel !== 'danger') return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 300, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [alertLevel, pulseAnim]);

  const stopScan = () => {
    setActive(false);
    setPeak(0);
    setMagnitude(0);
    setDeviation(0);
    setAlertLevel('safe');
    setBaseline(null);
    setCalibrating(false);
    setCalibrationProgress(0);
    calibrationSamples.current = [];
  };

  const startScan = () => {
    setActive(true);
  };

  const getColor = () => {
    switch (alertLevel) {
      case 'danger': return colors.danger;
      case 'caution': return colors.warning;
      default: return colors.success;
    }
  };

  const getGradient = (): [string, string] => {
    switch (alertLevel) {
      case 'danger': return ['#ef4444', '#dc2626'];
      case 'caution': return ['#f59e0b', '#d97706'];
      default: return ['#10b981', '#059669'];
    }
  };

  const getLabel = () => {
    if (calibrating) return `Calibrating... hold still (${Math.round(calibrationProgress * 100)}%)`;
    switch (alertLevel) {
      case 'danger': return 'Strong anomaly detected!';
      case 'caution': return 'Elevated readings — investigate';
      default: return 'Normal — no anomaly';
    }
  };

  const maxDeviation = DEVIATION_DANGER * 1.5;
  const gaugeWidth = Math.min((deviation / maxDeviation) * 100, 100);

  const handleStartIR = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) return;
    }
    setMode('ir');
  };

  return (
    <GradientBackground>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Camera Detector</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Mode Tabs */}
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => { stopScan(); setMode('magnet'); }}
          style={[styles.tab, mode === 'magnet' && styles.tabActive]}
        >
          <MaterialCommunityIcons
            name="magnet"
            size={18}
            color={mode === 'magnet' ? colors.accentViolet : colors.textMuted}
          />
          <Text style={[styles.tabText, mode === 'magnet' && styles.tabTextActive]}>
            Magnetic Scan
          </Text>
        </Pressable>
        <Pressable
          onPress={handleStartIR}
          style={[styles.tab, mode === 'ir' && styles.tabActive]}
        >
          <MaterialCommunityIcons
            name="flashlight"
            size={18}
            color={mode === 'ir' ? colors.accentViolet : colors.textMuted}
          />
          <Text style={[styles.tabText, mode === 'ir' && styles.tabTextActive]}>
            IR Lens Scan
          </Text>
        </Pressable>
      </View>

      {mode === 'ir' ? (
        /* IR Camera Mode */
        <View style={[styles.irContainer, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.cameraWrap}>
            {cameraPermission?.granted ? (
              <CameraView style={styles.camera} facing="back" />
            ) : (
              <View style={styles.cameraPlaceholder}>
                <MaterialCommunityIcons name="camera-off" size={48} color={colors.textMuted} />
                <Text style={styles.cameraPlaceholderText}>Camera permission required</Text>
                <Pressable onPress={requestCameraPermission} style={styles.grantBtn}>
                  <Text style={styles.grantBtnText}>Grant Permission</Text>
                </Pressable>
              </View>
            )}
          </View>

          <GlassCard style={styles.irTipCard}>
            <View style={styles.irTipHeader}>
              <MaterialCommunityIcons name="information-outline" size={18} color={colors.accentViolet} />
              <Text style={styles.irTipTitle}>How to use IR detection</Text>
            </View>
            <Text style={styles.irTipText}>
              1. Turn off all lights in the room{'\n'}
              2. Point your phone camera slowly around the room{'\n'}
              3. Look for small bright white or purple dots on screen{'\n'}
              4. Hidden cameras with night vision use IR LEDs that your phone camera can see but your eyes cannot
            </Text>
          </GlassCard>
        </View>
      ) : (
        /* Magnetometer Mode */
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <GlassCard variant="elevated" style={styles.gaugeCard}>
            <Animated.View style={{ transform: [{ scale: alertLevel === 'danger' ? pulseAnim : 1 }] }}>
              <LinearGradient colors={getGradient()} style={styles.meterCircle}>
                {calibrating ? (
                  <>
                    <Text style={styles.magValue}>{Math.round(calibrationProgress * 100)}</Text>
                    <Text style={styles.magUnit}>%</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.magValue}>{active ? `+${deviation}` : '—'}</Text>
                    <Text style={styles.magUnit}>μT</Text>
                  </>
                )}
              </LinearGradient>
            </Animated.View>

            {/* Gauge bar */}
            <View style={styles.gaugeBar}>
              <View style={styles.gaugeTrack}>
                {calibrating ? (
                  <View
                    style={[styles.calibrationFill, { width: `${calibrationProgress * 100}%` }]}
                  />
                ) : (
                  <LinearGradient
                    colors={getGradient()}
                    style={[styles.gaugeFill, { width: `${active ? gaugeWidth : 0}%` }]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  />
                )}
              </View>
              {!calibrating && (
                <View style={styles.gaugeLabels}>
                  <Text style={styles.gaugeLbl}>0</Text>
                  <Text style={styles.gaugeLbl}>+{DEVIATION_CAUTION}</Text>
                  <Text style={styles.gaugeLbl}>+{DEVIATION_DANGER}</Text>
                  <Text style={styles.gaugeLbl}>+{Math.round(maxDeviation)}</Text>
                </View>
              )}
            </View>

            <Text style={[styles.statusText, { color: getColor() }]}>
              {active ? getLabel() : 'Tap Start to begin scanning'}
            </Text>

            {active && !calibrating && (
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Baseline</Text>
                  <Text style={styles.statValue}>{baseline ?? '—'} μT</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Current</Text>
                  <Text style={styles.statValue}>{magnitude} μT</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Peak Δ</Text>
                  <Text style={styles.statValue}>+{peak} μT</Text>
                </View>
              </View>
            )}

            <Pressable
              onPress={active ? stopScan : startScan}
              style={styles.toggleBtn}
            >
              <LinearGradient
                colors={active ? ['#ef4444', '#dc2626'] : ['#7c3aed', '#a78bfa']}
                style={styles.toggleGrad}
              >
                <MaterialCommunityIcons
                  name={active ? 'stop' : 'play'}
                  size={22}
                  color="#fff"
                />
                <Text style={styles.toggleText}>{active ? 'Stop Scan' : 'Start Scan'}</Text>
              </LinearGradient>
            </Pressable>

            {active && calibrating && (
              <Text style={styles.calibHint}>
                Hold your phone still while calibrating...
              </Text>
            )}
          </GlassCard>

          <Text style={styles.sectionTitle}>Detection Tips</Text>
          {TIPS.map((t) => (
            <GlassCard key={t.title} style={styles.tipCard}>
              <View style={styles.tipRow}>
                <LinearGradient
                  colors={['rgba(167,139,250,0.3)', 'rgba(236,72,153,0.2)']}
                  style={styles.tipIcon}
                >
                  <MaterialCommunityIcons name={t.icon} size={22} color={colors.text} />
                </LinearGradient>
                <View style={styles.tipMeta}>
                  <Text style={styles.tipTitle}>{t.title}</Text>
                  <Text style={styles.tipText}>{t.tip}</Text>
                </View>
              </View>
            </GlassCard>
          ))}

          <GlassCard style={styles.disclaimer}>
            <MaterialCommunityIcons name="information-outline" size={20} color={colors.accentViolet} />
            <Text style={styles.disclaimerText}>
              This tool detects magnetic field anomalies from electronic devices. The scanner first
              calibrates to your environment, then alerts on deviations. Metal objects, magnets, and
              other electronics may also cause readings. Use alongside visual inspection and the IR
              lens scanner for best results.
            </Text>
          </GlassCard>
        </ScrollView>
      )}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  tabActive: {
    backgroundColor: 'rgba(167,139,250,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.accentViolet,
  },
  scroll: { paddingHorizontal: 20 },
  gaugeCard: {
    padding: 28,
    alignItems: 'center',
    marginBottom: 24,
  },
  meterCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  magValue: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
  },
  magUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  gaugeBar: { width: '100%', marginBottom: 16 },
  gaugeTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 4,
  },
  calibrationFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.accentViolet,
  },
  gaugeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  gaugeLbl: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    width: '100%',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  calibHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  toggleBtn: {
    borderRadius: radii.full,
    overflow: 'hidden',
    marginTop: 12,
  },
  toggleGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  toggleText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 12,
  },
  tipCard: {
    padding: 16,
    marginBottom: 10,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  tipIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipMeta: { flex: 1 },
  tipTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  tipText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  disclaimer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    marginTop: 8,
    alignItems: 'flex-start',
  },
  disclaimerText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  // IR Camera mode
  irContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  cameraWrap: {
    flex: 1,
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 16,
    minHeight: 350,
  },
  camera: {
    flex: 1,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 12,
  },
  cameraPlaceholderText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  grantBtn: {
    backgroundColor: 'rgba(167,139,250,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
  },
  grantBtnText: {
    color: colors.accentViolet,
    fontWeight: '700',
    fontSize: 14,
  },
  irTipCard: {
    padding: 16,
  },
  irTipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  irTipTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  irTipText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 22,
  },
});
