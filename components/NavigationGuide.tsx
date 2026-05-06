/**
 * Navigation guide modal.
 *
 * First-launch walkthrough. Pops up after the user lands on the home screen
 * for the first time. Each step shows an icon, title and a one-paragraph
 * description in the user's chosen language. If the voice guide is enabled,
 * the description is also spoken aloud each step.
 *
 * Skip closes immediately. Done marks completion in AsyncStorage so the
 * guide only shows once. Settings → "Replay quick tour" calls `open()`
 * via the imperative ref returned from useNavigationGuide.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, type ThemeColors } from '../providers/ThemeProvider';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useLanguage } from '../lib/i18n';
import {
  hasCompletedNavGuide,
  markNavGuideCompleted,
  navStepText,
  navUiText,
  NAV_STEPS,
  resetNavGuide,
} from '../lib/nav-guide';
import { useVoiceGuide } from '../providers/VoiceGuideProvider';

export type NavigationGuideHandle = {
  /** Open the guide regardless of whether it has been seen. */
  open: () => void;
};

type Props = {
  /** Auto-show on mount if the guide has never been completed. Default true. */
  autoShow?: boolean;
};

export const NavigationGuide = forwardRef<NavigationGuideHandle, Props>(
  ({ autoShow = true }, ref) => {
    const { lang } = useLanguage();
    const { speak, stop, settings: voiceSettings } = useVoiceGuide();
    const { colors: tc } = useTheme();
    const styles = useThemedStyles(makeStyles);
    const insets = useSafeAreaInsets();

    const [visible, setVisible] = useState(false);
    const [stepIdx, setStepIdx] = useState(0);
    const fade = useState(new Animated.Value(0))[0];

    const step = NAV_STEPS[stepIdx];
    const stepText = useMemo(() => navStepText(lang, step.id), [lang, step.id]);

    // Auto-show only for users who haven't completed it.
    useEffect(() => {
      if (!autoShow) return;
      let alive = true;
      void hasCompletedNavGuide().then((seen) => {
        if (!alive) return;
        if (!seen) setVisible(true);
      });
      return () => {
        alive = false;
      };
    }, [autoShow]);

    useImperativeHandle(
      ref,
      () => ({
        open: () => {
          // Reset persisted flag too — replay should look fresh if the user
          // closes and reopens within the same session.
          void resetNavGuide();
          setStepIdx(0);
          setVisible(true);
        },
      }),
      [],
    );

    // Speak the current step's body when it changes (debounced via fade).
    useEffect(() => {
      if (!visible) {
        stop();
        return;
      }
      fade.setValue(0);
      Animated.timing(fade, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
      if (voiceSettings.enabled) {
        // Brief delay so the modal is on-screen before TTS starts.
        const t = setTimeout(() => {
          speak(stepText.title + '. ' + stepText.body);
        }, 200);
        return () => clearTimeout(t);
      }
      return undefined;
    }, [visible, stepIdx, stepText, voiceSettings.enabled, speak, stop, fade]);

    const close = useCallback(
      (markDone: boolean) => {
        stop();
        setVisible(false);
        if (markDone) void markNavGuideCompleted();
      },
      [stop],
    );

    const goNext = useCallback(() => {
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      if (stepIdx < NAV_STEPS.length - 1) {
        setStepIdx(stepIdx + 1);
      } else {
        close(true);
      }
    }, [stepIdx, close]);

    const goBack = useCallback(() => {
      if (stepIdx > 0) setStepIdx(stepIdx - 1);
    }, [stepIdx]);

    const isLast = stepIdx === NAV_STEPS.length - 1;

    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent
        onRequestClose={() => close(false)}
        statusBarTranslucent
      >
        <View style={styles.backdrop}>
          <View
            style={[
              styles.headerRow,
              { paddingTop: insets.top + 12 },
            ]}
          >
            <Text style={styles.headerLabel}>{navUiText(lang, 'navGuide')}</Text>
            <Pressable
              onPress={() => close(true)}
              hitSlop={12}
              style={styles.skipBtn}
            >
              <Text style={styles.skipTxt}>{navUiText(lang, 'skip')}</Text>
            </Pressable>
          </View>

          <Animated.View
            style={[
              styles.cardWrap,
              {
                opacity: fade,
                transform: [
                  {
                    translateY: fade.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.iconHalo}>
              <LinearGradient
                colors={step.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconCircle}
              >
                <MaterialCommunityIcons
                  name={step.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={56}
                  color="#fff"
                />
              </LinearGradient>
              <View
                style={[
                  styles.haloOrbA,
                  { backgroundColor: step.gradient[0] + '33' },
                ]}
              />
              <View
                style={[
                  styles.haloOrbB,
                  { backgroundColor: step.gradient[1] + '24' },
                ]}
              />
            </View>

            <Text style={styles.title}>{stepText.title}</Text>
            <Text style={styles.body}>{stepText.body}</Text>

            <Text style={styles.counter}>
              {stepIdx + 1} / {NAV_STEPS.length}
            </Text>
          </Animated.View>

          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, 16) + 16 },
            ]}
          >
            <View style={styles.dots}>
              {NAV_STEPS.map((_, i) => {
                const active = i === stepIdx;
                return (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      active && styles.dotActive,
                      active && {
                        backgroundColor: step.gradient[0],
                        width: 24,
                      },
                    ]}
                  />
                );
              })}
            </View>

            <View style={styles.btnRow}>
              <Pressable
                onPress={goBack}
                disabled={stepIdx === 0}
                style={({ pressed }) => [
                  styles.backBtn,
                  pressed && { opacity: 0.7 },
                  stepIdx === 0 && { opacity: 0.35 },
                ]}
              >
                <MaterialCommunityIcons name="arrow-left" size={18} color={tc.text} />
                <Text style={styles.backTxt}>{navUiText(lang, 'back')}</Text>
              </Pressable>

              <Pressable
                onPress={goNext}
                style={({ pressed }) => [
                  styles.nextBtn,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <LinearGradient
                  colors={step.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.nextGrad}
                >
                  <Text style={styles.nextTxt}>
                    {isLast ? navUiText(lang, 'startUsing') : navUiText(lang, 'next')}
                  </Text>
                  <MaterialCommunityIcons
                    name={isLast ? 'check' : 'arrow-right'}
                    size={20}
                    color="#fff"
                  />
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  },
);

NavigationGuide.displayName = 'NavigationGuide';

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: c.bgTop,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 22,
      paddingBottom: 4,
    },
    headerLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    skipBtn: {
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    skipTxt: {
      color: c.textMuted,
      fontSize: 14,
      fontWeight: '700',
    },
    cardWrap: {
      flex: 1,
      paddingHorizontal: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconHalo: {
      width: 180,
      height: 180,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
    },
    iconCircle: {
      width: 124,
      height: 124,
      borderRadius: 62,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 14 },
      elevation: 12,
    },
    haloOrbA: {
      position: 'absolute',
      width: 200,
      height: 200,
      borderRadius: 100,
      left: -10,
      top: -10,
      zIndex: -1,
    },
    haloOrbB: {
      position: 'absolute',
      width: 160,
      height: 160,
      borderRadius: 80,
      right: -8,
      bottom: -8,
      zIndex: -1,
    },
    title: {
      fontSize: 30,
      fontWeight: '900',
      color: c.text,
      letterSpacing: -0.6,
      textAlign: 'center',
      marginBottom: 14,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: c.textMuted,
      textAlign: 'center',
      maxWidth: 360,
    },
    counter: {
      marginTop: 22,
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
    },
    footer: {
      paddingHorizontal: 22,
      gap: 18,
    },
    dots: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.cardBorder,
    },
    dotActive: {
      width: 24,
    },
    btnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    backTxt: {
      color: c.text,
      fontSize: 14,
      fontWeight: '700',
    },
    nextBtn: {
      flex: 1,
      borderRadius: 16,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    nextGrad: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
    },
    nextTxt: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
  });
