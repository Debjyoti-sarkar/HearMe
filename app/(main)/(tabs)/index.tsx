import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
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
import { colors } from '../../../constants/theme';
import { useAuth } from '../../../providers/AuthProvider';
import { useHearMe } from '../../../providers/HearMeProvider';
import { generateSafetyCode } from '../../../lib/siren';
import { saveAlertRecord } from '../../../lib/alert-history';

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { ready, contacts, settings, executeSos, shareLocation, callEmergencyLine } = useHearMe();
  const { profile, refreshProfile } = useAuth();
  const [sosActive, setSosActive] = useState(false);

  useEffect(() => {
    if (!profile) void refreshProfile();
  }, []);

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

    setSosActive(false);

    Alert.alert(
      result.ok ? 'SOS Sent' : 'SOS Failed',
      result.ok
        ? `Safety Code: ${code}\nShare this code with responders to verify your identity.`
        : result.message,
    );
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
          { paddingTop: insets.top + 12, paddingBottom: tabBarHeight + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.userName}>{profile?.name ?? 'User'}</Text>
          </View>
          <Pressable onPress={() => router.push('/profile')} style={styles.avatarBtn}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <LinearGradient
                colors={[colors.accentViolet, colors.accentPink]}
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

        {/* SOS Button */}
        <View style={styles.sosContainer}>
          <SOSButton onPress={() => void handleSos()} disabled={sosActive} />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
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
              void shareLocation().then((r) => {
                Alert.alert(r.ok ? 'Sent' : 'Failed', r.message);
              });
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

        {/* Feature Cards */}
        <Text style={styles.sectionLabel}>SAFETY TOOLS</Text>
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
        </View>

        {/* Safety Tip of the Day */}
        <GlassCard variant="elevated" style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <MaterialCommunityIcons name="lightbulb-on" size={20} color={colors.warning} />
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

const styles = StyleSheet.create({
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
    color: colors.textMuted,
    fontWeight: '600',
  },
  userName: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
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
  sosContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
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
    color: colors.text,
    lineHeight: 20,
    marginBottom: 4,
  },
  featureSub: {
    fontSize: 12,
    color: colors.textMuted,
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
    color: colors.warning,
  },
  tipText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
});
