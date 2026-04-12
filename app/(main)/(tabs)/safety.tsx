import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../../components/GradientBackground';
import { GlassCard } from '../../../components/GlassCard';
import { colors, radii } from '../../../constants/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TOPICS = [
  {
    id: 'street',
    title: 'On the street',
    icon: 'walk' as const,
    bullets: [
      'Know exits, lit shops, and crosswalks you can step toward.',
      'Keep headphone volume low or use transparency mode.',
      'If you feel followed, move toward crowds and call someone you trust.',
    ],
  },
  {
    id: 'travel',
    title: 'Rides & travel',
    icon: 'car-outline' as const,
    bullets: [
      'Share your HearMe location SMS before you board.',
      'Match plate & driver name to your booking app.',
      'Pick a seat where you can exit quickly on night rides.',
    ],
  },
  {
    id: 'online',
    title: 'Online safety',
    icon: 'web' as const,
    bullets: [
      'Never share OTPs, CVV, or remote-desktop codes — banks will not ask.',
      'Pause before “urgent” links; verify the sender out-of-band.',
      'Use strong unique passwords and biometric phone lock.',
    ],
  },
  {
    id: 'home',
    title: 'Home & campus',
    icon: 'home-city-outline' as const,
    bullets: [
      'Agree a safe word with flatmates for uncomfortable guests.',
      'Save campus security numbers and lit walking routes.',
      'Keep a charged power bank and cash near your go-bag.',
    ],
  },
  {
    id: 'transit',
    title: 'Public transport & night travel',
    icon: 'bus-side' as const,
    bullets: [
      'Sit closer to the driver/guard on late buses; avoid empty last coaches.',
      'Share live location with HearMe before boarding cabs or auto-rickshaws.',
      'If someone sits too close, change seats at the next busy stop.',
    ],
  },
  {
    id: 'digital',
    title: 'Device & accounts',
    icon: 'cellphone-lock' as const,
    bullets: [
      'Turn on Find My Device / Google Find so trusted people can help if needed.',
      'Review app location permissions monthly; revoke unused access.',
      'Use separate email for banking vs social to reduce phishing blast radius.',
    ],
  },
];

export default function SafetyTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
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
          { paddingTop: insets.top + 16, paddingBottom: tabBarHeight + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Safety hub</Text>
        <Text style={styles.sub}>Education inspired by SafeGuardHer & SheSecure.</Text>

        <GlassCard style={styles.intro}>
          <MaterialCommunityIcons name="shield-star-outline" size={26} color={colors.accentViolet} />
          <Text style={styles.introTxt}>
            Curated guidance — not emergency dispatch. Pair these habits with HearMe SOS and trusted
            contacts.
          </Text>
        </GlassCard>

        {TOPICS.map((t) => {
          const expanded = open === t.id;
          return (
            <GlassCard key={t.id} style={styles.topic}>
              <Pressable onPress={() => toggle(t.id)} style={styles.topicHead}>
                <LinearGradient
                  colors={['rgba(167,139,250,0.35)', 'rgba(236,72,153,0.2)']}
                  style={styles.topicIcon}
                >
                  <MaterialCommunityIcons name={t.icon} size={24} color={colors.text} />
                </LinearGradient>
                <Text style={styles.topicTitle}>{t.title}</Text>
                <MaterialCommunityIcons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={26}
                  color={colors.textMuted}
                />
              </Pressable>
              {expanded ? (
                <View style={styles.bullets}>
                  {t.bullets.map((b) => (
                    <View key={b} style={styles.bulletRow}>
                      <View style={styles.dot} />
                      <Text style={styles.bulletTxt}>{b}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </GlassCard>
          );
        })}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '900', color: colors.text },
  sub: { marginTop: 6, color: colors.textMuted, fontSize: 14, marginBottom: 16 },
  intro: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  introTxt: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  topic: { marginBottom: 12, overflow: 'hidden' },
  topicHead: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  topicIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  bullets: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    backgroundColor: colors.accentViolet,
  },
  bulletTxt: { flex: 1, color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});
