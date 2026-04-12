import { useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import { colors, radii } from '../constants/theme';

const N = 6;

type Props = {
  value: string;
  onChange: (six: string) => void;
};

export function OtpInputRow({ value, onChange }: Props) {
  const clean = value.replace(/\D/g, '').slice(0, N);
  const refs = useRef<Array<TextInput | null>>([]);
  const [focused, setFocused] = useState(0);

  const digitAt = (i: number) => clean[i] ?? '';

  const apply = (next: string) => {
    onChange(next.replace(/\D/g, '').slice(0, N));
  };

  const onKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (e.nativeEvent.key !== 'Backspace') return;
    if (digitAt(index)) {
      apply(clean.slice(0, index) + clean.slice(index + 1));
    } else if (index > 0) {
      apply(clean.slice(0, index - 1) + clean.slice(index));
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.row}>
      {Array.from({ length: N }).map((_, i) => (
        <TextInput
          key={i}
          ref={(r) => {
            refs.current[i] = r;
          }}
          value={digitAt(i)}
          onChangeText={(t) => {
            const d = t.replace(/\D/g, '').slice(-1);
            if (!d) {
              apply(clean.slice(0, i) + clean.slice(i + 1));
              return;
            }
            apply(clean.slice(0, i) + d + clean.slice(i + 1));
            if (i < N - 1) refs.current[i + 1]?.focus();
          }}
          onKeyPress={(e) => onKeyPress(e, i)}
          onFocus={() => setFocused(i)}
          keyboardType="number-pad"
          maxLength={1}
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          style={[styles.cell, focused === i && styles.cellFocused]}
          selectionColor={colors.accentPink}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  cell: {
    flex: 1,
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    backgroundColor: colors.inputBg,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  cellFocused: {
    borderColor: colors.accentViolet,
    shadowColor: colors.accentViolet,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
