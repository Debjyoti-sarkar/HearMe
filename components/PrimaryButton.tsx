import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};
import { colors, radii } from '../constants/theme';

export function PrimaryButton({
  title,
  loading,
  disabled,
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
        colors={[colors.accentPink, colors.accentRose]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.text}>{title}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: colors.accentRose,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  gradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  text: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  dim: { opacity: 0.55 },
  pressed: { transform: [{ scale: 0.98 }] },
});
