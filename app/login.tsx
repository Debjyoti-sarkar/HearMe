import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Switch,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientBackground } from '../components/GradientBackground';
import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, radii } from '../constants/theme';
import { isDemoAuthenticated } from '../lib/demo-auth';
import { DEMO_OTP } from '../lib/otp';
import { normalizeIndiaPhone } from '../lib/phone';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { session, profileComplete } = useAuth();
  const [phone, setPhone] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [useDemoOtp, setUseDemoOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const demo = await isDemoAuthenticated();
      if (!mounted) return;
      if (demo) {
        router.replace('/(main)');
        return;
      }
      if (!session) return;
      router.replace(profileComplete ? '/(main)' : '/profile');
    })();
    return () => {
      mounted = false;
    };
  }, [session, profileComplete]);

  const onSendOtp = async () => {
    if (!useDemoOtp && !isSupabaseConfigured) {
      setError('Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY, then restart Expo.');
      return;
    }
    setError(null);
    setInfo(null);
    const normalizedPhone = normalizeIndiaPhone(phone);
    if (!normalizedPhone) {
      setError('Enter a valid phone number (Indian format).');
      return;
    }
    if (!useDemoOtp) {
      setOtpLoading(true);
      const { error: sendError } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: { shouldCreateUser: true },
      });
      setOtpLoading(false);
      if (sendError) {
        setError(sendError.message);
        return;
      }
    }
    setInfo(
      useDemoOtp
        ? `Demo OTP mode enabled. Use ${DEMO_OTP} on the next screen.`
        : 'OTP sent to your phone. Enter the code on the next screen.',
    );
    router.push({
      pathname: '/verify-otp',
      params: { phone: normalizedPhone, mode: useDemoOtp ? 'demo' : 'real' },
    });
  };

  const onGoogleLogin = async () => {
    if (!isSupabaseConfigured) {
      setError('Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY, then restart Expo.');
      return;
    }
    setError(null);
    setInfo(null);
    setGoogleLoading(true);
    const redirectTo = Linking.createURL('/');
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (oauthError || !data?.url) {
      setGoogleLoading(false);
      setError(oauthError?.message ?? 'Could not start Google login.');
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    setGoogleLoading(false);
    if (result.type !== 'success' && result.type !== 'dismiss') {
      setError('Google login was cancelled.');
    }
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={styles.flex}
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
              Secure your safety profile with Supabase authentication.
            </Text>
          </View>

          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>Sign in</Text>
            <Text style={styles.cardHint}>
              Login with phone OTP or continue with Google.
            </Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleText}>Use demo OTP for testing</Text>
              <Switch
                value={useDemoOtp}
                onValueChange={setUseDemoOtp}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(167,139,250,0.55)' }}
                thumbColor={useDemoOtp ? colors.accentPink : '#94a3b8'}
              />
            </View>
            {!isSupabaseConfigured && !useDemoOtp ? (
              <Text style={styles.error}>
                Supabase env vars are missing. Add `EXPO_PUBLIC_SUPABASE_URL` and
                `EXPO_PUBLIC_SUPABASE_KEY` in your Expo env, then restart.
              </Text>
            ) : null}

            <Text style={styles.label}>Phone number</Text>
            <View style={styles.phoneInputWrap}>
              <Text style={styles.phonePrefix}>+91</Text>
              <TextInput
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                style={styles.phoneInput}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}

            <PrimaryButton
              title="Send OTP"
              loading={otpLoading}
              onPress={onSendOtp}
              style={styles.btn}
            />
            <Pressable onPress={onGoogleLogin} style={styles.googleBtn} disabled={googleLoading}>
              <Text style={styles.googleBtnText}>
                {googleLoading ? 'Opening Google...' : 'Continue with Google'}
              </Text>
            </Pressable>

            <Text style={styles.legal}>
              Supabase session is persisted securely on this device for auto-login.
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  toggleText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '600',
  },
  phoneInputWrap: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  phonePrefix: {
    color: colors.textMuted,
    marginRight: 8,
    fontSize: 16,
    fontWeight: '700',
  },
  phoneInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
  },
  error: { color: colors.accentRose, marginBottom: 8, fontSize: 14 },
  info: { color: colors.accentViolet, marginBottom: 8, fontSize: 14 },
  btn: { marginTop: 12 },
  googleBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  googleBtnText: { color: colors.text, fontWeight: '700' },
  legal: {
    marginTop: 18,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    opacity: 0.9,
  },
});
