import type { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
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
import { digitsOnly, formatAadhaarDigits, isPlausibleAadhaar12 } from '../lib/aadhaar';
import { useLanguage } from '../lib/i18n';
import * as Session from '../lib/session';

export default function AadhaarScreen() {
  const insets = useSafeAreaInsets();
  const { T } = useLanguage();
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const display = formatAadhaarDigits(raw);

  const onChange = (t: string) => {
    setRaw(digitsOnly(t));
    setError(null);
  };

  const onVerify = async () => {
    const d12 = digitsOnly(raw);
    if (!isPlausibleAadhaar12(d12)) {
      setError(
        'Enter a plausible 12-digit Aadhaar (first digit 2-9). This demo does not call UIDAI.',
      );
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    const last4 = d12.slice(-4);
    await Session.markAadhaarVerified(last4);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      /* Expo Go may ignore */
    }
    setLoading(false);
    // After Aadhaar verification, go to PIN/biometric setup
    router.replace('/setup-pin');
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
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
          ]}
        >
          <View style={styles.hero}>
            <LinearGradient
              colors={['rgba(52,211,153,0.35)', 'rgba(167,139,250,0.25)']}
              style={styles.iconRing}
            >
              <MaterialCommunityIcons
                name="card-account-details-star-outline"
                size={40}
                color={colors.text}
              />
            </LinearGradient>
            <Text style={styles.title}>{T('verifyAadhaar')}</Text>
            <Text style={styles.sub}>{T('aadhaarDesc')}</Text>
          </View>

          <GlassCard style={styles.card}>
            <Text style={styles.label}>{T('aadhaarNumber')}</Text>
            <TextInput
              value={display}
              onChangeText={onChange}
              placeholder={T('aadhaarPlaceholder')}
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={styles.input}
              maxLength={14}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.bullets}>
              <Row icon="lock-check-outline" text={T('dataOnDevice')} />
              <Row icon="shield-alert-outline" text={T('neverShareOtp')} />
            </View>

            <PrimaryButton
              title={T('verifyFinish')}
              loading={loading}
              disabled={digitsOnly(raw).length !== 12}
              onPress={onVerify}
              style={styles.btn}
            />
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function Row({ icon, text }: { icon: MciName; text: string }) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.accentViolet} />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderColor: colors.cardBorder,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  sub: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 340,
  },
  card: { padding: 24 },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    letterSpacing: 2,
    color: colors.text,
    fontWeight: '600',
  },
  error: { color: colors.accentRose, marginTop: 10, fontSize: 14 },
  bullets: { marginTop: 18, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  btn: { marginTop: 22 },
});
