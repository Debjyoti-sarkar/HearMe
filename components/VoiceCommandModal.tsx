/**
 * Voice command palette.
 *
 * Modal listing every CommandSpec from voice-guide. Tapping a row speaks its
 * label in the user's language and runs the command (navigate or action).
 *
 * Tap-driven on purpose: STT in Expo managed workflow is unreliable across
 * 22 locales, but the user can still "navigate by voice" — they hear every
 * command spoken back to them, learn the vocabulary, and any tap behaves as
 * an explicit voice-guide invocation.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, type ThemeColors } from '../providers/ThemeProvider';
import { useVoiceGuide } from '../providers/VoiceGuideProvider';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useLanguage } from '../lib/i18n';
import {
  COMMAND_TO_HINT,
  COMMAND_TO_LABEL,
  vt,
  type CommandSpec,
} from '../lib/voice-guide';

const TONE_GRADIENTS: Record<CommandSpec['tone'], readonly [string, string]> = {
  violet:  ['#a78bfa', '#7c3aed'],
  pink:    ['#ec4899', '#db2777'],
  blue:    ['#3b82f6', '#2563eb'],
  green:   ['#10b981', '#059669'],
  amber:   ['#f59e0b', '#d97706'],
  red:     ['#ef4444', '#dc2626'],
  cyan:    ['#06b6d4', '#0891b2'],
  indigo:  ['#6366f1', '#4f46e5'],
};

export function VoiceCommandModal() {
  const { paletteOpen, closePalette, runCommand, commands, speechAvailable } =
    useVoiceGuide();
  const { lang } = useLanguage();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const labels = useMemo(() => {
    return commands.map((c) => {
      const labelKey = COMMAND_TO_LABEL[c.command];
      const hintKey = COMMAND_TO_HINT[c.command];
      return {
        spec: c,
        label: vt(lang, labelKey),
        hint: hintKey ? vt(lang, hintKey) : null,
      };
    });
  }, [commands, lang]);

  return (
    <Modal
      visible={paletteOpen}
      animationType="slide"
      transparent
      onRequestClose={closePalette}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closePalette} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 12 },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <LinearGradient
                colors={['#a78bfa', '#ec4899']}
                style={styles.headerIconGrad}
              >
                <MaterialCommunityIcons name="microphone" size={22} color="#fff" />
              </LinearGradient>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{vt(lang, 'commandPaletteTitle')}</Text>
              <Text style={styles.headerSub}>{vt(lang, 'commandPaletteHint')}</Text>
            </View>
            <Pressable onPress={closePalette} hitSlop={10} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={tc.textMuted} />
            </Pressable>
          </View>

          {!speechAvailable && (
            <View style={styles.warnBox}>
              <MaterialCommunityIcons
                name="information-outline"
                size={16}
                color={tc.warning}
              />
              <Text style={styles.warnText}>{vt(lang, 'noSpeechEngine')}</Text>
            </View>
          )}

          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {labels.map(({ spec, label, hint }) => {
              const grad = TONE_GRADIENTS[spec.tone];
              return (
                <Pressable
                  key={spec.command}
                  onPress={() => runCommand(spec.command)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                >
                  <LinearGradient colors={grad} style={styles.rowIcon}>
                    <MaterialCommunityIcons
                      name={spec.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                      size={20}
                      color="#fff"
                    />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{label}</Text>
                    {hint && (
                      <Text style={styles.rowHint} numberOfLines={2}>
                        {hint}
                      </Text>
                    )}
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={tc.textMuted}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.bgTop,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderTopWidth: 1,
      borderColor: c.cardBorder,
      maxHeight: '88%',
      paddingHorizontal: 16,
      paddingTop: 6,
    },
    handleWrap: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    handle: {
      width: 44,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.cardBorder,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 6,
      paddingTop: 4,
      paddingBottom: 14,
    },
    headerIcon: {
      width: 44,
      height: 44,
    },
    headerIconGrad: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: c.text,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    headerSub: {
      color: c.textMuted,
      fontSize: 12,
      marginTop: 2,
      lineHeight: 16,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    warnBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 10,
      borderRadius: 12,
      backgroundColor: 'rgba(251,191,36,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(251,191,36,0.25)',
      marginHorizontal: 4,
      marginBottom: 12,
    },
    warnText: {
      color: c.warning,
      fontSize: 12,
      flex: 1,
      lineHeight: 16,
    },
    list: {
      paddingBottom: 4,
      gap: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    rowIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabel: {
      color: c.text,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: -0.1,
    },
    rowHint: {
      color: c.textMuted,
      fontSize: 12,
      marginTop: 2,
      lineHeight: 16,
    },
  });
