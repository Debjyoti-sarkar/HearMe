import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { colors } from '../constants/theme';
import { enableDemoAuth } from '../lib/demo-auth';
import { useLanguage } from '../lib/i18n';
import { DEMO_OTP, verifyDemoOtp } from '../lib/otp';
import { maskPhone } from '../lib/phone';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import * as Session from '../lib/session';
import { useAuth } from '../providers/AuthProvider';

export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { T } = useLanguage();
  const params = useLocalSearchParams<{ phone?: string; mode?: string; userType?: string }>();
  const phone = useMemo(() => `${params.phone ?? ''}`.trim(), [params.phone]);
  const mode = useMemo(() => `${params.mode ?? 'real'}`.toLowerCase(), [params.mode]);
  const userType = useMemo(() => (params.userType === 'new' ? 'new' : 'existing'), [params.userType]);
  const isDemoMode = mode === 'demo';
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigateAfterVerify = async () => {
    // Save user type
    await Session.setUserType(userType);

    if (userType === 'new') {
      // New users go to Aadhaar verification
      router.replace('/aadhaar');
    } else {
      // Existing users go to PIN/biometric setup
      router.replace('/setup-pin');
    }
  };

  const onVerify = async () => {
    if (!isDemoMode && !isSupabaseConfigured) {
      setError('Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY.');
      return;
    }
    if (!phone) {
      setError('Phone number is missing. Go back and request OTP again.');
      return;
    }
    setError(null);
    if (otp.trim().length < 6) {
      setError('Enter the 6-digit OTP code.');
      return;
    }

    if (isDemoMode) {
      if (!verifyDemoOtp(otp)) {
        setError(`Invalid demo OTP. Use ${DEMO_OTP}.`);
        return;
      }
      await enableDemoAuth();
      await navigateAfterVerify();
      return;
    }

    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: otp.trim(),
      type: 'sms',
    });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    await navigateAfterVerify();
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
            onPress={() => router.replace('/login')}
            style={[styles.backRow, { marginLeft: 4 }]}
            hitSlop={12}
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={28}
              color={colors.text}
            />
            <Text style={styles.backText}>{T('backToLogin')}</Text>
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
            <Text style={styles.title}>{T('enterOtp')}</Text>
            <Text style={styles.sub}>
              {T('codeSentTo')} <Text style={styles.bold}>{phone ? maskPhone(phone) : 'your phone'}</Text>
            </Text>
          </View>

          <GlassCard style={styles.card}>
            <Text style={styles.label}>{T('sixDigitCode')}</Text>
            <OtpInputRow value={otp} onChange={setOtp} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton
              title={T('verifyContinue')}
              loading={loading}
              disabled={otp.length < 6}
              onPress={onVerify}
              style={styles.btn}
            />
            <Text style={styles.hint}>
              {isDemoMode
                ? `Demo mode is ON. Use OTP ${DEMO_OTP}.`
                : 'Use the SMS code from your phone. You can also use Google sign-in from the login screen.'}
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
