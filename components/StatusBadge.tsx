import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/theme';

type Props = {
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'info';
};

const COLORS = {
  success: { bg: 'rgba(52,211,153,0.15)', text: colors.success, dot: colors.success },
  warning: { bg: 'rgba(251,191,36,0.15)', text: colors.warning, dot: colors.warning },
  danger: { bg: 'rgba(239,68,68,0.15)', text: colors.danger, dot: colors.danger },
  info: { bg: 'rgba(56,189,248,0.15)', text: colors.info, dot: colors.info },
};

export function StatusBadge({ label, variant = 'success' }: Props) {
  const c = COLORS[variant];
  return (
    <View style={[styles.wrap, { backgroundColor: c.bg }]}>
      <View style={[styles.dot, { backgroundColor: c.dot }]} />
      <Text style={[styles.text, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
