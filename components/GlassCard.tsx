import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors, radii } from '../constants/theme';

type Props = ViewProps & { children: React.ReactNode };

export function GlassCard({ children, style, ...rest }: Props) {
  return (
    <View style={[styles.card, style]} {...rest}>
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
});
