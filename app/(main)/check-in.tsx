import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { colors, radii } from '../../constants/theme';
import { describeRemaining } from '../../lib/timer-checkin';
import { useHearMe } from '../../providers/HearMeProvider';

const PRESETS = [
  { label: '15 min', ms: 15 * 60_000 },
  { label: '30 min', ms: 30 * 60_000 },
  { label: '1 hour', ms: 60 * 60_000 },
  { label: '2 hours', ms: 120 * 60_000 },
];

export default function CheckInScreen() {
  const insets = useSafeAreaInsets();
  const { settings, startCheckIn, cancelCheckIn } = useHearMe();
  const [labelDraft, setLabelDraft] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const active = settings.activeCheckInExpiresAt !== null;
  const remainingMs = useMemo(
    () => (settings.activeCheckInExpiresAt ? settings.activeCheckInExpiresAt - now : 0),
    [settings.activeCheckInExpiresAt, now],
  );

  const onStart = async (ms: number) => {
    await startCheckIn(ms, labelDraft.trim() || null);
    Alert.alert(
      'Check-in started',
      `If you don't confirm by ${new Date(Date.now() + ms).toLocaleTimeString()}, HearMe will fire SOS after a 60s grace.`,
    );
    setLabelDraft('');
  };

  const onCancel = async () => {
    await cancelCheckIn();
  };

  return (
    <GradientBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn}>
            <MaterialCommunityIcons name="close" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Timer Check-in</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.sub}>
          Set a deadline. If you don&apos;t confirm you&apos;re safe before it expires
          (plus a 60-second grace), HearMe will SOS your trusted contacts.
        </Text>

        {active ? (
          <GlassCard variant="accent" style={styles.activeCard}>
            <LinearGradient
              colors={['rgba(167,139,250,0.2)', 'rgba(236,72,153,0.1)']}
              style={styles.activeGradient}
            >
              <MaterialCommunityIcons
                name="timer-sand"
                size={42}
                color={colors.accentViolet}
              />
              <Text style={styles.activeRemain}>{describeRemaining(remainingMs)}</Text>
              <Text style={styles.activeLabel}>
                {settings.activeCheckInLabel ?? 'Active check-in'}
              </Text>
              <Text style={styles.activeSub}>
                Expires at {new Date(settings.activeCheckInExpiresAt!).toLocaleTimeString()}
              </Text>
            </LinearGradient>
            <PrimaryButton
              title="I'm safe — cancel timer"
              variant="success"
              icon={<MaterialCommunityIcons name="check-circle-outline" size={20} color="#fff" />}
              onPress={() => void onCancel()}
              style={styles.cancelBtn}
            />
          </GlassCard>
        ) : (
          <>
            <Text style={styles.section}>Label (optional)</Text>
            <GlassCard style={styles.card}>
              <TextInput
                value={labelDraft}
                onChangeText={setLabelDraft}
                placeholder="e.g. Walking home from station"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                maxLength={60}
              />
            </GlassCard>

            <Text style={styles.section}>Pick a duration</Text>
            <View style={styles.presetGrid}>
              {PRESETS.map((p) => (
                <Pressable
                  key={p.label}
                  onPress={() => void onStart(p.ms)}
                  style={({ pressed }) => [styles.preset, pressed && { opacity: 0.85 }]}
                >
                  <LinearGradient
                    colors={['rgba(167,139,250,0.18)', 'rgba(56,189,248,0.12)']}
                    style={styles.presetGrad}
                  >
                    <MaterialCommunityIcons name="timer-outline" size={22} color={colors.accentViolet} />
                    <Text style={styles.presetTxt}>{p.label}</Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 22 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  sub: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 22,
  },
  section: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 6,
  },
  card: { padding: 14, marginBottom: 14 },
  input: {
    color: colors.text,
    fontSize: 15,
    paddingVertical: 6,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  preset: {
    width: '48%',
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  presetGrad: {
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  presetTxt: { color: colors.text, fontWeight: '800', fontSize: 16 },
  activeCard: { padding: 0, marginBottom: 16 },
  activeGradient: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  activeRemain: {
    color: colors.text,
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: 6,
  },
  activeLabel: { color: colors.text, fontWeight: '700', fontSize: 16 },
  activeSub: { color: colors.textMuted, fontSize: 13 },
  cancelBtn: { margin: 16, marginTop: 0 },
});
