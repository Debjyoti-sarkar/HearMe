import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../../components/GradientBackground';
import { GlassCard } from '../../../components/GlassCard';
import { useScreenAnnounce } from '../../../hooks/useScreenAnnounce';
import { useThemedStyles } from '../../../hooks/useThemedStyles';
import { useAccessibility } from '../../../providers/AccessibilityProvider';
import { useTheme, type ThemeColors } from '../../../providers/ThemeProvider';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Topic = {
  id: string;
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  gradient: [string, string];
  bullets: string[];
};

const TOPICS: Topic[] = [
  {
    id: 'street',
    title: 'Street Safety',
    icon: 'walk',
    gradient: ['#7c3aed', '#a78bfa'],
    bullets: [
      'Stay aware of exits, lit shops, and crosswalks you can move toward.',
      'Keep headphone volume low or use transparency mode to stay alert.',
      'If followed, move toward crowds and call someone you trust immediately.',
      'Walk confidently and make eye contact — it deters potential threats.',
      'Avoid isolated shortcuts, especially after dark.',
    ],
  },
  {
    id: 'travel',
    title: 'Rides & Travel',
    icon: 'car-outline',
    gradient: ['#ec4899', '#f472b6'],
    bullets: [
      'Share your HearMe location before boarding any ride.',
      'Always verify plate number and driver name against your booking app.',
      'Sit behind the driver — never in the front seat of cabs at night.',
      'Trust your instincts — cancel and rebook if something feels wrong.',
      'Keep your phone charged and a power bank handy during travel.',
    ],
  },
  {
    id: 'online',
    title: 'Online Safety',
    icon: 'web',
    gradient: ['#06b6d4', '#22d3ee'],
    bullets: [
      'Never share OTPs, CVV, or remote-desktop codes — banks will never ask.',
      'Pause before clicking "urgent" links; verify the sender independently.',
      'Use strong, unique passwords with biometric lock on your phone.',
      'Review social media privacy settings monthly — limit public visibility.',
      'Be cautious about sharing real-time location on social platforms.',
    ],
  },
  {
    id: 'home',
    title: 'Home & Campus',
    icon: 'home-city-outline',
    gradient: ['#10b981', '#34d399'],
    bullets: [
      'Agree on a safe word with flatmates for uncomfortable situations.',
      'Save campus security numbers and know lit walking routes.',
      'Keep a charged power bank and emergency cash in your go-bag.',
      'Install peepholes and chain locks — never open for unknown visitors.',
      'Share your schedule with a trusted person when living alone.',
    ],
  },
  {
    id: 'transit',
    title: 'Public Transport',
    icon: 'bus-side',
    gradient: ['#f59e0b', '#fbbf24'],
    bullets: [
      'Sit near the driver or guard on late buses; avoid empty coaches.',
      'Share live location with HearMe before boarding auto-rickshaws.',
      'If someone sits uncomfortably close, change seats at the next stop.',
      'Memorize or save the route number and vehicle registration.',
      'Keep belongings secure and avoid displaying expensive items.',
    ],
  },
  {
    id: 'digital',
    title: 'Device Security',
    icon: 'cellphone-lock',
    gradient: ['#ef4444', '#f87171'],
    bullets: [
      'Enable Find My Device so trusted people can help locate you.',
      'Review app location permissions monthly — revoke unused access.',
      'Use separate email for banking vs social to reduce phishing risk.',
      'Enable two-factor authentication on all important accounts.',
      'Regularly check for unknown apps or services running on your phone.',
    ],
  },
  {
    id: 'selfdefense',
    title: 'Self Defense',
    icon: 'karate',
    gradient: ['#8b5cf6', '#a78bfa'],
    bullets: [
      'Target vulnerable areas: eyes, nose, throat, groin, and shins.',
      'Use your voice — scream "FIRE" or "HELP" to attract attention.',
      'Carry legal self-defense items like a whistle or personal alarm.',
      'Practice basic moves: palm strike, knee kick, and elbow strike.',
      'Take a self-defense class — muscle memory is crucial in emergencies.',
    ],
  },
  {
    id: 'laws',
    title: 'Know Your Rights',
    icon: 'gavel',
    gradient: ['#6366f1', '#818cf8'],
    bullets: [
      'Section 354 IPC: Assault or criminal force on a woman — 1-5 years.',
      'Section 509 IPC: Word, gesture, or act to insult modesty of a woman.',
      'FIR is your right — police must register it. Refusal is punishable.',
      'Zero FIR can be filed at any police station regardless of jurisdiction.',
      'Women can call 112 or visit any police station 24/7 for help.',
    ],
  },
];

export default function SafetyTab() {
  useScreenAnnounce('screenSafety', 'hintSafety');
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { oneHandedShift, bodyText, headingText } = useAccessibility();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState<string | null>('street');

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => (o === id ? null : id));
  };

  return (
    <GradientBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16 + oneHandedShift, paddingBottom: tabBarHeight + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, headingText]}>Safety Hub</Text>
        <Text style={[styles.sub, bodyText]}>
          Comprehensive safety education for every situation
        </Text>

        <GlassCard variant="accent" style={styles.intro}>
          <LinearGradient
            colors={['rgba(167,139,250,0.3)', 'rgba(236,72,153,0.2)']}
            style={styles.introIcon}
          >
            <MaterialCommunityIcons name="shield-star" size={24} color={tc.accentViolet} />
          </LinearGradient>
          <View style={styles.introContent}>
            <Text style={styles.introTitle}>Stay Informed, Stay Safe</Text>
            <Text style={styles.introText}>
              Curated guidance from leading safety experts. Pair these habits with HearMe's
              SOS and trusted contacts for comprehensive protection.
            </Text>
          </View>
        </GlassCard>

        {TOPICS.map((t) => {
          const expanded = open === t.id;
          return (
            <GlassCard key={t.id} style={styles.topic}>
              <Pressable
                onPress={() => toggle(t.id)}
                style={[styles.topicHead, expanded && styles.topicHeadExpanded]}
              >
                <LinearGradient colors={t.gradient} style={styles.topicIconWrap}>
                  <MaterialCommunityIcons name={t.icon} size={22} color="#fff" />
                </LinearGradient>
                <View style={styles.topicMeta}>
                  <Text style={styles.topicTitle}>{t.title}</Text>
                  <Text style={styles.topicCount}>{t.bullets.length} tips</Text>
                </View>
                <MaterialCommunityIcons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={24}
                  color={tc.textMuted}
                />
              </Pressable>
              {expanded && (
                <View style={styles.bullets}>
                  {t.bullets.map((b, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <LinearGradient colors={t.gradient} style={styles.bulletDot} />
                      <Text style={[styles.bulletText, bodyText]}>{b}</Text>
                    </View>
                  ))}
                </View>
              )}
            </GlassCard>
          );
        })}
      </ScrollView>
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '900', color: c.text, letterSpacing: -0.5 },
  sub: { marginTop: 6, color: c.textMuted, fontSize: 14, marginBottom: 18 },
  intro: {
    flexDirection: 'row',
    gap: 14,
    padding: 18,
    marginBottom: 18,
    alignItems: 'flex-start',
  },
  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introContent: { flex: 1 },
  introTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: c.text,
    marginBottom: 4,
  },
  introText: {
    color: c.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  topic: { marginBottom: 10, overflow: 'hidden' },
  topicHead: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  topicHeadExpanded: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  topicIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicMeta: { flex: 1 },
  topicTitle: { fontSize: 15, fontWeight: '800', color: c.text },
  topicCount: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  bullets: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 6,
  },
  bulletText: { flex: 1, color: c.textMuted, fontSize: 14, lineHeight: 20 },
});
