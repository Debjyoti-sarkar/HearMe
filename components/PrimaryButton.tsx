import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radii } from '../constants/theme';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  icon?: ReactNode;
  loading?: boolean;
  variant?: 'primary' | 'danger' | 'success';
  style?: StyleProp<ViewStyle>;
};

const GRADIENTS = {
  primary: [colors.accentPink, colors.accentRose] as const,
  danger: ['#dc2626', '#b91c1c'] as const,
  success: ['#059669', '#047857'] as const,
};

export function PrimaryButton({
  title,
  icon,
  loading,
  disabled,
  variant = 'primary',
  onPress,
  style,
  ...rest
}: Props) {
  const dim = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={dim}
      style={({ pressed }) =>
        [
          styles.wrap,
          dim && styles.dim,
          pressed && !dim && styles.pressed,
          style,
        ] as StyleProp<ViewStyle>
      }
      {...rest}
    >
      <LinearGradient
        colors={[...GRADIENTS[variant]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={styles.content}>
            {icon}
            <Text style={styles.text}>{title}</Text>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: colors.accentRose,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  gradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dim: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
});
