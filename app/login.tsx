import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import { clearDemoAuth, enableDemoAuth } from '../lib/demo-auth';
import { useLanguage } from '../lib/i18n';
import { saveSettings, loadSettings } from '../lib/app-data';
import { DEMO_OTP } from '../lib/otp';
import { normalizeIndiaPhone } from '../lib/phone';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { useTheme, type ThemeColors } from '../providers/ThemeProvider';

WebBrowser.maybeCompleteAuthSession();

type UserType = 'new' | 'existing' | null;

/**
 * Pull the PKCE auth code (and any error) out of a redirect URL, regardless
 * of whether it lives in the query string or the fragment. PKCE-flow
 * Supabase puts ?code=... on the redirect, but some browsers preserve only
 * the fragment across an exp:// hand-off, so we accept both.
 */
function extractAuthCodeFromUrl(url: string): {
  code: string | null;
  error: string | null;
} {
  const [base, fragment = ''] = url.split('#');
  const parsed = Linking.parse(base);
  const fragmentParams = new URLSearchParams(fragment);

  const queryCode = parsed.queryParams?.code;
  const code =
    (typeof queryCode === 'string' ? queryCode : null) ??
    fragmentParams.get('code');

  const queryError = parsed.queryParams?.error_description ?? parsed.queryParams?.error;
  const error =
    (typeof queryError === 'string' ? queryError : null) ??
    fragmentParams.get('error_description') ??
    fragmentParams.get('error');

  return { code, error };
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { session, profileComplete } = useAuth();
  const { T } = useLanguage();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [userType, setUserType] = useState<UserType>(null);
  const [phone, setPhone] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [useDemoOtp, setUseDemoOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const settings = await loadSettings();
      if (!settings.onboardingComplete) {
        await saveSettings({ ...settings, onboardingComplete: true });
      }
    })();
  }, []);

  // Handle deep link return from Google OAuth (e.g. when app is cold-started
  // via redirect, or when the in-app browser hands off mid-flow).
  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const { code, error: oauthError } = extractAuthCodeFromUrl(event.url);
      if (oauthError) {
        if (__DEV__) console.log('[google-oauth] redirect error:', oauthError);
        return;
      }
      if (!code) return;
      if (__DEV__) console.log('[google-oauth] exchanging code…');
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        if (__DEV__) console.log('[google-oauth] exchange failed:', exchangeError.message);
        return;
      }
      await clearDemoAuth();
    };

    const subscription = Linking.addEventListener('url', handleUrl);

    // Also check the initial URL in case the app was opened from a cold start
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
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
      await clearDemoAuth();
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
      params: {
        phone: normalizedPhone,
        mode: useDemoOtp ? 'demo' : 'real',
        userType: userType ?? 'existing',
      },
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
    const redirectTo = makeRedirectUri({ path: 'login' });
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[google-oauth] redirectTo =', redirectTo);
    }
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[google-oauth] supabase auth url =', data?.url);
    }
    if (oauthError || !data?.url) {
      setGoogleLoading(false);
      setError(oauthError?.message ?? 'Could not start Google login.');
      return;
    }
    try {
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('[google-oauth] returned url =', result.url);
        }
        const { code, error: oauthError } = extractAuthCodeFromUrl(result.url);
        if (oauthError) {
          setGoogleLoading(false);
          setError(`Google: ${oauthError}`);
          return;
        }
        if (!code) {
          setGoogleLoading(false);
          setError('Google login succeeded but no auth code was returned. Please try again.');
          return;
        }
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        setGoogleLoading(false);
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
        await clearDemoAuth();
        // Navigation is handled by the session useEffect listener
        return;
      }
      setGoogleLoading(false);
      if (result.type === 'dismiss' || result.type === 'cancel') {
        // User dismissed — no error needed
        return;
      }
      setError('Google login was cancelled.');
    } catch (e: any) {
      setGoogleLoading(false);
      setError(e?.message ?? 'An error occurred during Google login.');
    }
  };

  // If user type is not selected, show the selection screen
  if (!userType) {
    return (
      <GradientBackground>
        <ScrollView
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
            <Text style={styles.brandName}>{T('appName')}</Text>
            <Text style={styles.tagline}>{T('yourSafetyGuardian')}</Text>
          </View>

          <GlassCard variant="elevated" style={styles.card}>
            <Text style={styles.cardTitle}>{T('welcomeBack')}</Text>
            <Text style={styles.cardHint}>{T('signInContinue')}</Text>

            {/* New User Option */}
            <Pressable
              onPress={() => setUserType('new')}
              style={({ pressed }) => [styles.userTypeCard, pressed && { opacity: 0.8 }]}
            >
              <LinearGradient
                colors={['rgba(167,139,250,0.2)', 'rgba(236,72,153,0.15)']}
                style={styles.userTypeGradient}
              >
                <View style={styles.userTypeIcon}>
                  <MaterialCommunityIcons name="account-plus" size={32} color={tc.accentViolet} />
                </View>
                <View style={styles.userTypeInfo}>
                  <Text style={styles.userTypeTitle}>{T('newUser')}</Text>
                  <Text style={styles.userTypeDesc}>{T('newUserDesc')}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color={tc.textMuted} />
              </LinearGradient>
            </Pressable>

            {/* Existing User Option */}
            <Pressable
              onPress={() => setUserType('existing')}
              style={({ pressed }) => [styles.userTypeCard, pressed && { opacity: 0.8 }]}
            >
              <LinearGradient
                colors={['rgba(52,211,153,0.2)', 'rgba(56,189,248,0.15)']}
                style={styles.userTypeGradient}
              >
                <View style={styles.userTypeIcon}>
                  <MaterialCommunityIcons name="account-check" size={32} color={tc.accentEmerald} />
                </View>
                <View style={styles.userTypeInfo}>
                  <Text style={styles.userTypeTitle}>{T('existingUser')}</Text>
                  <Text style={styles.userTypeDesc}>{T('existingUserDesc')}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color={tc.textMuted} />
              </LinearGradient>
            </Pressable>
          </GlassCard>

          {/* Change Language */}
          <Pressable
            onPress={() => router.push('/language')}
            style={styles.changeLangBtn}
          >
            <MaterialCommunityIcons name="translate" size={18} color={tc.accentViolet} />
            <Text style={styles.changeLangText}>{T('chooseLanguage')}</Text>
          </Pressable>
        </ScrollView>
      </GradientBackground>
    );
  }

  // Login form (phone OTP + Google)
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
          {/* Back button */}
          <Pressable
            onPress={() => setUserType(null)}
            style={styles.backRow}
            hitSlop={12}
          >
            <MaterialCommunityIcons name="chevron-left" size={28} color={tc.text} />
            <Text style={styles.backText}>{T('back')}</Text>
          </Pressable>

          <View style={styles.hero}>
            <LinearGradient
              colors={userType === 'new' ? ['#7c3aed', '#a78bfa'] : ['#059669', '#34d399']}
              style={styles.logoCircleSmall}
            >
              <MaterialCommunityIcons
                name={userType === 'new' ? 'account-plus' : 'account-check'}
                size={36}
                color="#fff"
              />
            </LinearGradient>
            <Text style={styles.brandNameSmall}>
              {userType === 'new' ? T('newUser') : T('existingUser')}
            </Text>
          </View>

          <GlassCard variant="elevated" style={styles.card}>
            <Text style={styles.cardTitle}>{T('signInContinue')}</Text>

            {/* Demo mode toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleLabel}>
                <MaterialCommunityIcons name="test-tube" size={16} color={tc.accentViolet} />
                <Text style={styles.toggleText}>{T('demoMode')}</Text>
              </View>
              <Switch
                value={useDemoOtp}
                onValueChange={setUseDemoOtp}
                trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(167,139,250,0.5)' }}
                thumbColor={useDemoOtp ? tc.accentPink : '#64748b'}
              />
            </View>

            {!isSupabaseConfigured && !useDemoOtp && (
              <View style={styles.warningBox}>
                <MaterialCommunityIcons name="alert-outline" size={16} color={tc.warning} />
                <Text style={styles.warningText}>
                  Supabase not configured. Enable demo mode or add environment variables.
                </Text>
              </View>
            )}

            <Text style={styles.label}>{T('phoneNumber')}</Text>
            <View style={styles.phoneWrap}>
              <View style={styles.prefixBox}>
                <Text style={styles.prefixText}>+91</Text>
              </View>
              <TextInput
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
                placeholderTextColor={tc.textSecondary}
                keyboardType="phone-pad"
                style={styles.phoneInput}
              />
            </View>

            {error && (
              <View style={styles.errorBox}>
                <MaterialCommunityIcons name="alert-circle" size={16} color={tc.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            {info && (
              <View style={styles.infoBox}>
                <MaterialCommunityIcons name="check-circle" size={16} color={tc.success} />
                <Text style={styles.infoText}>{info}</Text>
              </View>
            )}

            <PrimaryButton
              title={T('sendOtp')}
              loading={otpLoading}
              onPress={onSendOtp}
              icon={<MaterialCommunityIcons name="message-text-lock" size={20} color="#fff" />}
              style={styles.btn}
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{T('or')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={onGoogleLogin}
              disabled={googleLoading}
              style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.8 }]}
            >
              <MaterialCommunityIcons name="google" size={20} color={tc.text} />
              <Text style={styles.googleBtnText}>
                {googleLoading ? 'Opening...' : T('continueWithGoogle')}
              </Text>
            </Pressable>

            {__DEV__ && (
              <Pressable
                onPress={() =>
                  void (async () => {
                    await enableDemoAuth();
                    router.replace('/(main)');
                  })()
                }
                style={({ pressed }) => [styles.devSkipBtn, pressed && { opacity: 0.7 }]}
              >
                <MaterialCommunityIcons
                  name="rocket-launch-outline"
                  size={16}
                  color={tc.warning}
                />
                <Text style={styles.devSkipText}>Skip login (dev)</Text>
              </Pressable>
            )}

            <Text style={styles.legal}>{T('legalText')}</Text>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 22, flexGrow: 1 },
  hero: { alignItems: 'center', marginBottom: 24 },
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
  logoCircleSmall: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  brandName: {
    fontSize: 38,
    fontWeight: '900',
    color: c.text,
    letterSpacing: -1,
  },
  brandNameSmall: {
    fontSize: 24,
    fontWeight: '900',
    color: c.text,
  },
  tagline: {
    marginTop: 10,
    textAlign: 'center',
    color: c.textMuted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 300,
  },
  card: { padding: 24 },
  cardTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: c.text,
    marginBottom: 6,
  },
  cardHint: {
    color: c.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  // User type selection cards
  userTypeCard: {
    marginBottom: 14,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  userTypeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  userTypeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  userTypeInfo: { flex: 1 },
  userTypeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: c.text,
    marginBottom: 3,
  },
  userTypeDesc: {
    fontSize: 13,
    color: c.textMuted,
    fontWeight: '500',
  },
  changeLangBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
  },
  changeLangText: {
    color: c.accentViolet,
    fontSize: 14,
    fontWeight: '700',
  },
  // Login form styles
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginLeft: 4,
  },
  backText: { color: c.text, fontSize: 16, fontWeight: '600' },
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
  toggleText: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
  warningBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(251,191,36,0.08)',
    padding: 12,
    borderRadius: radii.sm,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  warningText: { flex: 1, color: c.warning, fontSize: 13, lineHeight: 18 },
  label: {
    color: c.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  phoneWrap: {
    flexDirection: 'row',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.inputBorder,
    backgroundColor: c.inputBg,
    marginBottom: 12,
    overflow: 'hidden',
  },
  prefixBox: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: c.inputBorder,
  },
  prefixText: {
    color: c.accentViolet,
    fontSize: 16,
    fontWeight: '800',
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: c.text,
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
  errorText: { flex: 1, color: c.danger, fontSize: 13, lineHeight: 18 },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, color: c.success, fontSize: 13, lineHeight: 18 },
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
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: c.cardBorder,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  googleBtnText: { color: c.text, fontWeight: '700', fontSize: 15 },
  devSkipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(251,191,36,0.4)',
    backgroundColor: 'rgba(251,191,36,0.06)',
  },
  devSkipText: {
    color: c.warning,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  legal: {
    marginTop: 20,
    fontSize: 11,
    lineHeight: 16,
    color: c.textSecondary,
    textAlign: 'center',
  },
});
