import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors } from '../constants/theme';

type Props = ViewProps & {
  children?: React.ReactNode;
  variant?: 'default' | 'dark' | 'warm';
};

const VARIANTS = {
  default: [colors.bgTop, colors.bgMid, colors.bgBottom] as const,
  dark: ['#020617', '#0a0118', '#1a1145'] as const,
  warm: ['#1a0a2e', '#2d1052', '#4a1942'] as const,
};

export function GradientBackground({ children, style, variant = 'default', ...rest }: Props) {
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
