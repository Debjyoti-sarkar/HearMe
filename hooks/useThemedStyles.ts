import { useMemo } from 'react';
import { useTheme, type ThemeColors } from '../providers/ThemeProvider';

/**
 * Hook that produces a memoised StyleSheet against the current theme.
 *
 * Usage:
 *
 *   const makeStyles = (c: ThemeColors) =>
 *     StyleSheet.create({
 *       title: { color: c.text },
 *     });
 *
 *   function Screen() {
 *     const styles = useThemedStyles(makeStyles);
 *     return <Text style={styles.title}>…</Text>;
 *   }
 *
 * `makeStyles` MUST be defined at module scope, not inside the component —
 * otherwise the memo never hits and we re-create the StyleSheet every render.
 */
export function useThemedStyles<T>(factory: (c: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [factory, colors]);
}
