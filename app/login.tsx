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
import { saveSettings, loadSettings } from '../lib/app-data';
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
    // Mark onboarding as complete when user reaches login
    void (async () => {
      const settings = await loadSettings();
      if (!settings.onboardingComplete) {
        await saveSettings({ ...settings, onboardingComplete: true });
      }
    })();
  }, []);

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
      <KeyboardAvoidingView style={styles.flex}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
          ]}
        >
          <View style={styles.hero}>
            <LinearGradient
              colors={['#7c3aed', '#a78bfa']}
              style={styles.logoCircle}
            >
              <MaterialCommunityIcons name="shield-check" size={48} color="#fff" />
            </LinearGradient>
            <Text style={styles.brandName}>HearMe</Text>
            <Text style={styles.tagline}>
              Your personal safety guardian — always watching, always ready.
            </Text>
          </View>

          <GlassCard variant="elevated" style={styles.card}>
            <Text style={styles.cardTitle}>Welcome Back</Text>
            <Text style={styles.cardHint}>
              Sign in with your phone number to continue
            </Text>

            <View style={styles.toggleRow}>
              <View style={styles.toggleLabel}>
                <MaterialCommunityIcons name="test-tube" size={16} color={colors.accentViolet} />
                <Text style={styles.toggleText}>Demo mode (testing)</Text>
              </View>
              <Switch
                value={useDemoOtp}
                onValueChange={setUseDemoOtp}
                trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(167,139,250,0.5)' }}
                thumbColor={useDemoOtp ? colors.accentPink : '#64748b'}
              />
            </View>

            {!isSupabaseConfigured && !useDemoOtp && (
              <View style={styles.warningBox}>
                <MaterialCommunityIcons name="alert-outline" size={16} color={colors.warning} />
                <Text style={styles.warningText}>
                  Supabase not configured. Enable demo mode or add environment variables.
                </Text>
              </View>
            )}

            <Text style={styles.label}>PHONE NUMBER</Text>
            <View style={styles.phoneWrap}>
              <View style={styles.prefixBox}>
                <Text style={styles.prefixText}>+91</Text>
              </View>
              <TextInput
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
                style={styles.phoneInput}
              />
            </View>

            {error && (
              <View style={styles.errorBox}>
                <MaterialCommunityIcons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            {info && (
              <View style={styles.infoBox}>
                <MaterialCommunityIcons name="check-circle" size={16} color={colors.success} />
                <Text style={styles.infoText}>{info}</Text>
              </View>
            )}

            <PrimaryButton
              title="Send OTP"
              loading={otpLoading}
              onPress={onSendOtp}
              icon={<MaterialCommunityIcons name="message-text-lock" size={20} color="#fff" />}
              style={styles.btn}
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={onGoogleLogin}
              disabled={googleLoading}
              style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.8 }]}
            >
              <MaterialCommunityIcons name="google" size={20} color={colors.text} />
              <Text style={styles.googleBtnText}>
                {googleLoading ? 'Opening...' : 'Continue with Google'}
              </Text>
            </Pressable>

            <Text style={styles.legal}>
              By continuing, you agree to our terms of service. Your session is stored securely on this device.
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
  hero: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  brandName: {
    fontSize: 38,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -1,
  },
  tagline: {
    marginTop: 10,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 300,
  },
  card: { padding: 24 },
  cardTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 6,
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
    backgroundColor: 'rgba(167,139,250,0.06)',
    borderRadius: radii.sm,
    padding: 12,
    marginBottom: 16,
  },
  toggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  warningBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(251,191,36,0.08)',
    padding: 12,
    borderRadius: radii.sm,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  warningText: { flex: 1, color: colors.warning, fontSize: 13, lineHeight: 18 },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  phoneWrap: {
    flexDirection: 'row',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    marginBottom: 12,
    overflow: 'hidden',
  },
  prefixBox: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.inputBorder,
  },
  prefixText: {
    color: colors.accentViolet,
    fontSize: 16,
    fontWeight: '800',
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 1,
  },
  errorBox: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  errorText: { flex: 1, color: colors.danger, fontSize: 13, lineHeight: 18 },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, color: colors.success, fontSize: 13, lineHeight: 18 },
  btn: { marginTop: 8 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dividerText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  googleBtnText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  legal: {
    marginTop: 20,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
