import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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
import { colors, radii } from '../constants/theme';
import { DEMO_OTP } from '../lib/otp';
import { normalizeIndiaPhone } from '../lib/phone';
import * as Session from '../lib/session';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const route = await Session.resolveInitialRoute();
        if (!alive || route === '/login') return;
        router.replace(route);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const onSendOtp = async () => {
    setError(null);
    const normalized = normalizeIndiaPhone(phone);
    if (!normalized) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 900));
    await Session.setPhone(normalized);
    setLoading(false);
    router.replace('/verify-otp');
  };

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
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
          ]}
        >
          <View style={styles.hero}>
            <LinearGradient
              colors={['rgba(236,72,153,0.35)', 'rgba(167,139,250,0.2)']}
              style={styles.iconRing}
            >
              <MaterialCommunityIcons
                name="shield-lock-outline"
                size={44}
                color={colors.text}
              />
            </LinearGradient>
            <Text style={styles.title}>HearMe</Text>
            <Text style={styles.tagline}>
              Safety that starts with trust — sign in with your mobile number.
            </Text>
          </View>

          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>OTP login</Text>
            <Text style={styles.cardHint}>
              We’ll text a one-time password. For Expo Go testing, use code{' '}
              <Text style={styles.mono}>{DEMO_OTP}</Text>.
            </Text>

            <Text style={styles.label}>Mobile number</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.prefix}>+91</Text>
              <TextInput
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                style={styles.input}
                maxLength={10}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <PrimaryButton
              title="Send OTP"
              loading={loading}
              onPress={onSendOtp}
              style={styles.btn}
            />

            <Text style={styles.legal}>
              By continuing you agree that OTP and identity checks here are for
              demo UX only. Production builds must use licensed SMS and UIDAI
              flows.
            </Text>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 22, flexGrow: 1 },
  hero: { alignItems: 'center', marginBottom: 28 },
  iconRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 10,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 320,
  },
  card: { padding: 24 },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  cardHint: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    color: colors.accentViolet,
    fontWeight: '700',
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  prefix: {
    color: colors.textMuted,
    fontSize: 17,
    fontWeight: '600',
    marginRight: 6,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    paddingVertical: 14,
    letterSpacing: 1,
  },
  error: { color: colors.accentRose, marginBottom: 8, fontSize: 14 },
  btn: { marginTop: 12 },
  legal: {
    marginTop: 18,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    opacity: 0.9,
  },
});
