import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useScreenAnnounce } from '../../hooks/useScreenAnnounce';

const COUNTDOWN_SEC = 8;

export default function FakeCallScreen() {
  useScreenAnnounce('screenFakeCall', 'hintFakeCall');
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'count' | 'ringing' | 'done'>('count');
  const [sec, setSec] = useState(COUNTDOWN_SEC);
  const pulse = useRef(new Animated.Value(1)).current;
  const ringPulse = useRef(new Animated.Value(0.5)).current;

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
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    const ringLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
    ringLoop.start();
    return () => {
      pulseLoop.stop();
      ringLoop.stop();
    };
  }, [phase, pulse, ringPulse]);

  const close = () => router.back();

  if (phase === 'count') {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Pressable onPress={close} style={styles.closeGhost}>
          <Text style={styles.closeTxt}>Cancel</Text>
        </Pressable>
        <View style={styles.countdownCircle}>
          <Text style={styles.countLabel}>Incoming call in</Text>
          <Text style={styles.big}>{sec}</Text>
          <Text style={styles.countUnit}>seconds</Text>
        </View>
        <Text style={styles.caption}>
          Hold your phone naturally. The screen will simulate a realistic incoming call that you can
          use as a cover to leave uncomfortable situations.
        </Text>
      </View>
    );
  }

  if (phase === 'ringing') {
    return (
      <LinearGradient colors={['#0a0118', '#1a1145', '#2d1b69']} style={styles.full}>
        <View style={[styles.ringTop, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.incoming}>Incoming call</Text>
          <Text style={styles.caller}>Mom</Text>
          <Text style={styles.callerSub}>Mobile</Text>
        </View>
        <View style={styles.ringMid}>
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <View style={styles.avatarOuter}>
              <Animated.View style={[styles.avatarRing, { opacity: ringPulse }]} />
              <LinearGradient colors={['#34d399', '#059669']} style={styles.avatarBig}>
                <MaterialCommunityIcons name="account" size={56} color="#fff" />
              </LinearGradient>
            </View>
          </Animated.View>
        </View>
        <View style={[styles.ringActions, { paddingBottom: insets.bottom + 28 }]}>
          <Pressable style={styles.decline} onPress={close}>
            <MaterialCommunityIcons name="phone-hangup" size={32} color="#fff" />
            <Text style={styles.actionLabel}>Decline</Text>
          </Pressable>
          <Pressable
            style={styles.answer}
            onPress={() => {
              setPhase('done');
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <MaterialCommunityIcons name="phone" size={32} color="#fff" />
            <Text style={styles.actionLabel}>Answer</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.doneIcon}>
        <LinearGradient colors={['#34d399', '#059669']} style={styles.doneCircle}>
          <MaterialCommunityIcons name="check" size={40} color="#fff" />
        </LinearGradient>
      </View>
      <Text style={styles.doneTitle}>You're covered</Text>
      <Text style={styles.doneBody}>
        This was a simulated call — no actual connection was made. Step away safely when you can.
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
  closeTxt: { color: 'rgba(248,250,252,0.55)', fontWeight: '700', fontSize: 16 },
  countdownCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    borderColor: 'rgba(167,139,250,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  countLabel: { color: 'rgba(248,250,252,0.5)', fontSize: 13, fontWeight: '600' },
  big: { fontSize: 72, fontWeight: '900', color: '#f8fafc', marginVertical: -4 },
  countUnit: { color: 'rgba(248,250,252,0.5)', fontSize: 13, fontWeight: '600' },
  caption: {
    textAlign: 'center',
    color: 'rgba(248,250,252,0.5)',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 300,
  },
  full: { flex: 1 },
  ringTop: { alignItems: 'center' },
  incoming: { color: 'rgba(248,250,252,0.6)', fontSize: 14, fontWeight: '600' },
  caller: { marginTop: 8, color: '#f8fafc', fontSize: 32, fontWeight: '900' },
  callerSub: { marginTop: 4, color: 'rgba(248,250,252,0.5)', fontSize: 14 },
  ringMid: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarOuter: { alignItems: 'center', justifyContent: 'center' },
  avatarRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: 'rgba(52,211,153,0.4)',
  },
  avatarBig: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#34d399',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  ringActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  decline: {
    alignItems: 'center',
    backgroundColor: '#ef4444',
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  answer: {
    alignItems: 'center',
    backgroundColor: '#22c55e',
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  actionLabel: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
    marginTop: 8,
    position: 'absolute',
    bottom: -22,
  },
  doneIcon: { marginBottom: 24 },
  doneCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#34d399',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  doneTitle: { fontSize: 26, fontWeight: '900', color: '#f8fafc', marginBottom: 12 },
  doneBody: {
    textAlign: 'center',
    color: 'rgba(248,250,252,0.6)',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 300,
  },
  doneBtn: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  doneBtnTxt: { color: '#f8fafc', fontWeight: '800', fontSize: 16 },
});
