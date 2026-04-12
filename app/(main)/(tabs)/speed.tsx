import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../../components/GradientBackground';
import { GlassCard } from '../../../components/GlassCard';
import { colors, radii } from '../../../constants/theme';

export default function SpeedTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [kmh, setKmh] = useState<number | null>(null);
  const [status, setStatus] = useState('Starting…');

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let alive = true;

    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (perm !== Location.PermissionStatus.GRANTED) {
        setStatus('Location permission denied.');
        return;
      }
      const on = await Location.hasServicesEnabledAsync();
      if (!alive) return;
      if (!on) {
        setStatus('Turn on device location for speed.');
        return;
      }
      setStatus('Listening to GPS…');
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
          setKmh(mps * 3.6);
          setStatus('GPS speed stream active');
        },
      );
    })();

    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  return (
    <GradientBackground>
      <View
        style={[
          styles.pad,
          { paddingTop: insets.top + 16, paddingBottom: tabBarHeight + 24 },
        ]}
      >
        <Text style={styles.title}>Live speed</Text>
        <Text style={styles.sub}>GPS-based awareness (LadyBuddy-style).</Text>

        <LinearGradient
          colors={['rgba(56,189,248,0.35)', 'rgba(129,140,248,0.4)']}
          style={styles.ringWrap}
        >
          <GlassCard style={styles.dial}>
            <Text style={styles.kmh}>{kmh == null ? '—' : kmh.toFixed(1)}</Text>
            <Text style={styles.unit}>km/h</Text>
            <View style={styles.statusRow}>
              <MaterialCommunityIcons name="satellite-variant" size={18} color={colors.textMuted} />
              <Text style={styles.status}>{status}</Text>
            </View>
          </GlassCard>
        </LinearGradient>

        <GlassCard style={styles.note}>
          <MaterialCommunityIcons name="information-outline" size={22} color={colors.accentViolet} />
          <Text style={styles.noteTxt}>
            GPS speed can lag indoors or in poor sky view. Use as a situational cue only — not for
            legal compliance.
          </Text>
        </GlassCard>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  pad: { flex: 1, paddingHorizontal: 20, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: '900', color: colors.text },
  sub: { marginTop: 6, color: colors.textMuted, fontSize: 14, marginBottom: 22 },
  ringWrap: {
    borderRadius: radii.xl,
    padding: 2,
    marginBottom: 18,
  },
  dial: {
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  kmh: {
    fontSize: 64,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -2,
  },
  unit: { fontSize: 20, color: colors.textMuted, fontWeight: '600', marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  status: { color: colors.textMuted, fontSize: 13, flex: 1 },
  note: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    alignItems: 'flex-start',
  },
  noteTxt: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
