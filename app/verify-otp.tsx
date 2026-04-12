import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientBackground } from '../components/GradientBackground';
import { GlassCard } from '../components/GlassCard';
import { OtpInputRow } from '../components/OtpInputRow';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, radii } from '../constants/theme';
import { DEMO_OTP, verifyDemoOtp } from '../lib/otp';
import { maskPhone } from '../lib/phone';
import * as Session from '../lib/session';

export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets();
  const [masked, setMasked] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const p = await Session.getPhone();
      if (!p) {
        router.replace('/login');
        return;
      }
      setMasked(maskPhone(p));
    })();
  }, []);

  const onVerify = async () => {
    setError(null);
    if (!verifyDemoOtp(otp)) {
      setError(`Invalid OTP. Testing code is ${DEMO_OTP}.`);
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    await Session.markOtpVerified();
    setLoading(false);
    router.replace('/aadhaar');
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
            { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
          ]}
        >
          <Pressable
            onPress={async () => {
              await Session.clearSession();
              router.replace('/login');
            }}
            style={[styles.backRow, { marginLeft: 4 }]}
            hitSlop={12}
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={28}
              color={colors.text}
            />
            <Text style={styles.backText}>Edit number</Text>
          </Pressable>

          <View style={styles.hero}>
            <LinearGradient
              colors={['rgba(167,139,250,0.35)', 'rgba(236,72,153,0.2)']}
              style={styles.iconRing}
            >
              <MaterialCommunityIcons
                name="message-text-lock-outline"
                size={40}
                color={colors.text}
              />
            </LinearGradient>
            <Text style={styles.title}>Enter OTP</Text>
            <Text style={styles.sub}>
              Code sent to <Text style={styles.bold}>{masked || 'your number'}</Text>
            </Text>
          </View>

          <GlassCard style={styles.card}>
            <Text style={styles.label}>6-digit code</Text>
            <OtpInputRow value={otp} onChange={setOtp} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton
              title="Verify & continue"
              loading={loading}
              disabled={otp.length < 6}
              onPress={onVerify}
              style={styles.btn}
            />
            <Text style={styles.hint}>
              Resend and true SMS integration can be wired to Twilio / MSG91 /
              Firebase Auth — this screen is ready for that swap.
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
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  hero: { alignItems: 'center', marginBottom: 22 },
  iconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  sub: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  bold: { color: colors.text, fontWeight: '700' },
  card: { padding: 24 },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 12,
    fontWeight: '600',
  },
  error: { color: colors.accentRose, marginTop: 12, fontSize: 14 },
  btn: { marginTop: 20 },
  hint: {
    marginTop: 16,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
  },
});
