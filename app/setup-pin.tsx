import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientBackground } from '../components/GradientBackground';
import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { radii } from '../constants/theme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useLanguage } from '../lib/i18n';
import * as Session from '../lib/session';
import { useTheme, type ThemeColors } from '../providers/ThemeProvider';

export default function SetupPinScreen() {
  const insets = useSafeAreaInsets();
  const { T } = useLanguage();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    (async () => {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(compatible && enrolled);
      } catch {
        setBiometricAvailable(false);
      }
    })();
  }, []);

  const onPinChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    setError(null);
    if (step === 'enter') {
      setPin(digits);
      if (digits.length === 4) {
        setTimeout(() => {
          setStep('confirm');
          // Re-focus the input for the confirm step
          setTimeout(() => inputRef.current?.focus(), 100);
        }, 200);
      }
    } else {
      setConfirmPin(digits);
    }
  };

  const onSetPin = async () => {
    if (pin !== confirmPin) {
      setError(T('pinMismatch'));
      setConfirmPin('');
      return;
    }
    setLoading(true);
    await Session.savePin(pin);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { /* ignore */ }
    setLoading(false);
    router.replace('/(main)');
  };

  const onBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: T('useBiometric'),
        fallbackLabel: T('enterPin'),
        disableDeviceFallback: false,
      });
      if (result.success) {
        await Session.saveBiometricEnabled(true);
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch { /* ignore */ }
        router.replace('/(main)');
      }
    } catch {
      Alert.alert(T('error'), 'Biometric authentication failed.');
    }
  };

  const onSkip = () => {
    router.replace('/(main)');
  };

  const currentValue = step === 'enter' ? pin : confirmPin;

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
          ]}
        >
          <View style={styles.hero}>
            <LinearGradient
              colors={['rgba(167,139,250,0.35)', 'rgba(52,211,153,0.25)']}
              style={styles.iconRing}
            >
              <MaterialCommunityIcons
                name="lock-check-outline"
                size={40}
                color={tc.text}
              />
            </LinearGradient>
            <Text style={styles.title}>{T('setupPin')}</Text>
            <Text style={styles.sub}>{T('setupPinDesc')}</Text>
          </View>

          <GlassCard style={styles.card}>
            {/* PIN Entry */}
            <Text style={styles.label}>
              {step === 'enter' ? T('enterPin') : T('confirmPin')}
            </Text>

            {/* PIN dots with invisible TextInput overlay */}
            <View style={styles.pinDotsContainer}>
              <View style={styles.pinDotsRow}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.pinDot,
                      i < currentValue.length && styles.pinDotFilled,
                    ]}
                  />
                ))}
              </View>
              <TextInput
                ref={inputRef}
                value={currentValue}
                onChangeText={onPinChange}
                keyboardType="number-pad"
                maxLength={4}
                style={styles.pinOverlayInput}
                autoFocus
                secureTextEntry
                caretHidden
              />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            {step === 'confirm' && (
              <>
                <PrimaryButton
                  title={T('setPin')}
                  loading={loading}
                  disabled={confirmPin.length < 4}
                  onPress={onSetPin}
                  style={styles.btn}
                />
                <Pressable
                  onPress={() => {
                    setStep('enter');
                    setPin('');
                    setConfirmPin('');
                    setError(null);
                  }}
                  style={styles.resetBtn}
                >
                  <Text style={styles.resetText}>{T('back')}</Text>
                </Pressable>
              </>
            )}

            {/* Biometric Option */}
            {biometricAvailable && (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{T('or')}</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Pressable
                  onPress={onBiometric}
                  style={({ pressed }) => [styles.biometricBtn, pressed && { opacity: 0.8 }]}
                >
                  <LinearGradient
                    colors={['rgba(52,211,153,0.15)', 'rgba(56,189,248,0.1)']}
                    style={styles.biometricGradient}
                  >
                    <MaterialCommunityIcons name="fingerprint" size={32} color={tc.accentEmerald} />
                    <View style={styles.biometricInfo}>
                      <Text style={styles.biometricTitle}>{T('useBiometric')}</Text>
                      <Text style={styles.biometricDesc}>{T('biometricDesc')}</Text>
                    </View>
                  </LinearGradient>
                </Pressable>
              </>
            )}

            {/* Skip */}
            <Pressable onPress={onSkip} style={styles.skipBtn}>
              <Text style={styles.skipText}>{T('skipForNow')}</Text>
            </Pressable>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 22, flexGrow: 1 },
  hero: { alignItems: 'center', marginBottom: 22 },
  iconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: c.cardBorder,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: c.text,
  },
  sub: {
    marginTop: 10,
    color: c.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
  },
  card: { padding: 24 },
  label: {
    color: c.textMuted,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  pinDotsContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  pinDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 12,
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: c.cardBorder,
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: c.accentViolet,
    borderColor: c.accentViolet,
  },
  pinOverlayInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    fontSize: 1,
  },
  error: {
    color: c.accentRose,
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  btn: { marginTop: 20 },
  resetBtn: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  resetText: {
    color: c.accentViolet,
    fontWeight: '700',
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dividerText: {
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  biometricBtn: {
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  biometricGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 14,
  },
  biometricInfo: { flex: 1 },
  biometricTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: c.text,
    marginBottom: 2,
  },
  biometricDesc: {
    fontSize: 12,
    color: c.textMuted,
    lineHeight: 16,
  },
  skipBtn: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 12,
  },
  skipText: {
    color: c.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
