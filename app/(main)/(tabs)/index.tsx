import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../../components/GradientBackground';
import { GlassCard } from '../../../components/GlassCard';
import { SOSButton } from '../../../components/SOSButton';
import { QuickAction } from '../../../components/QuickAction';
import { StatusBadge } from '../../../components/StatusBadge';
import { useThemedStyles } from '../../../hooks/useThemedStyles';
import { loadLocalAvatar } from '../../../lib/app-data';
import { shareLocationWhatsApp } from '../../../lib/emergency-sms';
import { useAccessibility } from '../../../providers/AccessibilityProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { useHearMe } from '../../../providers/HearMeProvider';
import { useTheme, type ThemeColors } from '../../../providers/ThemeProvider';
import { generateSafetyCode, isSirenPlaying, stopSiren } from '../../../lib/siren';
import * as Session from '../../../lib/session';
import { saveAlertRecord } from '../../../lib/alert-history';
import type { NeuroBandLiveState } from '../../../providers/HearMeProvider';
import type { HearMeSettings } from '../../../lib/types';

function nbStateLabel(state: string, mock: boolean): string {
  if (state === 'connected') return mock ? 'Mock stream' : 'Monitoring';
  if (state === 'reconnecting') return 'Reconnecting';
  if (state === 'pairing') return 'Pairing';
  if (state === 'scanning') return 'Scanning';
  if (state === 'error') return 'Error';
  if (state === 'disabled') return 'Off';
  return 'Idle';
}

function nbSubLabel(nb: NeuroBandLiveState, s: HearMeSettings): string {
  if (s.neuroBandWorkoutModeUntil && Date.now() < s.neuroBandWorkoutModeUntil) {
    const mins = Math.ceil((s.neuroBandWorkoutModeUntil - Date.now()) / 60000);
    return `Workout mode · ${mins} min remaining`;
  }
  if (nb.connection === 'connected') {
    if (nb.calibrationProgress < 1) {
      return `Calibrating · ${Math.round(nb.calibrationProgress * 100)}%`;
    }
    return s.neuroBandMockMode
      ? 'Synthetic data — fusion + UI test path'
      : 'Bio-signal silent trigger armed';
  }
  if (s.neuroBandEnabled && !s.neuroBandSerial) return 'Tap to pair a band';
  if (!s.neuroBandEnabled) return 'Tap to enable';
  return 'Tap to manage';
}

function nbMarkersFiring(nb: NeuroBandLiveState): number {
  let n = 0;
  for (const m of ['hr', 'gsr', 'temp', 'spo2', 'semg'] as const) {
    if (nb.instant[m]) n++;
  }
  return n;
}

function NbKpi({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.nbKpi}>
      <Text style={styles.nbKpiLabel}>{label}</Text>
      <Text style={[styles.nbKpiValue, accent && { color: c.accentPink }]}>
        {value}
      </Text>
      <Text style={styles.nbKpiUnit}>{unit}</Text>
    </View>
  );
}

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const {
    ready,
    contacts,
    settings,
    executeSos,
    shareLocation,
    callEmergencyLine,
    neuroBand,
  } = useHearMe();
  const { profile, refreshProfile } = useAuth();
  const { oneHandedShift, dyslexiaFont, bodyText, headingText } = useAccessibility();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [sosActive, setSosActive] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [sirenActive, setSirenActive] = useState(false);

  useEffect(() => {
    if (!profile) void refreshProfile();
  }, []);

  // Reload avatar and siren status whenever dashboard regains focus
  useFocusEffect(
    useCallback(() => {
      loadLocalAvatar().then(setLocalAvatar);
      setSirenActive(isSirenPlaying());
      const interval = setInterval(() => setSirenActive(isSirenPlaying()), 1000);
      return () => clearInterval(interval);
    }, []),
  );

  const handleStopSiren = async () => {
    const pin = await Session.getPin();
    if (!pin) {
      await stopSiren();
      setSirenActive(false);
      return;
    }
    Alert.prompt
      ? Alert.prompt('Stop Siren', 'Enter your 4-digit PIN', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Stop',
            onPress: async (val: string | undefined) => {
              if (val === pin) {
                await stopSiren();
                setSirenActive(false);
              } else {
                Alert.alert('Wrong PIN', 'Incorrect PIN entered.');
              }
            },
          },
        ], 'secure-text')
      : // Android doesn't have Alert.prompt — just stop with confirmation
        Alert.alert('Stop Siren', 'Are you sure you want to stop the siren?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Stop Siren',
            style: 'destructive',
            onPress: async () => {
              await stopSiren();
              setSirenActive(false);
            },
          },
        ]);
  };

  const handleSos = async () => {
    if (contacts.length === 0) {
      Alert.alert('No contacts', 'Add at least one trusted contact before sending an SOS.');
      return;
    }

    if (!settings.skipSosConfirm) {
      Alert.alert(
        'Send Emergency Alert?',
        'This will send an SMS with your location to all trusted contacts.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'SEND SOS',
            style: 'destructive',
            onPress: () => void doSos(),
          },
        ],
      );
      return;
    }
    await doSos();
  };

  const doSos = async () => {
    setSosActive(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    const code = generateSafetyCode();
    try {
      const result = await executeSos();

      await saveAlertRecord({
        id: `alert-${Date.now()}`,
        type: 'sos',
        timestamp: new Date().toISOString(),
        location: null,
        safetyCode: code,
        contactsNotified: contacts.length,
        status: result.ok ? 'sent' : 'failed',
      });

      Alert.alert(
        result.ok ? 'SOS Sent' : 'SOS Failed',
        result.ok
          ? `Safety Code: ${code}\nShare this code with responders to verify your identity.`
          : result.message,
        [
          {
            text: 'Stop Siren',
            onPress: () => void stopSiren(),
          },
          {
            text: 'OK',
            onPress: () => void stopSiren(),
          },
        ],
      );
    } catch (err) {
      await saveAlertRecord({
        id: `alert-${Date.now()}`,
        type: 'sos',
        timestamp: new Date().toISOString(),
        location: null,
        safetyCode: code,
        contactsNotified: contacts.length,
        status: 'failed',
      });
      Alert.alert(
        'SOS Failed',
        err instanceof Error ? err.message : 'Unexpected error sending SOS.',
        [{ text: 'Stop Siren', onPress: () => void stopSiren() }],
      );
    } finally {
      setSosActive(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (!ready) {
    return <GradientBackground><View style={{ flex: 1 }} /></GradientBackground>;
  }

  return (
    <GradientBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 12 + oneHandedShift,
            paddingBottom: tabBarHeight + 28,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={[styles.greeting, bodyText, { color: tc.textMuted }]}>{getGreeting()}</Text>
            <Text style={[styles.userName, headingText, { color: tc.text }]}>{profile?.name ?? 'User'}</Text>
          </View>
          <Pressable onPress={() => router.push('/(main)/user-profile')} style={styles.avatarBtn}>
            {(profile?.avatar_url || localAvatar) ? (
              <Image source={{ uri: profile?.avatar_url ?? localAvatar! }} style={styles.avatar} />
            ) : (
              <LinearGradient
                colors={[tc.accentViolet, tc.accentPink]}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>
                  {(profile?.name ?? 'U').charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>
            )}
          </Pressable>
        </View>

        {/* Status bar */}
        <View style={styles.statusRow}>
          <StatusBadge
            label={contacts.length > 0 ? `${contacts.length} contacts` : 'No contacts'}
            variant={contacts.length > 0 ? 'success' : 'warning'}
          />
          <StatusBadge
            label={settings.shakeEnabled ? 'Shake ON' : 'Shake OFF'}
            variant={settings.shakeEnabled ? 'success' : 'info'}
          />
          {settings.crashDetection && (
            <StatusBadge label="Crash ON" variant="info" />
          )}
        </View>

        {/* Stop Siren Banner */}
        {sirenActive && (
          <Pressable
            onPress={() => void handleStopSiren()}
            style={({ pressed }) => [styles.sirenBanner, pressed && { opacity: 0.8 }]}
          >
            <MaterialCommunityIcons name="bullhorn" size={22} color={tc.danger} />
            <Text style={styles.sirenBannerText}>Siren Active — Tap to Stop</Text>
            <MaterialCommunityIcons name="stop-circle" size={24} color={tc.danger} />
          </Pressable>
        )}

        {/* SOS Button */}
        <View style={styles.sosContainer}>
          <SOSButton onPress={() => void handleSos()} disabled={sosActive} />
        </View>

        {/* NeuroBand dashboard */}
        <Pressable
          onPress={() => router.push('/(main)/neuroband')}
          style={({ pressed }) => [styles.nbWrap, pressed && { opacity: 0.92 }]}
        >
          <GlassCard variant="accent" style={styles.nbCard}>
            <LinearGradient
              colors={
                neuroBand.connection === 'connected'
                  ? ['rgba(167,139,250,0.22)', 'rgba(236,72,153,0.16)']
                  : ['rgba(100,116,139,0.18)', 'rgba(71,85,105,0.10)']
              }
              style={styles.nbGrad}
            >
              <View style={styles.nbHeader}>
                <LinearGradient
                  colors={
                    neuroBand.connection === 'connected'
                      ? ['#a78bfa', '#ec4899']
                      : ['#475569', '#64748b']
                  }
                  style={styles.nbIcon}
                >
                  <MaterialCommunityIcons name="watch-variant" size={22} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <View style={styles.nbTitleRow}>
                    <Text style={styles.nbTitle}>NeuroBand</Text>
                    <View
                      style={[
                        styles.nbDot,
                        {
                          backgroundColor:
                            neuroBand.connection === 'connected'
                              ? tc.success
                              : neuroBand.connection === 'reconnecting'
                                ? tc.warning
                                : tc.textSecondary,
                        },
                      ]}
                    />
                    <Text style={styles.nbState}>
                      {nbStateLabel(neuroBand.connection, settings.neuroBandMockMode)}
                    </Text>
                  </View>
                  <Text style={styles.nbSub}>
                    {nbSubLabel(neuroBand, settings)}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={tc.textMuted}
                />
              </View>

              {neuroBand.connection === 'connected' && neuroBand.lastFrame && (
                <View style={styles.nbKpiRow}>
                  <NbKpi
                    label="HR"
                    value={`${neuroBand.lastFrame.hr}`}
                    unit="bpm"
                  />
                  <NbKpi
                    label="GSR"
                    value={neuroBand.lastFrame.gsrUs.toFixed(1)}
                    unit="µS"
                  />
                  <NbKpi
                    label="Skin"
                    value={neuroBand.lastFrame.skinTempC.toFixed(1)}
                    unit="°C"
                  />
                  <NbKpi
                    label="Markers"
                    value={`${nbMarkersFiring(neuroBand)}`}
                    unit="/5"
                    accent={nbMarkersFiring(neuroBand) >= 2}
                  />
                </View>
              )}
            </LinearGradient>
          </GlassCard>
        </Pressable>

        {/* Quick Actions */}
        <Text style={[styles.sectionLabel, bodyText]}>QUICK ACTIONS</Text>
        <View style={styles.quickActions}>
          <QuickAction
            icon="phone-alert"
            label="Emergency Call"
            gradient={['#ef4444', '#dc2626']}
            onPress={() => void callEmergencyLine()}
          />
          <QuickAction
            icon="map-marker-radius"
            label="Share Location"
            gradient={['#3b82f6', '#2563eb']}
            onPress={() => {
              Alert.alert('Share Location', 'Choose how to share your location', [
                {
                  text: 'SMS',
                  onPress: () => {
                    void shareLocation().then((r) => {
                      Alert.alert(r.ok ? 'Sent' : 'Failed', r.message);
                    });
                  },
                },
                {
                  text: 'WhatsApp',
                  onPress: () => {
                    void shareLocationWhatsApp().then((r) => {
                      if (!r.ok) Alert.alert('Failed', r.message);
                    });
                  },
                },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
          />
          <QuickAction
            icon="phone-incoming"
            label="Fake Call"
            gradient={['#10b981', '#059669']}
            onPress={() => router.push('/(main)/fake-call')}
          />
          <QuickAction
            icon="phone-classic"
            label="Helplines"
            gradient={['#8b5cf6', '#7c3aed']}
            onPress={() => router.push('/(main)/helplines')}
          />
        </View>

        {/* Timer Check-in entry */}
        <Pressable
          onPress={() => router.push('/(main)/check-in')}
          style={({ pressed }) => [{ marginBottom: 20 }, pressed && { opacity: 0.9 }]}
        >
          <GlassCard variant="accent" style={styles.checkInRow}>
            <LinearGradient
              colors={['rgba(167,139,250,0.18)', 'rgba(56,189,248,0.12)']}
              style={styles.checkInGrad}
            >
              <MaterialCommunityIcons name="timer-sand" size={26} color={tc.accentViolet} />
              <View style={{ flex: 1 }}>
                <Text style={styles.checkInTitle}>
                  {settings.activeCheckInExpiresAt ? 'Active check-in' : 'Start a timer check-in'}
                </Text>
                <Text style={styles.checkInSub}>
                  {settings.activeCheckInExpiresAt
                    ? `Expires ${new Date(settings.activeCheckInExpiresAt).toLocaleTimeString()} — auto-SOS if you don't confirm`
                    : 'Auto-SOS if you don\u2019t confirm by the deadline'}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textMuted} />
            </LinearGradient>
          </GlassCard>
        </Pressable>

        {/* Feature Cards */}
        <Text style={[styles.sectionLabel, bodyText]}>SAFETY TOOLS</Text>
        <View style={styles.featureGrid}>
          <Pressable
            onPress={() => router.push('/(main)/camera-detector')}
            style={styles.featureHalf}
          >
            <GlassCard variant="accent" style={styles.featureCard}>
              <LinearGradient
                colors={['#f59e0b', '#d97706']}
                style={styles.featureIcon}
              >
                <MaterialCommunityIcons name="camera-wireless-outline" size={24} color="#fff" />
              </LinearGradient>
              <Text style={styles.featureTitle}>Camera{'\n'}Detector</Text>
              <Text style={styles.featureSub}>Scan for hidden cameras</Text>
            </GlassCard>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(main)/nearby-services')}
            style={styles.featureHalf}
          >
            <GlassCard variant="accent" style={styles.featureCard}>
              <LinearGradient
                colors={['#06b6d4', '#0891b2']}
                style={styles.featureIcon}
              >
                <MaterialCommunityIcons name="map-search-outline" size={24} color="#fff" />
              </LinearGradient>
              <Text style={styles.featureTitle}>Nearby{'\n'}Services</Text>
              <Text style={styles.featureSub}>Police, hospitals & more</Text>
            </GlassCard>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(main)/audio-recorder')}
            style={styles.featureHalf}
          >
            <GlassCard variant="accent" style={styles.featureCard}>
              <LinearGradient
                colors={['#ec4899', '#db2777']}
                style={styles.featureIcon}
              >
                <MaterialCommunityIcons name="microphone" size={24} color="#fff" />
              </LinearGradient>
              <Text style={styles.featureTitle}>Audio{'\n'}Recorder</Text>
              <Text style={styles.featureSub}>Record evidence</Text>
            </GlassCard>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(main)/alert-history')}
            style={styles.featureHalf}
          >
            <GlassCard variant="accent" style={styles.featureCard}>
              <LinearGradient
                colors={['#6366f1', '#4f46e5']}
                style={styles.featureIcon}
              >
                <MaterialCommunityIcons name="history" size={24} color="#fff" />
              </LinearGradient>
              <Text style={styles.featureTitle}>Alert{'\n'}History</Text>
              <Text style={styles.featureSub}>View past alerts</Text>
            </GlassCard>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(main)/behavior-monitor')}
            style={styles.featureHalf}
          >
            <GlassCard variant="accent" style={styles.featureCard}>
              <LinearGradient
                colors={['#14b8a6', '#0d9488']}
                style={styles.featureIcon}
              >
                <MaterialCommunityIcons name="brain" size={24} color="#fff" />
              </LinearGradient>
              <Text style={styles.featureTitle}>Behavior{'\n'}Monitor</Text>
              <Text style={styles.featureSub}>PhishSafe distress detection</Text>
            </GlassCard>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(main)/journey-monitor')}
            style={styles.featureHalf}
          >
            <GlassCard variant="accent" style={styles.featureCard}>
              <LinearGradient
                colors={['#a78bfa', '#7c3aed']}
                style={styles.featureIcon}
              >
                <MaterialCommunityIcons name="map-marker-path" size={24} color="#fff" />
              </LinearGradient>
              <Text style={styles.featureTitle}>Journey{'\n'}Monitor</Text>
              <Text style={styles.featureSub}>Track trips with auto-SOS</Text>
            </GlassCard>
          </Pressable>
        </View>

        {/* Safety Tip of the Day */}
        <GlassCard variant="elevated" style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <MaterialCommunityIcons name="lightbulb-on" size={20} color={tc.warning} />
            <Text style={styles.tipLabel}>Safety Tip</Text>
          </View>
          <Text style={styles.tipText}>
            Always share your live location with a trusted contact before taking a cab or ride late at night.
            Use HearMe's location sharing feature for quick access.
          </Text>
        </GlassCard>
      </ScrollView>
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {},
  greeting: {
    fontSize: 14,
    color: c.textMuted,
    fontWeight: '600',
  },
  userName: {
    fontSize: 28,
    fontWeight: '900',
    color: c.text,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  avatarBtn: {},
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(167,139,250,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  sirenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  sirenBannerText: {
    flex: 1,
    color: '#ef4444',
    fontWeight: '800',
    fontSize: 15,
  },
  sosContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: c.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
    paddingHorizontal: 4,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  featureHalf: {
    width: '47%',
    flexGrow: 1,
  },
  featureCard: {
    padding: 18,
  },
  featureIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: c.text,
    lineHeight: 20,
    marginBottom: 4,
  },
  featureSub: {
    fontSize: 12,
    color: c.textMuted,
  },
  tipCard: {
    padding: 18,
    marginBottom: 8,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  tipLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: c.warning,
  },
  tipText: {
    color: c.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  nbWrap: { marginBottom: 22 },
  nbCard: { padding: 0, overflow: 'hidden' },
  nbGrad: { padding: 16, gap: 14 },
  nbHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  nbIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nbTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nbTitle: {
    color: c.text,
    fontWeight: '800',
    fontSize: 16,
  },
  nbDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: 4,
  },
  nbState: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  nbSub: {
    color: c.textMuted,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  nbKpiRow: {
    flexDirection: 'row',
    gap: 8,
  },
  nbKpi: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  nbKpiLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nbKpiValue: {
    fontSize: 17,
    fontWeight: '800',
    color: c.text,
    marginTop: 2,
  },
  nbKpiUnit: {
    fontSize: 10,
    color: c.textSecondary,
  },
  checkInRow: {
    padding: 0,
  },
  checkInGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  checkInTitle: {
    color: c.text,
    fontWeight: '800',
    fontSize: 15,
  },
  checkInSub: {
    color: c.textMuted,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
});
