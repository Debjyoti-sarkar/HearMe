import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../components/GradientBackground';
import { GlassCard } from '../components/GlassCard';
import { radii } from '../constants/theme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { classifyPin } from '../lib/duress';
import { useHearMe } from '../providers/HearMeProvider';
import { useTheme, type ThemeColors } from '../providers/ThemeProvider';
import * as Session from '../lib/session';

export default function LockScreen() {
  const insets = useSafeAreaInsets();
  const { settings, executeSos, unlock } = useHearMe();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const verifying = useRef(false);

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const enabled = await Session.isBiometricEnabled();
      setBioAvailable(compatible && enrolled && enabled);
    })();
  }, []);

  const finishNormal = useCallback(() => {
    unlock();
    router.replace('/(main)');
  }, [unlock]);

  const finishDuress = useCallback(async () => {
    // Silent SOS — no alert, no sound, no haptic.
    void executeSos();
    // Navigate to disguise FIRST, then unlock. Avoids any frame where the real
    // app could render under the attacker's eye.
    router.replace('/disguise');
    setTimeout(() => unlock(), 50);
  }, [executeSos, unlock]);

  const handleSubmit = useCallback(
    async (entered: string) => {
      if (verifying.current) return;
      verifying.current = true;
      setBusy(true);
      try {
        const normalPin = (await Session.getPin()) ?? '';
        if (!normalPin) {
          // No PIN ever set — just let them through.
          finishNormal();
          return;
        }
        const kind = await classifyPin(entered, normalPin);
        if (kind === 'normal') {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            /* ignore */
          }
          finishNormal();
          return;
        }
        if (kind === 'duress' && settings.duressEnabled) {
          // Mimic a normal success animation; do not reveal anything.
          await finishDuress();
          return;
        }
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch {
          /* ignore */
        }
        setError('Incorrect PIN');
        setPin('');
      } finally {
        verifying.current = false;
        setBusy(false);
      }
    },
    [finishDuress, finishNormal, settings.duressEnabled],
  );

  const onChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    setError(null);
    setPin(digits);
    if (digits.length === 4) {
      void handleSubmit(digits);
    }
  };

  const onBio = async () => {
    try {
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock HearMe',
        fallbackLabel: 'Use PIN',
      });
      if (r.success) finishNormal();
    } catch {
      /* ignore */
    }
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
          <View style={styles.hero}>
            <LinearGradient
              colors={['rgba(167,139,250,0.4)', 'rgba(236,72,153,0.25)']}
              style={styles.iconRing}
            >
              <MaterialCommunityIcons name="shield-lock-outline" size={42} color={tc.text} />
            </LinearGradient>
            <Text style={styles.title}>HearMe</Text>
            <Text style={styles.sub}>Enter your PIN to unlock</Text>
          </View>

          <GlassCard style={styles.card}>
            <View style={styles.dotsRow}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[styles.dot, i < pin.length && styles.dotFilled, !!error && styles.dotError]}
                />
              ))}
            </View>
            <TextInput
              value={pin}
              onChangeText={onChange}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
              secureTextEntry
              editable={!busy}
              style={styles.hiddenInput}
            />
            {error && <Text style={styles.error}>{error}</Text>}

            {bioAvailable && (
              <Pressable onPress={onBio} style={styles.bioBtn}>
                <MaterialCommunityIcons name="fingerprint" size={28} color={tc.accentEmerald} />
                <Text style={styles.bioText}>Use biometric</Text>
              </Pressable>
            )}
          </GlassCard>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 22 },
  hero: { alignItems: 'center', marginBottom: 28 },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.cardBorder,
    marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: '900', color: c.text },
  sub: { color: c.textMuted, marginTop: 6, fontSize: 14 },
  card: { padding: 28, alignItems: 'center' },
  dotsRow: { flexDirection: 'row', gap: 18, marginVertical: 8 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: c.cardBorder,
  },
  dotFilled: { backgroundColor: c.accentViolet, borderColor: c.accentViolet },
  dotError: { borderColor: c.danger },
  hiddenInput: { position: 'absolute', opacity: 0, height: 0, width: 0 },
  error: { color: c.accentRose, marginTop: 14, fontSize: 14 },
  bioBtn: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.3)',
    backgroundColor: 'rgba(52,211,153,0.1)',
  },
  bioText: { color: c.accentEmerald, fontWeight: '700', fontSize: 14 },
});
