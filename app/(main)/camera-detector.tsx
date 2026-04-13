import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

const DETECTION_THRESHOLD = 200;
const HIGH_THRESHOLD = 400;

const TIPS = [
  { icon: 'shower-head' as const, title: 'Bathrooms', tip: 'Check mirrors, vents, tissue boxes, smoke detectors, and power outlets.' },
  { icon: 'bed' as const, title: 'Hotel rooms', tip: 'Inspect alarm clocks, TV frames, picture frames, and any unusual objects.' },
  { icon: 'hanger' as const, title: 'Changing rooms', tip: 'Look for holes in walls, unusual hooks, or items with tiny lenses.' },
  { icon: 'lightbulb' as const, title: 'General', tip: 'Turn off lights and look for tiny LED glows. Hidden cameras often have IR LEDs.' },
];

export default function CameraDetectorScreen() {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState(false);
  const [magnitude, setMagnitude] = useState(0);
  const [peak, setPeak] = useState(0);
  const [alertLevel, setAlertLevel] = useState<'safe' | 'caution' | 'danger'>('safe');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) return;

    Magnetometer.setUpdateInterval(100);
    const sub = Magnetometer.addListener((data) => {
      const mag = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
      setMagnitude(Math.round(mag));
      setPeak((p) => Math.max(p, Math.round(mag)));

      if (mag > HIGH_THRESHOLD) {
        setAlertLevel('danger');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (mag > DETECTION_THRESHOLD) {
        setAlertLevel('caution');
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        setAlertLevel('safe');
      }
    });

    return () => sub.remove();
  }, [active]);

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
    switch (alertLevel) {
      case 'danger': return 'Strong magnetic field detected!';
      case 'caution': return 'Elevated readings — investigate';
      default: return 'Normal magnetic field';
    }
  };

  const gaugeWidth = Math.min((magnitude / 600) * 100, 100);

  return (
    <GradientBackground>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Camera Detector</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard variant="elevated" style={styles.gaugeCard}>
          <Animated.View style={{ transform: [{ scale: alertLevel === 'danger' ? pulseAnim : 1 }] }}>
            <LinearGradient colors={getGradient()} style={styles.meterCircle}>
              <Text style={styles.magValue}>{active ? magnitude : '—'}</Text>
              <Text style={styles.magUnit}>μT</Text>
            </LinearGradient>
          </Animated.View>

          <View style={styles.gaugeBar}>
            <View style={styles.gaugeTrack}>
              <LinearGradient
                colors={getGradient()}
                style={[styles.gaugeFill, { width: `${active ? gaugeWidth : 0}%` }]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
            </View>
            <View style={styles.gaugeLabels}>
              <Text style={styles.gaugeLbl}>0</Text>
              <Text style={styles.gaugeLbl}>200</Text>
              <Text style={styles.gaugeLbl}>400</Text>
              <Text style={styles.gaugeLbl}>600+</Text>
            </View>
          </View>

          <Text style={[styles.statusText, { color: getColor() }]}>
            {active ? getLabel() : 'Tap Start to begin scanning'}
          </Text>

          {active && (
            <Text style={styles.peakText}>Peak: {peak} μT</Text>
          )}

          <Pressable
            onPress={() => {
              setActive((a) => !a);
              if (active) {
                setPeak(0);
                setMagnitude(0);
                setAlertLevel('safe');
              }
            }}
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
            This tool detects magnetic fields from electronic devices. Not all detections indicate cameras
            — electronics, magnets, and metal objects also produce magnetic fields. Use as an additional
            check alongside visual inspection.
          </Text>
        </GlassCard>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
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
    fontSize: 42,
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
  peakText: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 16,
  },
  toggleBtn: {
    borderRadius: radii.full,
    overflow: 'hidden',
    marginTop: 8,
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
});
