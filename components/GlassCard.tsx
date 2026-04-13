import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors, radii } from '../constants/theme';

type Props = ViewProps & {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'accent';
};

export function GlassCard({ children, style, variant = 'default', ...rest }: Props) {
  if (variant === 'accent') {
    return (
      <View style={[styles.card, styles.accentCard, style]} {...rest}>
        <LinearGradient
          colors={['rgba(167,139,250,0.12)', 'rgba(236,72,153,0.06)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        variant === 'elevated' && styles.elevated,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  elevated: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  accentCard: {
    borderColor: 'rgba(167,139,250,0.2)',
  },
});
