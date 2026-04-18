import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { radii } from '../constants/theme';
import { useTheme } from '../providers/ThemeProvider';

type Props = ViewProps & {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'accent';
};

export function GlassCard({ children, style, variant = 'default', ...rest }: Props) {
  const { isDark, colors: tc } = useTheme();

  const cardStyle = {
    borderRadius: radii.xl,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    backgroundColor: tc.card,
  };

  const elevatedStyle = isDark
    ? {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderColor: 'rgba(255,255,255,0.16)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
      }
    : {
        backgroundColor: 'rgba(255,255,255,0.85)',
        borderColor: 'rgba(0,0,0,0.06)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 4,
      };

  if (variant === 'accent') {
    const accentBorder = isDark
      ? 'rgba(167,139,250,0.2)'
      : 'rgba(124,58,237,0.15)';
    return (
      <View style={[cardStyle, { borderColor: accentBorder }, style]} {...rest}>
        <LinearGradient
          colors={
            isDark
              ? ['rgba(167,139,250,0.12)', 'rgba(236,72,153,0.06)']
              : ['rgba(124,58,237,0.06)', 'rgba(219,39,119,0.04)']
          }
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
        cardStyle,
        variant === 'elevated' && elevatedStyle,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
