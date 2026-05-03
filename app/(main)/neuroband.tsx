import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../components/GradientBackground';
import { GlassCard } from '../../components/GlassCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { OutlineButton } from '../../components/OutlineButton';
import { colors, radii } from '../../constants/theme';
import { useHearMe } from '../../providers/HearMeProvider';
import {
  getBleLoadError,
  getMockMode,
  isBleNativeAvailable,
  scanForBands,
  setMockMode,
  type MockMode,
  type ScanResult,
} from '../../lib/neuroband-ble';
import {
  isPskValid,
  formatPsk,
  normalizePsk,
  deriveSessionKey,
  generateNonceHex,
  persistPairingSecrets,
} from '../../lib/neuroband-pairing';
import {
  loadEvents,
  loadPairRecord,
  savePairRecord,
  clearPairRecord,
  appendEvent,
  type NeuroBandEvent,
  type NeuroBandPairRecord,
} from '../../lib/neuroband-storage';
import { ALL_MARKERS, type Marker } from '../../lib/neuroband-fusion';

const SENSITIVITY_OPTIONS: Array<{
  v: 'low' | 'normal' | 'high';
  label: string;
  hint: string;
}> = [
  { v: 'low', label: 'Low', hint: '3 of 5 markers — fewest false positives' },
  { v: 'normal', label: 'Normal', hint: '2 of 5 markers — recommended' },
  { v: 'high', label: 'High', hint: 'Tighter thresholds — fastest fire' },
];

const WORKOUT_OPTIONS = [30, 60, 120];

const MARKER_LABELS: Record<Marker, { name: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string }> = {
  hr: { name: 'Heart rate', icon: 'heart-pulse', color: colors.accentPink },
  gsr: { name: 'Skin sweat', icon: 'water', color: colors.accentCyan },
  temp: { name: 'Skin temp', icon: 'thermometer', color: colors.accentAmber },
  spo2: { name: 'Blood O₂', icon: 'molecule-co2', color: colors.accentEmerald },
  semg: { name: 'Muscle tension', icon: 'arm-flex', color: colors.accentViolet },
};

export default function NeuroBandScreen() {
  const insets = useSafeAreaInsets();
  const { settings, patchSettings, neuroBand, triggerNeuroBandSos } = useHearMe();

  const [pair, setPair] = useState<NeuroBandPairRecord | null>(null);
  const [events, setEvents] = useState<NeuroBandEvent[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [pairingTarget, setPairingTarget] = useState<ScanResult | null>(null);
  const [pskDraft, setPskDraft] = useState('');
  const [pskError, setPskError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const [mockModeLocal, setMockModeLocal] = useState<MockMode>(getMockMode());

  const bleAvailable = isBleNativeAvailable();
  const bleError = bleAvailable ? null : getBleLoadError();

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    void (async () => {
      const [p, e] = await Promise.all([loadPairRecord(), loadEvents()]);
      setPair(p);
      setEvents(e);
    })();
  }, []);

  useEffect(() => {
    if (neuroBand.connection !== 'connected') return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 800,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [neuroBand.connection, pulseAnim]);

  const onToggleEnabled = useCallback(
    async (v: boolean) => {
      await patchSettings({ neuroBandEnabled: v });
    },
    [patchSettings],
  );

  const onToggleMockMode = useCallback(
    async (v: boolean) => {
      await patchSettings({ neuroBandMockMode: v });
    },
    [patchSettings],
  );

  const onSetMockState = useCallback((m: MockMode) => {
    setMockMode(m);
    setMockModeLocal(m);
  }, []);

  const onSetSensitivity = useCallback(
    async (v: 'low' | 'normal' | 'high') => {
      await patchSettings({ neuroBandSensitivity: v });
    },
    [patchSettings],
  );

  const onStartWorkout = useCallback(
    async (minutes: number) => {
      const until = Date.now() + minutes * 60_000;
      await patchSettings({ neuroBandWorkoutModeUntil: until });
      void appendEvent({ ts: Date.now(), kind: 'workout-on', note: `${minutes}m` });
    },
    [patchSettings],
  );

  const onStopWorkout = useCallback(async () => {
    await patchSettings({ neuroBandWorkoutModeUntil: null });
    void appendEvent({ ts: Date.now(), kind: 'workout-off' });
  }, [patchSettings]);

  const onScan = useCallback(async () => {
    if (!bleAvailable) {
      Alert.alert(
        'Bluetooth not built into this app',
        'NeuroBand pairing needs a custom dev client. Run `expo prebuild` then `eas build --profile development`. Until then you can use Mock Mode below to test the fusion engine.',
      );
      return;
    }
    setScanning(true);
    setScanResults([]);
    try {
      await scanForBands((r) => {
        setScanResults((prev) => {
          if (prev.find((p) => p.peripheralId === r.peripheralId)) return prev;
          return [...prev, r];
        });
      }, 8000);
    } catch (e) {
      Alert.alert('Scan failed', e instanceof Error ? e.message : 'unknown');
    } finally {
      setScanning(false);
    }
  }, [bleAvailable]);

  const onConfirmPair = useCallback(async () => {
    if (!pairingTarget) return;
    if (!isPskValid(pskDraft)) {
      setPskError('PSK must be 12 letters/digits.');
      return;
    }
    setPairing(true);
    setPskError(null);
    try {
      const serial = pairingTarget.serialPrefix
        ? `${pairingTarget.serialPrefix}-${pairingTarget.peripheralId.slice(-6)}`
        : pairingTarget.peripheralId;
      const nonce = await generateNonceHex(16);
      const sessionKey = await deriveSessionKey(pskDraft, serial, nonce);
      await persistPairingSecrets(pskDraft, sessionKey);
      const record: NeuroBandPairRecord = {
        serial,
        peripheralId: pairingTarget.peripheralId,
        firmware: '1.0',
        pairedAt: Date.now(),
        lastSeenAt: Date.now(),
        lastCounter: 0,
      };
      await savePairRecord(record);
      await patchSettings({ neuroBandSerial: serial, neuroBandEnabled: true });
      void appendEvent({ ts: Date.now(), kind: 'paired', note: serial });
      setPair(record);
      setPairingTarget(null);
      setPskDraft('');
    } catch (e) {
      setPskError(e instanceof Error ? e.message : 'pairing failed');
    } finally {
      setPairing(false);
    }
  }, [pairingTarget, pskDraft, patchSettings]);

  const onUnpair = useCallback(() => {
    Alert.alert(
      'Unpair NeuroBand?',
      'You will need the PSK to pair the band again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              await clearPairRecord();
              await patchSettings({
                neuroBandSerial: null,
                neuroBandEnabled: false,
              });
              void appendEvent({ ts: Date.now(), kind: 'unpaired' });
              setPair(null);
            })(),
        },
      ],
    );
  }, [patchSettings]);

  const workoutRemaining = useMemo(() => {
    const until = settings.neuroBandWorkoutModeUntil;
    if (!until || Date.now() >= until) return 0;
    return Math.ceil((until - Date.now()) / 60_000);
  }, [settings.neuroBandWorkoutModeUntil]);

  const calibPct = Math.round(neuroBand.calibrationProgress * 100);
  const frame = neuroBand.lastFrame;

  return (
    <GradientBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>NeuroBand</Text>
            <Text style={styles.sub}>Bio-signal silent trigger</Text>
          </View>
        </View>

        {/* Connection / status hero */}
        <GlassCard variant="accent" style={styles.hero}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <LinearGradient
              colors={
                neuroBand.connection === 'connected'
                  ? ['#a78bfa', '#ec4899']
                  : ['#475569', '#64748b']
              }
              style={styles.heroIcon}
            >
              <MaterialCommunityIcons
                name="watch-variant"
                size={32}
                color="#fff"
              />
            </LinearGradient>
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroState}>
              {labelForState(neuroBand.connection)}
            </Text>
            <Text style={styles.heroDetail}>
              {pair
                ? `Paired: ${pair.serial} · fw ${pair.firmware}`
                : settings.neuroBandMockMode
                ? 'Mock mode — no hardware required'
                : 'No band paired'}
            </Text>
            {bleError && (
              <Text style={styles.heroWarn}>
                BLE module not loaded — using mock until next dev-client build.
              </Text>
            )}
          </View>
        </GlassCard>

        {/* Live signals — only meaningful when streaming */}
        {neuroBand.connection === 'connected' && frame && (
          <GlassCard style={styles.card}>
            <Text style={styles.section}>Live signals</Text>
            <View style={styles.kpiRow}>
              <Kpi label="HR" value={`${frame.hr}`} unit="bpm" />
              <Kpi label="GSR" value={frame.gsrUs.toFixed(1)} unit="µS" />
              <Kpi label="Skin T" value={frame.skinTempC.toFixed(1)} unit="°C" />
              <Kpi label="SpO₂" value={`${frame.spo2}`} unit="%" />
            </View>
            <Text style={styles.subtleNote}>
              Motion: {frame.motion} · sEMG: {frame.semg} · Battery: {frame.battery}%
            </Text>

            <View style={{ height: 12 }} />
            <Text style={styles.subSection}>Markers</Text>
            {ALL_MARKERS.map((m) => (
              <MarkerRow
                key={m}
                marker={m}
                fired={neuroBand.instant[m]}
                sustained={neuroBand.sustained[m]}
              />
            ))}
          </GlassCard>
        )}

        {/* Pair / Unpair */}
        {!pair ? (
          <GlassCard style={styles.card}>
            <Text style={styles.section}>Pair a band</Text>
            <Text style={styles.body}>
              Tap Scan, place the band within 1 m, then enter the 12-character
              PSK printed on the inside of the strap.
            </Text>
            <View style={{ height: 12 }} />
            <PrimaryButton
              title={scanning ? 'Scanning…' : 'Scan for NeuroBand'}
              onPress={onScan}
              disabled={scanning}
            />
            {scanResults.map((r) => (
              <Pressable
                key={r.peripheralId}
                onPress={() => setPairingTarget(r)}
                style={styles.scanRow}
              >
                <MaterialCommunityIcons
                  name="bluetooth"
                  size={20}
                  color={colors.accentViolet}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.scanName}>
                    {r.name ?? 'NeuroBand'}{' '}
                    {r.serialPrefix ? `· ${r.serialPrefix}…` : ''}
                  </Text>
                  <Text style={styles.scanMeta}>
                    {r.peripheralId.slice(0, 17)} · RSSI {r.rssi} dBm
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={colors.textMuted}
                />
              </Pressable>
            ))}
          </GlassCard>
        ) : (
          <GlassCard style={styles.card}>
            <Text style={styles.section}>Paired band</Text>
            <View style={styles.pairRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pairSerial}>{pair.serial}</Text>
                <Text style={styles.pairMeta}>
                  fw {pair.firmware} · paired{' '}
                  {new Date(pair.pairedAt).toLocaleDateString()}
                </Text>
                <Text style={styles.pairMeta}>
                  Last seen {Math.round((Date.now() - pair.lastSeenAt) / 1000)}s ago
                </Text>
              </View>
              <OutlineButton title="Unpair" onPress={onUnpair} />
            </View>
          </GlassCard>
        )}

        {/* Engine controls */}
        <GlassCard style={styles.card}>
          <Text style={styles.section}>Engine</Text>

          <Row
            title="NeuroBand monitoring"
            subtitle={
              settings.neuroBandEnabled
                ? 'Engine is armed — silent SOS active'
                : 'Engine disabled'
            }
            icon="shield-check"
            iconColor={colors.accentEmerald}
            value={settings.neuroBandEnabled}
            onValueChange={onToggleEnabled}
          />

          <Row
            title="Mock mode"
            subtitle="Generate a synthetic stream — no hardware needed"
            icon="cog-sync"
            iconColor={colors.accentCyan}
            value={settings.neuroBandMockMode}
            onValueChange={onToggleMockMode}
          />

          {settings.neuroBandMockMode && (
            <View style={styles.mockChips}>
              {(['calm', 'active', 'duress'] as const).map((m) => {
                const active = mockModeLocal === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => onSetMockState(m)}
                    style={[
                      styles.chip,
                      active && {
                        backgroundColor:
                          m === 'duress'
                            ? 'rgba(239,68,68,0.18)'
                            : 'rgba(167,139,250,0.18)',
                        borderColor:
                          m === 'duress' ? colors.danger : colors.accentViolet,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active && { color: colors.text, fontWeight: '700' },
                      ]}
                    >
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </GlassCard>

        {/* Sensitivity */}
        <GlassCard style={styles.card}>
          <Text style={styles.section}>Sensitivity</Text>
          {SENSITIVITY_OPTIONS.map((opt) => {
            const active = settings.neuroBandSensitivity === opt.v;
            return (
              <Pressable
                key={opt.v}
                onPress={() => void onSetSensitivity(opt.v)}
                style={[
                  styles.optRow,
                  active && {
                    borderColor: colors.accentViolet,
                    backgroundColor: 'rgba(167,139,250,0.08)',
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={active ? 'radiobox-marked' : 'radiobox-blank'}
                  size={22}
                  color={active ? colors.accentViolet : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optLabel}>{opt.label}</Text>
                  <Text style={styles.optHint}>{opt.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </GlassCard>

        {/* Workout mode */}
        <GlassCard style={styles.card}>
          <Text style={styles.section}>Workout mode</Text>
          <Text style={styles.body}>
            Suppress fusion engine for a set window. Capacitive override on the
            band still fires SOS.
          </Text>
          {workoutRemaining > 0 ? (
            <View style={styles.workoutActive}>
              <MaterialCommunityIcons
                name="run-fast"
                size={20}
                color={colors.warning}
              />
              <Text style={styles.workoutActiveText}>
                Active — {workoutRemaining} min remaining
              </Text>
              <OutlineButton title="Stop" onPress={() => void onStopWorkout()} />
            </View>
          ) : (
            <View style={styles.workoutChips}>
              {WORKOUT_OPTIONS.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => void onStartWorkout(m)}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{m} min</Text>
                </Pressable>
              ))}
            </View>
          )}
        </GlassCard>

        {/* Calibration */}
        <GlassCard style={styles.card}>
          <Text style={styles.section}>Calibration</Text>
          <View style={styles.progressOuter}>
            <View
              style={[
                styles.progressInner,
                { width: `${Math.max(2, calibPct)}%` },
              ]}
            />
          </View>
          <Text style={styles.body}>
            {calibPct < 100
              ? `${calibPct}% — keep wearing the band; fusion fires after baselines stabilise.`
              : 'Calibration complete — fusion engine is live.'}
          </Text>
        </GlassCard>

        {/* Manual test fire */}
        {settings.neuroBandEnabled && (
          <GlassCard style={styles.card}>
            <Text style={styles.section}>Test the silent path</Text>
            <Text style={styles.body}>
              Sends a real SMS to your trusted contacts marked with the
              "neuroband-test" tag. Use sparingly.
            </Text>
            <View style={{ height: 12 }} />
            <PrimaryButton
              title="Fire silent SOS"
              onPress={() =>
                Alert.alert(
                  'Send test silent SOS?',
                  'This will SMS every trusted contact.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Send',
                      style: 'destructive',
                      onPress: () => void triggerNeuroBandSos('neuroband-test'),
                    },
                  ],
                )
              }
            />
          </GlassCard>
        )}

        {/* Recent events */}
        <GlassCard style={styles.card}>
          <Text style={styles.section}>Recent events</Text>
          {events.length === 0 ? (
            <Text style={styles.body}>No events yet.</Text>
          ) : (
            events.slice(0, 8).map((e, i) => (
              <View key={`${e.ts}-${i}`} style={styles.eventRow}>
                <Text style={styles.eventTime}>
                  {new Date(e.ts).toLocaleTimeString()}
                </Text>
                <Text style={styles.eventKind}>{e.kind}</Text>
                <Text style={styles.eventNote} numberOfLines={1}>
                  {e.note ?? ''}
                </Text>
              </View>
            ))
          )}
        </GlassCard>
      </ScrollView>

      {/* Pairing modal */}
      <Modal
        visible={!!pairingTarget}
        animationType="slide"
        transparent
        onRequestClose={() => setPairingTarget(null)}
      >
        <View style={styles.modalBg}>
          <GlassCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter PSK</Text>
            <Text style={styles.body}>
              The 12-character code printed on the inside of the strap.
            </Text>
            <TextInput
              value={pskDraft}
              onChangeText={(v) => {
                setPskDraft(normalizePsk(v).slice(0, 12));
                setPskError(null);
              }}
              placeholder="ABCD-EFGH-JKMN"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.pskInput}
            />
            <Text style={styles.pskFormatted}>{formatPsk(pskDraft)}</Text>
            {pskError && <Text style={styles.pskError}>{pskError}</Text>}
            <View style={{ height: 12 }} />
            <PrimaryButton
              title={pairing ? 'Pairing…' : 'Pair'}
              disabled={pairing || !isPskValid(pskDraft)}
              onPress={onConfirmPair}
            />
            <View style={{ height: 8 }} />
            <OutlineButton title="Cancel" onPress={() => setPairingTarget(null)} />
          </GlassCard>
        </View>
      </Modal>
    </GradientBackground>
  );
}

// ---------- presentational ----------

function labelForState(s: string): string {
  switch (s) {
    case 'connected':
      return 'Connected — monitoring';
    case 'scanning':
      return 'Scanning…';
    case 'pairing':
      return 'Pairing…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'error':
      return 'Connection error';
    case 'disabled':
      return 'Engine disabled';
    case 'idle':
      return 'Idle — not connected';
    default:
      return s;
  }
}

function Kpi({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiUnit}>{unit}</Text>
    </View>
  );
}

function MarkerRow({
  marker,
  fired,
  sustained,
}: {
  marker: Marker;
  fired: boolean;
  sustained: number;
}) {
  const meta = MARKER_LABELS[marker];
  return (
    <View style={styles.markerRow}>
      <View
        style={[
          styles.markerIcon,
          { backgroundColor: meta.color + (fired ? '38' : '10') },
        ]}
      >
        <MaterialCommunityIcons name={meta.icon} size={18} color={meta.color} />
      </View>
      <Text style={styles.markerName}>{meta.name}</Text>
      <View style={styles.sustainBar}>
        <View
          style={[
            styles.sustainFill,
            {
              width: `${Math.min(100, sustained * 10)}%`,
              backgroundColor: fired ? meta.color : 'rgba(255,255,255,0.2)',
            },
          ]}
        />
      </View>
      <Text style={styles.sustainCount}>{sustained}/10</Text>
    </View>
  );
}

function Row({
  title,
  subtitle,
  icon,
  iconColor,
  value,
  onValueChange,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: iconColor + '18' }]}>
        <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(167,139,250,0.5)' }}
        thumbColor={value ? colors.accentPink : '#64748b'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { marginRight: 8, padding: 4 },
  title: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },

  hero: {
    flexDirection: 'row',
    gap: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroState: { fontSize: 16, fontWeight: '800', color: colors.text },
  heroDetail: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  heroWarn: { color: colors.warning, fontSize: 12, marginTop: 6 },

  card: { padding: 18, marginBottom: 12 },
  section: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  subSection: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  body: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  subtleNote: { color: colors.textSecondary, fontSize: 12, marginTop: 8 },

  kpiRow: { flexDirection: 'row', gap: 8 },
  kpi: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radii.md,
    padding: 10,
    alignItems: 'center',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  kpiUnit: { fontSize: 10, color: colors.textSecondary },

  markerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  markerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerName: { width: 110, color: colors.text, fontSize: 13, fontWeight: '600' },
  sustainBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  sustainFill: { height: 6, borderRadius: 3 },
  sustainCount: {
    fontSize: 11,
    color: colors.textMuted,
    width: 36,
    textAlign: 'right',
  },

  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    marginTop: 8,
  },
  scanName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  scanMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  pairRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pairSerial: { color: colors.text, fontWeight: '700', fontSize: 14 },
  pairMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  mockChips: { flexDirection: 'row', gap: 8, marginTop: 8 },
  workoutChips: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginVertical: 4,
  },
  optLabel: { color: colors.text, fontWeight: '700', fontSize: 14 },
  optHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  workoutActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  workoutActiveText: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 13 },

  progressOuter: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 8,
    overflow: 'hidden',
  },
  progressInner: { height: 8, backgroundColor: colors.accentViolet, borderRadius: 4 },

  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  eventTime: { color: colors.textMuted, fontSize: 11, width: 80 },
  eventKind: { color: colors.text, fontSize: 12, fontWeight: '700', width: 80 },
  eventNote: { flex: 1, color: colors.textSecondary, fontSize: 12 },

  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: { padding: 22 },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 8,
  },
  pskInput: {
    backgroundColor: colors.inputBg,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    fontFamily: 'Courier',
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    marginTop: 12,
  },
  pskFormatted: {
    color: colors.accentViolet,
    fontFamily: 'Courier',
    fontSize: 14,
    marginTop: 6,
    letterSpacing: 2,
  },
  pskError: { color: colors.danger, fontSize: 12, marginTop: 6 },
});
