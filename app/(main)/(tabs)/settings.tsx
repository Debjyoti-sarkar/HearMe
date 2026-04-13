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
import { clearDemoAuth } from '../../../lib/demo-auth';
import { useAuth } from '../../../providers/AuthProvider';
import { useHearMe } from '../../../providers/HearMeProvider';

function RowSwitch({
  title,
  subtitle,
  icon,
  iconColor,
  value,
  disabled,
  onValueChange,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={[settingStyles.row, disabled && { opacity: 0.4 }]}>
      <View style={[settingStyles.rowIcon, { backgroundColor: iconColor + '18' }]}>
        <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
      </View>
      <View style={settingStyles.rowContent}>
        <Text style={settingStyles.rowTitle}>{title}</Text>
        <Text style={settingStyles.rowSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(167,139,250,0.5)' }}
        thumbColor={value ? colors.accentPink : '#64748b'}
      />
    </View>
  );
}

export default function SettingsTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { ready, settings, patchSettings } = useHearMe();
  const { signOut: doSignOut } = useAuth();
  const [numDraft, setNumDraft] = useState(settings.emergencyNumber);

  useEffect(() => {
    if (ready) setNumDraft(settings.emergencyNumber);
  }, [ready, settings.emergencyNumber]);

  const onSignOut = () => {
    Alert.alert('Sign out?', 'You will need to log in again to access HearMe.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            await clearDemoAuth();
            await doSignOut();
            router.replace('/login');
          })(),
      },
    ]);
  };

  if (!ready) return <GradientBackground style={{ flex: 1 }} />;

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
        <Text style={styles.sub}>Configure SOS behavior, detection, and account</Text>

        {/* Emergency Number */}
        <Text style={styles.section}>Emergency Line</Text>
        <GlassCard style={styles.card}>
          <View style={styles.numRow}>
            <View style={styles.numInputWrap}>
              <MaterialCommunityIcons name="phone-alert" size={20} color={colors.accentViolet} />
              <TextInput
                value={numDraft}
                onChangeText={setNumDraft}
                keyboardType="phone-pad"
                placeholder="112"
                placeholderTextColor={colors.textSecondary}
                style={styles.numInput}
              />
            </View>
            <Pressable
              onPress={() =>
                void (async () => {
                  const v = numDraft.replace(/[^\d+]/g, '') || '112';
                  await patchSettings({ emergencyNumber: v });
                })()
              }
            >
              <LinearGradient
                colors={[colors.accentViolet, colors.accentPink]}
                style={styles.saveChip}
              >
                <Text style={styles.saveChipTxt}>Save</Text>
              </LinearGradient>
            </Pressable>
          </View>
          <Text style={styles.numHint}>
            Used for emergency calls and auto-call after SMS
          </Text>
        </GlassCard>

        {/* SOS Settings */}
        <Text style={styles.section}>SOS Behavior</Text>
        <GlassCard style={styles.card}>
          <RowSwitch
            title="Skip SOS confirmation"
            subtitle="Instantly send alerts without asking"
            icon="lightning-bolt"
            iconColor={colors.warning}
            value={settings.skipSosConfirm}
            onValueChange={(v) => void patchSettings({ skipSosConfirm: v })}
          />
          <RowSwitch
            title="Auto-call after SMS"
            subtitle={`Dials ${settings.emergencyNumber} after SMS is sent`}
            icon="phone-forward"
            iconColor={colors.success}
            value={settings.autoCallAfterSms}
            onValueChange={(v) => void patchSettings({ autoCallAfterSms: v })}
          />
          <RowSwitch
            title="Enable siren"
            subtitle="Play loud alarm sound during SOS"
            icon="bullhorn"
            iconColor={colors.danger}
            value={settings.sirenEnabled}
            onValueChange={(v) => void patchSettings({ sirenEnabled: v })}
          />
        </GlassCard>

        {/* Shake Detection */}
        <Text style={styles.section}>Shake Detection</Text>
        <GlassCard style={styles.card}>
          <RowSwitch
            title="Enable shake alerts"
            subtitle="Shake phone to trigger SOS (foreground only)"
            icon="vibrate"
            iconColor={colors.accentViolet}
            value={settings.shakeEnabled}
            onValueChange={(v) => void patchSettings({ shakeEnabled: v })}
          />
          <RowSwitch
            title="Instant shake sends SMS"
            subtitle="Send immediately without confirmation"
            icon="send-check"
            iconColor={colors.accentCyan}
            value={settings.instantShake}
            disabled={!settings.shakeEnabled}
            onValueChange={(v) => void patchSettings({ instantShake: v })}
          />
        </GlassCard>

        {/* Crash Detection */}
        <Text style={styles.section}>Crash Detection</Text>
        <GlassCard style={styles.card}>
          <RowSwitch
            title="Enable crash detection"
            subtitle="Auto-detect sudden deceleration while driving"
            icon="car-emergency"
            iconColor={colors.accentPink}
            value={settings.crashDetection}
            onValueChange={(v) => void patchSettings({ crashDetection: v })}
          />
          <View style={[settingStyles.row, !settings.crashDetection && { opacity: 0.4 }]}>
            <View style={[settingStyles.rowIcon, { backgroundColor: colors.warning + '18' }]}>
              <MaterialCommunityIcons name="speedometer-medium" size={20} color={colors.warning} />
            </View>
            <View style={settingStyles.rowContent}>
              <Text style={settingStyles.rowTitle}>Speed threshold</Text>
              <Text style={settingStyles.rowSub}>{settings.crashSpeedThreshold} km/h</Text>
            </View>
            <View style={styles.thresholdBtns}>
              <Pressable
                onPress={() => void patchSettings({
                  crashSpeedThreshold: Math.max(20, settings.crashSpeedThreshold - 10),
                })}
                disabled={!settings.crashDetection}
                style={styles.threshBtn}
              >
                <Text style={styles.threshBtnTxt}>-</Text>
              </Pressable>
              <Pressable
                onPress={() => void patchSettings({
                  crashSpeedThreshold: Math.min(120, settings.crashSpeedThreshold + 10),
                })}
                disabled={!settings.crashDetection}
                style={styles.threshBtn}
              >
                <Text style={styles.threshBtnTxt}>+</Text>
              </Pressable>
            </View>
          </View>
        </GlassCard>

        {/* Account */}
        <Text style={styles.section}>Account</Text>
        <PrimaryButton
          title="Sign Out"
          variant="danger"
          icon={<MaterialCommunityIcons name="logout" size={20} color="#fff" />}
          onPress={onSignOut}
        />

        <View style={styles.footer}>
          <Text style={styles.footerBrand}>HearMe</Text>
          <Text style={styles.footerVersion}>v1.0.0</Text>
          <Text style={styles.footerText}>
            Built with features from SheGuard, SafeGuardHer, LadyBuddy, WSafe, and SheSecure.
            Industry-grade safety companion.
          </Text>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

const settingStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1 },
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 3, lineHeight: 16 },
});

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  sub: { marginTop: 6, color: colors.textMuted, fontSize: 14, marginBottom: 18 },
  section: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 12,
  },
  card: { padding: 6, paddingHorizontal: 14, marginBottom: 8 },
  numRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  numInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
  },
  numInput: {
    flex: 1,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  saveChip: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radii.md,
  },
  saveChipTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  numHint: {
    color: colors.textSecondary,
    fontSize: 12,
    paddingBottom: 8,
    lineHeight: 16,
  },
  thresholdBtns: {
    flexDirection: 'row',
    gap: 4,
  },
  threshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  threshBtnTxt: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  footer: {
    marginTop: 28,
    alignItems: 'center',
    paddingBottom: 16,
  },
  footerBrand: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.accentViolet,
    letterSpacing: -0.5,
  },
  footerVersion: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 8,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    maxWidth: 300,
  },
});
