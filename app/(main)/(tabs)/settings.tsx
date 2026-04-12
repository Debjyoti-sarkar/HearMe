import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../../components/GradientBackground';
import { GlassCard } from '../../../components/GlassCard';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { colors, radii } from '../../../constants/theme';
import * as Session from '../../../lib/session';
import { useHearMe } from '../../../providers/HearMeProvider';

export default function SettingsTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { ready, settings, patchSettings } = useHearMe();
  const [numDraft, setNumDraft] = useState(settings.emergencyNumber);

  useEffect(() => {
    if (ready) setNumDraft(settings.emergencyNumber);
  }, [ready, settings.emergencyNumber]);

  const signOut = () => {
    Alert.alert('Sign out?', 'You will need OTP + Aadhaar step again on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            await Session.clearSession();
            router.replace('/login');
          })(),
      },
    ]);
  };

  if (!ready) {
    return <GradientBackground style={styles.flex} />;
  }

  return (
    <GradientBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: tabBarHeight + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.sub}>SOS behaviour, shake detection, and account.</Text>

        <Text style={styles.section}>Emergency line</Text>
        <GlassCard style={styles.card}>
          <Text style={styles.cardHint}>
            Used when “Call emergency” is tapped, and optionally after SOS SMS succeeds.
          </Text>
          <View style={styles.numRow}>
            <TextInput
              value={numDraft}
              onChangeText={setNumDraft}
              keyboardType="phone-pad"
              placeholder="112"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <Pressable
              onPress={() =>
                void (async () => {
                  const v = numDraft.replace(/[^\d+]/g, '') || '112';
                  await patchSettings({ emergencyNumber: v });
                })()
              }
              style={styles.saveChip}
            >
              <LinearGradient
                colors={[colors.accentPink, colors.accentRose]}
                style={styles.saveChipIn}
              >
                <Text style={styles.saveChipTxt}>Save</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </GlassCard>

        <Text style={styles.section}>SOS behaviour</Text>
        <GlassCard style={styles.card}>
          <RowSwitch
            title="Skip SOS confirmation"
            subtitle="Only if you are confident you will not mis-tap SOS."
            value={settings.skipSosConfirm}
            onValueChange={(v) => void patchSettings({ skipSosConfirm: v })}
          />
          <RowSwitch
            title="Call emergency line after SMS"
            subtitle={`Dials ${settings.emergencyNumber} after SMS completes.`}
            value={settings.autoCallAfterSms}
            onValueChange={(v) => void patchSettings({ autoCallAfterSms: v })}
          />
        </GlassCard>

        <Text style={styles.section}>Shake detection</Text>
        <GlassCard style={styles.card}>
          <RowSwitch
            title="Enable shake alerts"
            subtitle="Best while HearMe is open in the foreground."
            value={settings.shakeEnabled}
            onValueChange={(v) => void patchSettings({ shakeEnabled: v })}
          />
          <RowSwitch
            title="Instant shake sends SMS"
            subtitle="If off, HearMe asks before texting."
            value={settings.instantShake}
            disabled={!settings.shakeEnabled}
            onValueChange={(v) => void patchSettings({ instantShake: v })}
          />
        </GlassCard>

        <PrimaryButton title="Sign out" onPress={signOut} style={styles.signOut} />

        <View style={styles.footer}>
          <MaterialCommunityIcons name="information-outline" size={18} color={colors.textMuted} />
          <Text style={styles.footerTxt}>
            HearMe · Expo Go testing build. Replace demo OTP and add UIDAI-compliant Aadhaar
            checks before Play Store.
          </Text>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

function RowSwitch({
  title,
  subtitle,
  value,
  disabled,
  onValueChange,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={[styles.rowSwitch, disabled && { opacity: 0.45 }]}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(167,139,250,0.55)' }}
        thumbColor={value ? colors.accentPink : '#94a3b8'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '900', color: colors.text },
  sub: { marginTop: 6, color: colors.textMuted, fontSize: 14, marginBottom: 18 },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 8,
  },
  card: { padding: 16, marginBottom: 8 },
  cardHint: { color: colors.textMuted, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  numRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  saveChip: { borderRadius: radii.md, overflow: 'hidden' },
  saveChipIn: { paddingVertical: 12, paddingHorizontal: 18 },
  saveChipTxt: { color: '#fff', fontWeight: '800' },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 16 },
  signOut: { marginTop: 20 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
    paddingHorizontal: 4,
  },
  footerTxt: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
