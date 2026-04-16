import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useHearMe } from '../providers/HearMeProvider';
import * as Session from '../lib/session';
import { classifyPin } from '../lib/duress';

// Reveal sequence: type your normal PIN as a 4-digit number, then press "=".
// Type your duress PIN to silently re-fire the SOS pipeline (defence-in-depth).
// Anything else just behaves like a normal calculator.

type Op = '+' | '-' | '×' | '÷' | null;

export default function DisguiseScreen() {
  const { executeSos, unlock } = useHearMe();
  const [display, setDisplay] = useState('0');
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<Op>(null);
  const [overwrite, setOverwrite] = useState(true);

  const tryReveal = useCallback(
    async (entered: string) => {
      // Only consider 4-digit numeric entries.
      if (!/^\d{4}$/.test(entered)) return false;
      const normalPin = (await Session.getPin()) ?? '';
      if (!normalPin) return false;
      const kind = await classifyPin(entered, normalPin);
      if (kind === 'normal') {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          /* ignore */
        }
        unlock();
        router.replace('/(main)');
        return true;
      }
      if (kind === 'duress') {
        // Silent re-trigger — no UI hint.
        void executeSos();
        return true;
      }
      return false;
    },
    [executeSos, unlock],
  );

  const onDigit = (d: string) => {
    if (overwrite) {
      setDisplay(d);
      setOverwrite(false);
      return;
    }
    if (display.length >= 12) return;
    setDisplay(display === '0' ? d : display + d);
  };

  const onDecimal = () => {
    if (overwrite) {
      setDisplay('0.');
      setOverwrite(false);
      return;
    }
    if (!display.includes('.')) setDisplay(display + '.');
  };

  const compute = useCallback((a: number, b: number, op: Op): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
      default: return b;
    }
  }, []);

  const onOp = (op: Op) => {
    const value = parseFloat(display);
    if (accumulator !== null && pendingOp && !overwrite) {
      const result = compute(accumulator, value, pendingOp);
      setAccumulator(result);
      setDisplay(formatNumber(result));
    } else {
      setAccumulator(value);
    }
    setPendingOp(op);
    setOverwrite(true);
  };

  const onEquals = async () => {
    const revealed = await tryReveal(display);
    if (revealed) {
      // Calculator behavior continues so the screen looks normal post-reveal attempt.
      setDisplay('0');
      setAccumulator(null);
      setPendingOp(null);
      setOverwrite(true);
      return;
    }
    if (pendingOp === null || accumulator === null) return;
    const value = parseFloat(display);
    const result = compute(accumulator, value, pendingOp);
    setDisplay(formatNumber(result));
    setAccumulator(null);
    setPendingOp(null);
    setOverwrite(true);
  };

  const onClear = () => {
    setDisplay('0');
    setAccumulator(null);
    setPendingOp(null);
    setOverwrite(true);
  };

  const onSign = () => {
    if (display === '0') return;
    setDisplay(display.startsWith('-') ? display.slice(1) : '-' + display);
  };

  const onPercent = () => {
    const n = parseFloat(display);
    setDisplay(formatNumber(n / 100));
  };

  const Btn = ({ label, onPress, kind = 'num' }: {
    label: string;
    onPress: () => void;
    kind?: 'num' | 'fn' | 'op';
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        kind === 'fn' && s.fn,
        kind === 'op' && s.op,
        pressed && s.pressed,
      ]}
    >
      <Text style={[s.btnTxt, kind === 'fn' && s.fnTxt, kind === 'op' && s.opTxt]}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={s.displayWrap}>
        <Text style={s.display} numberOfLines={1} adjustsFontSizeToFit>
          {display}
        </Text>
      </View>

      <View style={s.pad}>
        <View style={s.row}>
          <Btn label="AC" kind="fn" onPress={onClear} />
          <Btn label="±" kind="fn" onPress={onSign} />
          <Btn label="%" kind="fn" onPress={onPercent} />
          <Btn label="÷" kind="op" onPress={() => onOp('÷')} />
        </View>
        <View style={s.row}>
          <Btn label="7" onPress={() => onDigit('7')} />
          <Btn label="8" onPress={() => onDigit('8')} />
          <Btn label="9" onPress={() => onDigit('9')} />
          <Btn label="×" kind="op" onPress={() => onOp('×')} />
        </View>
        <View style={s.row}>
          <Btn label="4" onPress={() => onDigit('4')} />
          <Btn label="5" onPress={() => onDigit('5')} />
          <Btn label="6" onPress={() => onDigit('6')} />
          <Btn label="-" kind="op" onPress={() => onOp('-')} />
        </View>
        <View style={s.row}>
          <Btn label="1" onPress={() => onDigit('1')} />
          <Btn label="2" onPress={() => onDigit('2')} />
          <Btn label="3" onPress={() => onDigit('3')} />
          <Btn label="+" kind="op" onPress={() => onOp('+')} />
        </View>
        <View style={s.row}>
          <Pressable
            onPress={() => onDigit('0')}
            style={({ pressed }) => [s.btn, s.zero, pressed && s.pressed]}
          >
            <Text style={s.btnTxt}>0</Text>
          </Pressable>
          <Btn label="." onPress={onDecimal} />
          <Btn label="=" kind="op" onPress={() => void onEquals()} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function formatNumber(n: number): string {
  if (!isFinite(n)) return 'Error';
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toFixed(8)).toString();
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  displayWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  display: {
    color: '#fff',
    fontSize: 80,
    fontWeight: '300',
  },
  pad: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zero: {
    flex: 2,
    aspectRatio: undefined,
    borderRadius: 999,
    alignItems: 'flex-start',
    paddingLeft: 32,
  },
  btnTxt: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '500',
  },
  fn: { backgroundColor: '#a5a5a5' },
  fnTxt: { color: '#000' },
  op: { backgroundColor: '#ff9500' },
  opTxt: { color: '#fff', fontSize: 36 },
  pressed: { opacity: 0.7 },
});
