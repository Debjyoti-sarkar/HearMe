import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
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
import { isSirenPlaying, stopSiren } from '../../../lib/siren';
import { useAccessibility } from '../../../providers/AccessibilityProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { useHearMe } from '../../../providers/HearMeProvider';
import * as Session from '../../../lib/session';
import {
  autoReversePinFor,
  clearDuressPin,
  getDuressPin,
  saveDuressPin,
} from '../../../lib/duress';

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
  const { bodyText } = useAccessibility();
  return (
    <View style={[settingStyles.row, disabled && { opacity: 0.4 }]}>
      <View style={[settingStyles.rowIcon, { backgroundColor: iconColor + '18' }]}>
        <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
      </View>
      <View style={settingStyles.rowContent}>
        <Text style={[settingStyles.rowTitle, bodyText]}>{title}</Text>
        <Text style={[settingStyles.rowSub, bodyText]}>{subtitle}</Text>
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
  const { oneHandedShift, bodyText, headingText } = useAccessibility();
  const [numDraft, setNumDraft] = useState(settings.emergencyNumber);
  const [safeWordDraft, setSafeWordDraft] = useState(settings.voiceSafeWord);
  const [normalPin, setNormalPin] = useState<string | null>(null);
  const [duressPin, setDuressPin] = useState<string | null>(null);
  const [duressDraft, setDuressDraft] = useState('');
  const [sirenActive, setSirenActive] = useState(isSirenPlaying());
  const [stopPinModal, setStopPinModal] = useState(false);
  const [stopPinDraft, setStopPinDraft] = useState('');

  useEffect(() => {
    if (ready) setNumDraft(settings.emergencyNumber);
  }, [ready, settings.emergencyNumber]);

  useEffect(() => {
    if (ready) setSafeWordDraft(settings.voiceSafeWord);
  }, [ready, settings.voiceSafeWord]);

  useEffect(() => {
    if (!ready) return;
    void (async () => {
      const [p, d] = await Promise.all([Session.getPin(), getDuressPin()]);
      setNormalPin(p);
      setDuressPin(d);
    })();
  }, [ready]);

  // Check siren status periodically
  useEffect(() => {
    const interval = setInterval(() => setSirenActive(isSirenPlaying()), 1000);
    return () => clearInterval(interval);
  }, []);

  const onStopSirenWithPin = async () => {
    const digits = stopPinDraft.replace(/\D/g, '');
    if (!normalPin) {
      // No PIN set — just stop
      await stopSiren();
      setSirenActive(false);
      setStopPinModal(false);
      setStopPinDraft('');
      return;
    }
    if (digits !== normalPin) {
      Alert.alert('Wrong PIN', 'Enter your security PIN to stop the siren.');
      setStopPinDraft('');
      return;
    }
    await stopSiren();
    setSirenActive(false);
    setStopPinModal(false);
    setStopPinDraft('');
  };

  const autoReverse = normalPin ? autoReversePinFor(normalPin) : null;
  const effectiveDuress = duressPin ?? autoReverse;

  const onSaveDuressPin = async () => {
    const digits = duressDraft.replace(/\D/g, '');
    if (digits.length !== 4) {
      Alert.alert('Invalid', 'Duress PIN must be 4 digits.');
      return;
    }
    if (digits === normalPin) {
      Alert.alert('Conflict', 'Duress PIN cannot equal your normal PIN.');
      return;
    }
    await saveDuressPin(digits);
    setDuressPin(digits);
    setDuressDraft('');
    Alert.alert('Saved', 'Custom duress PIN saved.');
  };

  const onClearDuressPin = async () => {
    await clearDuressPin();
    setDuressPin(null);
    Alert.alert(
      'Cleared',
      autoReverse
        ? `Duress PIN reset. The reversed normal PIN (${autoReverse}) will trigger silent SOS.`
        : 'Duress PIN cleared.',
    );
  };

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
          { paddingTop: insets.top + 16 + oneHandedShift, paddingBottom: tabBarHeight + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, headingText]}>Settings</Text>
        <Text style={[styles.sub, bodyText]}>Configure SOS behavior, detection, and account</Text>

        {/* Active Siren Banner */}
        {sirenActive && (
          <Pressable
            onPress={() => setStopPinModal(true)}
            style={({ pressed }) => [styles.sirenBanner, pressed && { opacity: 0.8 }]}
          >
            <LinearGradient
              colors={['rgba(239,68,68,0.15)', 'rgba(239,68,68,0.05)']}
              style={styles.sirenBannerGrad}
            >
              <MaterialCommunityIcons name="bullhorn" size={24} color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={styles.sirenBannerTitle}>Siren is Active</Text>
                <Text style={styles.sirenBannerSub}>Tap to stop (PIN required)</Text>
              </View>
              <MaterialCommunityIcons name="stop-circle" size={28} color={colors.danger} />
            </LinearGradient>
          </Pressable>
        )}

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

        {/* App Lock & Duress PIN */}
        <Text style={styles.section}>App Lock & Duress</Text>
        <GlassCard style={styles.card}>
          <RowSwitch
            title="Require PIN on launch"
            subtitle="Lock screen on cold start and after 30s in background"
            icon="shield-lock"
            iconColor={colors.accentViolet}
            value={settings.appLockEnabled}
            disabled={!normalPin}
            onValueChange={(v) => {
              if (v && !normalPin) {
                Alert.alert('Set a PIN first', 'Use Setup PIN before enabling app lock.');
                return;
              }
              void patchSettings({ appLockEnabled: v });
            }}
          />
          <RowSwitch
            title="Reverse PIN = silent SOS"
            subtitle={
              effectiveDuress
                ? `"${effectiveDuress}" unlocks a decoy and fires silent SOS`
                : 'Set a normal PIN (non-palindrome) or a custom duress PIN below'
            }
            icon="alert-decagram"
            iconColor={colors.danger}
            value={settings.duressEnabled}
            disabled={!effectiveDuress}
            onValueChange={(v) => void patchSettings({ duressEnabled: v })}
          />
          <RowSwitch
            title="Disguised UI on launch"
            subtitle="Show a calculator decoy; type your PIN + = to reveal HearMe"
            icon="calculator-variant"
            iconColor={colors.accentCyan}
            value={settings.disguiseEnabled}
            disabled={!normalPin}
            onValueChange={(v) => void patchSettings({ disguiseEnabled: v })}
          />
          <View style={styles.subRow}>
            <Text style={styles.subRowLabel}>Custom duress PIN (optional)</Text>
            <Text style={styles.subRowHint}>
              {duressPin
                ? `Currently: "${duressPin}"`
                : autoReverse
                ? `Default: reversed normal PIN ("${autoReverse}")`
                : 'A non-palindrome normal PIN auto-creates a reversed duress PIN.'}
            </Text>
            <View style={styles.numRow}>
              <View style={styles.numInputWrap}>
                <MaterialCommunityIcons name="key-variant" size={20} color={colors.danger} />
                <TextInput
                  value={duressDraft}
                  onChangeText={(t) => setDuressDraft(t.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  placeholder="4-digit duress PIN"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry
                  style={styles.numInput}
                />
              </View>
              <Pressable onPress={() => void onSaveDuressPin()}>
                <LinearGradient
                  colors={[colors.danger, colors.accentRose]}
                  style={styles.saveChip}
                >
                  <Text style={styles.saveChipTxt}>Save</Text>
                </LinearGradient>
              </Pressable>
            </View>
            {duressPin && (
              <Pressable onPress={() => void onClearDuressPin()} style={styles.linkBtn}>
                <Text style={styles.linkText}>Clear custom duress PIN</Text>
              </Pressable>
            )}
          </View>
        </GlassCard>

        {/* Voice Trigger */}
        <Text style={styles.section}>Voice Trigger</Text>
        <GlassCard style={styles.card}>
          <RowSwitch
            title="Listen for distress audio"
            subtitle="Mic-on listener fires SOS prompt on sustained loud audio"
            icon="microphone-outline"
            iconColor={colors.accentEmerald}
            value={settings.voiceTriggerEnabled}
            onValueChange={(v) => void patchSettings({ voiceTriggerEnabled: v })}
          />
          <View style={styles.subRow}>
            <Text style={styles.subRowLabel}>Safe-word label</Text>
            <Text style={styles.subRowHint}>
              True keyword spotting needs a custom dev client (Vosk / Picovoice).
              Until then, this label is shown in the trigger prompt.
            </Text>
            <View style={styles.numRow}>
              <View style={styles.numInputWrap}>
                <MaterialCommunityIcons name="text-short" size={20} color={colors.accentEmerald} />
                <TextInput
                  value={safeWordDraft}
                  onChangeText={setSafeWordDraft}
                  placeholder="e.g. mausam kaisa hai"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.numInput}
                  maxLength={48}
                />
              </View>
              <Pressable onPress={() => void patchSettings({ voiceSafeWord: safeWordDraft.trim() })}>
                <LinearGradient
                  colors={[colors.accentEmerald, colors.accentCyan]}
                  style={styles.saveChip}
                >
                  <Text style={styles.saveChipTxt}>Save</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </GlassCard>

        {/* Timer Check-in */}
        <Text style={styles.section}>Timer Check-in</Text>
        <GlassCard style={styles.card}>
          <Pressable
            onPress={() => router.push('/(main)/check-in')}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.85 }]}
          >
            <View style={[settingStyles.rowIcon, { backgroundColor: colors.accentViolet + '18' }]}>
              <MaterialCommunityIcons name="timer-sand" size={20} color={colors.accentViolet} />
            </View>
            <View style={settingStyles.rowContent}>
              <Text style={settingStyles.rowTitle}>
                {settings.activeCheckInExpiresAt ? 'Active check-in' : 'Start a check-in'}
              </Text>
              <Text style={settingStyles.rowSub}>
                {settings.activeCheckInExpiresAt
                  ? `Expires ${new Date(settings.activeCheckInExpiresAt).toLocaleTimeString()}`
                  : 'Auto-SOS if you do not confirm by the deadline'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
          </Pressable>
        </GlassCard>

        {/* Evidence Locker */}
        <Text style={styles.section}>Evidence Locker</Text>
        <GlassCard style={styles.card}>
          <RowSwitch
            title="Cloud sync (hash-chained)"
            subtitle="Auto-upload SOS evidence to your private Supabase bucket"
            icon="cloud-lock-outline"
            iconColor={colors.accentEmerald}
            value={settings.cloudSyncEvidence}
            onValueChange={(v) => void patchSettings({ cloudSyncEvidence: v })}
          />
          <Pressable
            onPress={() => router.push('/(main)/evidence-locker')}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.85 }]}
          >
            <View style={[settingStyles.rowIcon, { backgroundColor: colors.accentCyan + '18' }]}>
              <MaterialCommunityIcons name="folder-lock-outline" size={20} color={colors.accentCyan} />
            </View>
            <View style={settingStyles.rowContent}>
              <Text style={settingStyles.rowTitle}>Open evidence locker</Text>
              <Text style={settingStyles.rowSub}>
                View, sync, verify chain integrity
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
          </Pressable>
        </GlassCard>

        {/* Appearance */}
        <Text style={styles.section}>Appearance</Text>
        <GlassCard style={styles.card}>
          <RowSwitch
            title={settings.darkMode ? 'Dark Mode' : 'Light Mode'}
            subtitle={settings.darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            icon={settings.darkMode ? 'weather-night' : 'white-balance-sunny'}
            iconColor={settings.darkMode ? colors.accentIndigo : colors.accentAmber}
            value={settings.darkMode}
            onValueChange={(v) => void patchSettings({ darkMode: v })}
          />
        </GlassCard>

        {/* Accessibility */}
        <Text style={styles.section}>Accessibility</Text>
        <GlassCard style={styles.card}>
          <RowSwitch
            title="One-handed mode"
            subtitle="Shift the home screen content lower for thumb reach"
            icon="hand-back-right"
            iconColor={colors.accentIndigo}
            value={settings.oneHandedMode}
            onValueChange={(v) => void patchSettings({ oneHandedMode: v })}
          />
          <RowSwitch
            title="Dyslexia-friendly font"
            subtitle="Use a heavier, more readable font weight throughout"
            icon="format-letter-case"
            iconColor={colors.accentAmber}
            value={settings.dyslexiaFont}
            onValueChange={(v) => void patchSettings({ dyslexiaFont: v })}
          />
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

      {/* Stop Siren PIN Modal */}
      <Modal visible={stopPinModal} animationType="fade" transparent>
        <View style={styles.modalBg}>
          <GlassCard variant="elevated" style={styles.stopModal}>
            <MaterialCommunityIcons name="bullhorn" size={40} color={colors.danger} style={{ alignSelf: 'center' }} />
            <Text style={styles.stopModalTitle}>Stop Siren</Text>
            <Text style={styles.stopModalSub}>
              {normalPin ? 'Enter your 4-digit PIN to stop the siren' : 'Tap Stop to silence the siren'}
            </Text>

            {normalPin && (
              <TextInput
                value={stopPinDraft}
                onChangeText={(t) => setStopPinDraft(t.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                placeholder="Enter PIN"
                placeholderTextColor={colors.textSecondary}
                style={styles.stopPinInput}
                autoFocus
              />
            )}

            <View style={styles.stopModalActions}>
              <Pressable
                onPress={() => { setStopPinModal(false); setStopPinDraft(''); }}
                style={styles.stopCancelBtn}
              >
                <Text style={styles.stopCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void onStopSirenWithPin()}
                disabled={normalPin ? stopPinDraft.length < 4 : false}
                style={({ pressed }) => [
                  styles.stopConfirmBtn,
                  pressed && { opacity: 0.8 },
                  normalPin && stopPinDraft.length < 4 && { opacity: 0.4 },
                ]}
              >
                <LinearGradient colors={['#ef4444', '#dc2626']} style={styles.stopConfirmGrad}>
                  <MaterialCommunityIcons name="stop" size={18} color="#fff" />
                  <Text style={styles.stopConfirmText}>Stop Siren</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </GlassCard>
        </View>
      </Modal>
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
  subRow: {
    paddingVertical: 14,
    gap: 10,
  },
  subRowLabel: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  subRowHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  linkBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  linkText: {
    color: colors.accentViolet,
    fontWeight: '700',
    fontSize: 13,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
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
  // Siren banner
  sirenBanner: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    marginBottom: 16,
  },
  sirenBannerGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  sirenBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.danger,
  },
  sirenBannerSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  // Stop siren modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stopModal: {
    padding: 28,
    alignItems: 'stretch',
  },
  stopModalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    marginTop: 12,
  },
  stopModalSub: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  stopPinInput: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 20,
  },
  stopModalActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  stopCancelBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  stopCancelText: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 15,
  },
  stopConfirmBtn: {
    flex: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  stopConfirmGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  stopConfirmText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
});
