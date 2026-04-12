import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const COUNTDOWN_SEC = 8;

/**
 * Decoy “incoming call” — common deterrence pattern in women-safety apps (e.g. Trio-style UX).
 * Does not place a real carrier call; use for situational cover only.
 */
export default function FakeCallScreen() {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'count' | 'ringing' | 'done'>('count');
  const [sec, setSec] = useState(COUNTDOWN_SEC);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (phase !== 'count') return;
    if (sec <= 0) {
      setPhase('ringing');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    const t = setTimeout(() => setSec((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, sec]);

  useEffect(() => {
    if (phase !== 'ringing') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  const close = () => router.back();

  if (phase === 'count') {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Pressable onPress={close} style={styles.closeGhost}>
          <Text style={styles.closeTxt}>Cancel</Text>
        </Pressable>
        <Text style={styles.pretitle}>Decoy call</Text>
        <Text style={styles.big}>{sec}</Text>
        <Text style={styles.caption}>
          Screen will simulate an incoming call. Hold the phone naturally — you can dismiss anytime.
        </Text>
      </View>
    );
  }

  if (phase === 'ringing') {
    return (
      <LinearGradient colors={['#0f172a', '#1e1b4b', '#312e81']} style={styles.full}>
        <View style={[styles.ringTop, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.incoming}>Incoming call</Text>
          <Text style={styles.caller}>Safety · HearMe</Text>
        </View>
        <View style={styles.ringMid}>
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <LinearGradient colors={['#34d399', '#059669']} style={styles.avatarBig}>
              <MaterialCommunityIcons name="account-voice" size={56} color="#fff" />
            </LinearGradient>
          </Animated.View>
        </View>
        <View style={[styles.ringActions, { paddingBottom: insets.bottom + 20 }]}>
          <Pressable style={styles.decline} onPress={close}>
            <MaterialCommunityIcons name="phone-hangup" size={32} color="#fff" />
            <Text style={styles.declineTxt}>Decline</Text>
          </Pressable>
          <Pressable
            style={styles.answer}
            onPress={() => {
              setPhase('done');
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <MaterialCommunityIcons name="phone" size={32} color="#fff" />
            <Text style={styles.answerTxt}>Answer</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <MaterialCommunityIcons name="check-decagram" size={56} color="#34d399" />
      <Text style={styles.doneTitle}>You’re covered</Text>
      <Text style={styles.doneBody}>
        This was a simulated call only — no carrier connection. Step away safely when you can.
      </Text>
      <Pressable onPress={close} style={styles.doneBtn}>
        <Text style={styles.doneBtnTxt}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeGhost: { position: 'absolute', top: 56, right: 24 },
  closeTxt: { color: 'rgba(248,250,252,0.65)', fontWeight: '700' },
  pretitle: { color: 'rgba(248,250,252,0.7)', fontSize: 16, marginBottom: 12 },
  big: { fontSize: 96, fontWeight: '900', color: '#f8fafc' },
  caption: {
    marginTop: 20,
    textAlign: 'center',
    color: 'rgba(248,250,252,0.65)',
    fontSize: 15,
    lineHeight: 22,
  },
  full: { flex: 1 },
  ringTop: { alignItems: 'center' },
  incoming: { color: 'rgba(248,250,252,0.75)', fontSize: 15, fontWeight: '600' },
  caller: { marginTop: 6, color: '#f8fafc', fontSize: 26, fontWeight: '800' },
  ringMid: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarBig: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  decline: {
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.95)',
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    gap: 4,
  },
  declineTxt: { color: '#fff', fontWeight: '800', fontSize: 12, marginTop: 4 },
  answer: {
    alignItems: 'center',
    backgroundColor: 'rgba(34,197,94,0.95)',
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    gap: 4,
  },
  answerTxt: { color: '#fff', fontWeight: '800', fontSize: 12, marginTop: 4 },
  doneTitle: { marginTop: 20, fontSize: 24, fontWeight: '900', color: '#f8fafc' },
  doneBody: {
    marginTop: 12,
    textAlign: 'center',
    color: 'rgba(248,250,252,0.7)',
    fontSize: 15,
    lineHeight: 22,
  },
  doneBtn: {
    marginTop: 28,
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  doneBtnTxt: { color: '#f8fafc', fontWeight: '800', fontSize: 16 },
});
