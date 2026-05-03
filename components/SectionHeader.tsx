import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '../hooks/useThemedStyles';
import type { ThemeColors } from '../providers/ThemeProvider';

type Props = {
  title: string;
  subtitle?: string;
};

export function SectionHeader({ title, subtitle }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { marginBottom: 16 },
    title: {
      fontSize: 28,
      fontWeight: '900',
      color: c.text,
      letterSpacing: -0.5,
    },
    subtitle: {
      marginTop: 6,
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
  });
