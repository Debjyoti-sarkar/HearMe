import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../../components/GradientBackground';
import { GlassCard } from '../../../components/GlassCard';
import { OutlineButton } from '../../../components/OutlineButton';
import { colors, radii } from '../../../constants/theme';
import { maskPhone } from '../../../lib/phone';
import * as Session from '../../../lib/session';
import { useHearMe } from '../../../providers/HearMeProvider';

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { ready, contacts, settings, executeSos, shareLocation, callEmergencyLine } =
    useHearMe();
  const [busy, setBusy] = useState(false);
  const [phoneLabel, setPhoneLabel] = useState('');

  useEffect(() => {
    void Session.getPhone().then((p) => {
      if (p) setPhoneLabel(maskPhone(p));
    });
  }, []);

  const n = contacts.length;

  const runSos = () => {
    const go = () =>
      void (async () => {
        setBusy(true);
        const r = await executeSos();
        setBusy(false);
        Alert.alert(r.ok ? 'SOS' : 'Could not send', r.message);
      })();

    if (!settings.skipSosConfirm) {
      Alert.alert(
        'Send emergency alert?',
        'This texts all trusted contacts with your last known GPS link, and may call the emergency line if enabled in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send now', style: 'destructive', onPress: go },
        ],
      );
    } else {
      go();
    }
  };

  const runShare = () =>
    void (async () => {
      setBusy(true);
      const r = await shareLocation();
      setBusy(false);
      Alert.alert(r.ok ? 'Location' : 'Could not send', r.message);
    })();

  const runCall = () =>
    void (async () => {
      setBusy(true);
      await callEmergencyLine();
      setBusy(false);
    })();

  if (!ready) {
    return (
      <GradientBackground>
        <View style={[styles.center, { paddingTop: insets.top }]} />
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 12,
            paddingBottom: tabBarHeight + 28,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>HearMe</Text>
            {phoneLabel ? (
              <Text style={styles.subBrand}>{phoneLabel}</Text>
            ) : null}
          </View>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="account-group" size={18} color={colors.text} />
            <Text style={styles.badgeTxt}>{n} trusted</Text>
          </View>
        </View>

        <LinearGradient
          colors={['rgba(244,63,94,0.5)', 'rgba(109,40,217,0.45)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sosWrap}
        >
          <GlassCard style={styles.sosInner}>
            <Text style={styles.sosTitle}>Emergency SOS</Text>
            <Text style={styles.sosSub}>
              One tap sends SMS with a maps link to everyone you trust — plus optional call to{' '}
              {settings.emergencyNumber}.
            </Text>
            <Pressable
              onPress={runSos}
              disabled={busy || n === 0}
              style={({ pressed }) => [
                styles.sosBtnOuter,
                (busy || n === 0) && { opacity: 0.55 },
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              <LinearGradient
                colors={['#fb7185', '#e11d48']}
                style={styles.sosBtn}
              >
                {busy ? (
                  <Text style={styles.sosBtnTxt}>…</Text>
                ) : (
                  <Text style={styles.sosBtnTxt}>SOS</Text>
                )}
              </LinearGradient>
            </Pressable>
            {n === 0 ? (
              <Text style={styles.warn}>Add contacts in the Contacts tab first.</Text>
            ) : null}
          </GlassCard>
        </LinearGradient>

        <Text style={styles.section}>Quick actions</Text>
        <View style={styles.row2}>
          <View style={styles.half}>
            <OutlineButton
              title="Share location"
              icon={<MaterialCommunityIcons name="map-marker-radius" size={20} color={colors.text} />}
              onPress={runShare}
              disabled={busy || n === 0}
            />
          </View>
          <View style={styles.half}>
            <OutlineButton
              title="Call emergency"
              icon={<MaterialCommunityIcons name="phone-alert" size={20} color={colors.text} />}
              onPress={runCall}
              disabled={busy}
            />
          </View>
        </View>

        <Text style={styles.section}>Safety toolkit</Text>
        <Text style={styles.toolkitHint}>
          Inspired by decoy-call and helpline patterns across the Trio projects folder on GitHub.
        </Text>
        <View style={styles.row2}>
          <View style={styles.half}>
            <OutlineButton
              title="Helplines"
              icon={<MaterialCommunityIcons name="phone-dial" size={20} color={colors.text} />}
              onPress={() => router.push('/(main)/helplines')}
            />
          </View>
          <View style={styles.half}>
            <OutlineButton
              title="Decoy call"
              icon={<MaterialCommunityIcons name="phone-incoming" size={20} color={colors.text} />}
              onPress={() => router.push('/(main)/fake-call')}
            />
          </View>
        </View>

        <GlassCard style={styles.tipCard}>
          <View style={styles.tipHead}>
            <MaterialCommunityIcons name="lightning-bolt" size={22} color={colors.warning} />
            <Text style={styles.tipTitle}>Stay ready</Text>
          </View>
          <Text style={styles.tipBody}>
            Enable shake alerts in Settings for hands-free trigger (works best while the app is
            open). Test SMS monthly on a real device.
          </Text>
        </GlassCard>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  brand: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  subBrand: { marginTop: 4, color: colors.textMuted, fontSize: 14 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  badgeTxt: { color: colors.text, fontWeight: '700', fontSize: 13 },
  sosWrap: {
    borderRadius: radii.xl,
    padding: 2,
    marginBottom: 22,
  },
  sosInner: { padding: 22, backgroundColor: 'rgba(15,23,42,0.35)' },
  sosTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  sosSub: { marginTop: 8, color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  sosBtnOuter: {
    alignSelf: 'center',
    marginTop: 20,
    borderRadius: 999,
    elevation: 10,
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
  },
  sosBtn: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosBtnTxt: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  warn: { marginTop: 14, textAlign: 'center', color: colors.warning, fontSize: 13 },
  section: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
  },
  row2: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  half: { flex: 1 },
  toolkitHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: -6,
  },
  tipCard: { padding: 18 },
  tipHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  tipTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  tipBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
});
