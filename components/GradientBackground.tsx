import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useTheme } from '../providers/ThemeProvider';

type Props = ViewProps & {
  children?: React.ReactNode;
  variant?: 'default' | 'dark' | 'warm';
};

export function GradientBackground({ children, style, variant = 'default', ...rest }: Props) {
  const { isDark, colors: tc } = useTheme();

  const VARIANTS = {
    default: [tc.bgTop, tc.bgMid, tc.bgBottom] as const,
    dark: isDark
      ? (['#020617', '#0a0118', '#1a1145'] as const)
      : (['#f0f0ff', '#e8e4f8', '#ddd6fe'] as const),
    warm: isDark
      ? (['#1a0a2e', '#2d1052', '#4a1942'] as const)
      : (['#fdf2f8', '#fce7f3', '#fbcfe8'] as const),
  };

  return (
    <View style={[styles.flex, style]} {...rest}>
      <LinearGradient
        colors={[...VARIANTS[variant]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
