import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { radii } from '../constants/theme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import type { ThemeColors } from '../providers/ThemeProvider';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  icon?: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function OutlineButton({ title, icon, disabled, compact, style, ...rest }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) =>
        [
          styles.wrap,
          disabled && styles.dim,
          pressed && !disabled && styles.pressed,
          StyleSheet.flatten(style),
        ] as StyleProp<ViewStyle>
      }
      {...rest}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.03)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.inner, compact && styles.compact]}
      >
        {icon}
        <Text style={styles.text}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      borderRadius: radii.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 16,
      minHeight: 50,
    },
    compact: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      minHeight: 40,
    },
    text: {
      color: c.text,
      fontWeight: '700',
      fontSize: 15,
    },
    dim: { opacity: 0.4 },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  });
