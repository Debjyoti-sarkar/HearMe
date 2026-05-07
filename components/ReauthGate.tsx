/**
 * Re-Auth Gate
 *
 * Full-screen overlay shown when the BBA model flags the active session as
 * unusual. The user must clear the gate by entering their PIN or passing a
 * biometric check before the app becomes interactive again.
 *
 * The component reads/writes the requireReauth state from HearMeProvider; it
 * does NOT change the lock or auth state — passing the gate just clears the
 * unusual-activity flag and resets the BBA monitor.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
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

import { GradientBackground } from './GradientBackground';
import { GlassCard } from './GlassCard';
import { radii } from '../constants/theme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { classifyPin } from '../lib/duress';
import { useTheme, type ThemeColors } from '../providers/ThemeProvider';
import * as Session from '../lib/session';

type Props = {
  reason: string;
  probability: number;
  onPassed: () => void;
};

export function ReauthGate({ reason, probability, onPassed }: Props) {
  const insets = useSafeAreaInsets();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const verifying = useRef(false);
  const triedBio = useRef(false);
  const inputRef = useRef<TextInput | null>(null);

  // Re-focus the PIN field — used after the biometric dialog dismisses, since
  // the system prompt steals focus and RN doesn't restore it on its own.
  const focusPin = useCallback(() => {
    // Defer one tick so it runs after the biometric modal fully closes.
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, []);

  useEffect(() => {
    (async () => {
      const [compatible, enrolled, enabled, storedPin] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        Session.isBiometricEnabled(),
        Session.getPin(),
      ]);
      setBioAvailable(compatible && enrolled && enabled);
      setHasPin(!!storedPin);

      // Soft warning haptic so the user notices the new screen.
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {
        /* ignore */
      }

      // No PIN ever set and no biometric — there's nothing to gate against.
      // Don't trap the user; let them through.
      if (!storedPin && !(compatible && enrolled && enabled)) {
        onPassed();
        return;
      }

      // Auto-prompt for biometrics if available — most users will clear the
      // gate with a thumb tap rather than typing a PIN. If the user cancels
      // or the prompt fails, return focus to the PIN input so they can type.
      if (compatible && enrolled && enabled && !triedBio.current) {
        triedBio.current = true;
        try {
          const r = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Verify it is you',
            fallbackLabel: 'Use PIN',
            cancelLabel: 'Cancel',
          });
          if (r.success) {
            onPassed();
            return;
          }
        } catch {
          /* ignore */
        }
        // Biometric was cancelled / failed — make sure the PIN field is the
        // active responder so the keyboard appears and typing registers.
        if (storedPin) focusPin();
      }
    })();
  }, [onPassed, focusPin]);

  const handleSubmit = useCallback(
    async (entered: string) => {
      if (verifying.current) return;
      verifying.current = true;
      setBusy(true);
      try {
        const normalPin = (await Session.getPin()) ?? '';
        if (!normalPin) {
          onPassed();
          return;
        }
        const kind = await classifyPin(entered, normalPin);
        if (kind === 'normal' || kind === 'duress') {
          // Duress is treated as success here — we don't want to reveal the
          // re-auth gate is also a duress trigger. The duress path handled by
          // the lock screen still applies on next app cold-start.
          try {
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
          } catch {
            /* ignore */
          }
          onPassed();
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
    [onPassed],
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
        promptMessage: 'Verify it is you',
        fallbackLabel: 'Use PIN',
        cancelLabel: 'Cancel',
      });
      if (r.success) {
        onPassed();
        return;
      }
    } catch {
      /* ignore */
    }
    // User dismissed biometric — they probably want to type instead.
    if (hasPin) focusPin();
  };

  const confidencePct = Math.round(Math.min(0.99, Math.max(0, probability)) * 100);

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.container, { paddingTop: insets.top + 32 }]}>
          <View style={styles.hero}>
            <LinearGradient
              colors={['rgba(251,191,36,0.45)', 'rgba(239,68,68,0.25)']}
              style={styles.iconRing}
            >
              <MaterialCommunityIcons
                name="shield-alert"
                size={42}
                color={tc.text}
              />
            </LinearGradient>
            <Text style={styles.title}>Unusual Activity</Text>
            <Text style={styles.sub}>
              Our on-device behaviour model flagged this session.
            </Text>
            <Text style={styles.reason}>{reason}</Text>
            <View style={styles.scoreRow}>
              <MaterialCommunityIcons
                name="brain"
                size={14}
                color={tc.warning}
              />
              <Text style={styles.scoreText}>
                BBA risk {confidencePct}%
              </Text>
            </View>
          </View>

          <GlassCard style={styles.card}>
            {hasPin ? (
              <>
                <Text style={styles.label}>Re-enter your PIN to continue</Text>
                {/* TextInput is invisible but overlays the dots row with real
                    dimensions — that's what makes the dots area tappable and
                    keeps the keyboard reachable even after the biometric
                    prompt steals focus. */}
                <View style={styles.pinDotsContainer}>
                  <View style={styles.dotsRow}>
                    {[0, 1, 2, 3].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          i < pin.length && styles.dotFilled,
                          !!error && styles.dotError,
                        ]}
                      />
                    ))}
                  </View>
                  <TextInput
                    ref={inputRef}
                    value={pin}
                    onChangeText={onChange}
                    keyboardType="number-pad"
                    maxLength={4}
                    autoFocus
                    secureTextEntry
                    caretHidden
                    editable={!busy}
                    style={styles.pinOverlayInput}
                  />
                </View>
                {error && <Text style={styles.error}>{error}</Text>}
              </>
            ) : (
              <Text style={styles.label}>
                Confirm with biometrics to continue.
              </Text>
            )}

            {bioAvailable && (
              <Pressable onPress={onBio} style={styles.bioBtn}>
                <MaterialCommunityIcons
                  name="fingerprint"
                  size={28}
                  color={tc.accentEmerald}
                />
                <Text style={styles.bioText}>
                  {hasPin ? 'Use biometric instead' : 'Verify with biometric'}
                </Text>
              </Pressable>
            )}
          </GlassCard>

          <Text style={styles.footnote}>
            This check happens automatically when interaction patterns differ
            sharply from your baseline. Nothing is sent off-device.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, paddingHorizontal: 22 },
    hero: { alignItems: 'center', marginBottom: 24 },
    iconRing: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.cardBorder,
      marginBottom: 14,
    },
    title: { fontSize: 26, fontWeight: '900', color: c.text },
    sub: {
      color: c.textMuted,
      marginTop: 6,
      fontSize: 13,
      textAlign: 'center',
    },
    reason: {
      color: c.warning,
      marginTop: 8,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
      paddingHorizontal: 12,
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(251,191,36,0.12)',
    },
    scoreText: { fontSize: 11, color: c.warning, fontWeight: '700' },
    card: { padding: 24, alignItems: 'center' },
    label: {
      color: c.textMuted,
      fontSize: 13,
      marginBottom: 14,
      textAlign: 'center',
    },
    pinDotsContainer: {
      position: 'relative',
      alignSelf: 'stretch',
      marginVertical: 8,
    },
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 18,
      paddingVertical: 12,
    },
    dot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.cardBorder,
    },
    dotFilled: { backgroundColor: c.accentViolet, borderColor: c.accentViolet },
    dotError: { borderColor: c.danger },
    pinOverlayInput: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0,
      fontSize: 1,
      color: 'transparent',
    },
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
    footnote: {
      color: c.textSecondary,
      fontSize: 11,
      textAlign: 'center',
      marginTop: 18,
      lineHeight: 16,
      paddingHorizontal: 12,
    },
  });
