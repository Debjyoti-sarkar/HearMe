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
import { colors, radii } from '../constants/theme';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function OutlineButton({ title, icon, disabled, style, ...rest }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) =>
        [
          styles.wrap,
          disabled && styles.dim,
          pressed && !disabled && { opacity: 0.92 },
          StyleSheet.flatten(style),
        ] as StyleProp<ViewStyle>
      }
      {...rest}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.inner}
      >
        {icon}
        <Text style={styles.text}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  text: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  dim: { opacity: 0.5 },
});
