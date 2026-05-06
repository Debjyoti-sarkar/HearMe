/**
 * Floating microphone button — opens the voice command palette.
 *
 * Sits above the bottom tab bar. Hidden when the voice guide is disabled in
 * settings, so users who don't need it never see it.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { useVoiceGuide } from '../providers/VoiceGuideProvider';

type Props = {
  /** Extra bottom offset (e.g. tab bar height) so we sit above it. */
  bottomOffset?: number;
  /** Hide the button (optional override). */
  hidden?: boolean;
};

export function VoiceGuideButton({ bottomOffset = 0, hidden = false }: Props) {
  const { settings, openPalette, paletteOpen } = useVoiceGuide();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (paletteOpen) {
      pulse.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => {
        loop.stop();
        pulse.setValue(0);
      };
    }
    return undefined;
  }, [paletteOpen, pulse]);

  if (hidden || !settings.enabled) return null;

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.7],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0],
  });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: bottomOffset + 16 }]}
    >
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          openPalette();
        }}
        style={({ pressed }) => [styles.btnHit, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Open voice guide"
        hitSlop={10}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            { transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />
        <LinearGradient
          colors={['#a78bfa', '#ec4899']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          <MaterialCommunityIcons
            name={paletteOpen ? 'microphone' : 'microphone-outline'}
            size={26}
            color="#fff"
          />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const SIZE = 56;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 18,
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnHit: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btn: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#a78bfa',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  pulseRing: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: 'rgba(167,139,250,0.45)',
  },
});
