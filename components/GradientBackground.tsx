import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors } from '../constants/theme';

type Props = ViewProps & {
  children?: React.ReactNode;
};

export function GradientBackground({ children, style, ...rest }: Props) {
  return (
    <View style={[styles.flex, style]} {...rest}>
      <LinearGradient
        colors={[colors.bgTop, colors.bgMid, colors.bgBottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
