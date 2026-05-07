/**
 * Behavior Monitor Screen
 * Shows real-time behavioral trust score, detected patterns, and session stats.
 * Adapted from PhishSafe SDK dashboard for personal safety context.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../components/GradientBackground';
import { GlassCard } from '../../components/GlassCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useScreenAnnounce } from '../../hooks/useScreenAnnounce';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useHearMe } from '../../providers/HearMeProvider';
import { useTheme, type ThemeColors } from '../../providers/ThemeProvider';

import {
  type BehaviorBaseline,
  type BehaviorSession,
  buildBaseline,
  createSession,
  endSession,
  getActiveSession,
  getSessionStats,
  loadBaseline,
  loadSessionHistory,
  saveActiveSession,
  saveBaseline,
  saveSessionToHistory,
  clearActiveSession,
} from '../../lib/behavior-tracker';
import {
  type TrustResult,
  calculateTrust,
  levelColor,
} from '../../lib/trust-engine';
import {
  type DetectionResult,
  getPrimaryDetection,
} from '../../lib/behavior-detector';
import {
  type BbaPrediction,
  hasEnoughSignal,
  predict as bbaPredict,
} from '../../lib/bba-model';

export default function BehaviorMonitorScreen() {
  useScreenAnnounce('screenBehaviorMonitor', 'hintBehaviorMonitor');
  const insets = useSafeAreaInsets();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { forceReauthChallenge } = useHearMe();
  const [session, setSession] = useState<BehaviorSession | null>(null);
  const [baseline, setBaseline] = useState<BehaviorBaseline | null>(null);
  const [trustResult, setTrustResult] = useState<TrustResult | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [bba, setBba] = useState<BbaPrediction | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load baseline + check for active session on mount
  useEffect(() => {
    (async () => {
      const [bl, history, active] = await Promise.all([
        loadBaseline(),
        loadSessionHistory(),
        getActiveSession(),
      ]);
      setBaseline(bl);
      setSessionCount(history.length);

      if (active) {
        setSession(active);
        setIsTracking(true);
        updateAnalysis(active, bl);
      }
    })();

    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, []);

  // Pulse animation for alert-level trust scores
  useEffect(() => {
    if (trustResult && trustResult.level === 'alert') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [trustResult?.level]);

  const updateAnalysis = useCallback(
    (sess: BehaviorSession, bl: BehaviorBaseline | null) => {
      const trust = calculateTrust(sess, bl);
      setTrustResult(trust);
      const det = getPrimaryDetection(sess, bl);
      setDetection(det);
      // Run the BBA model when there's enough signal — otherwise the score
      // is dominated by zero-padding and not meaningful.
      setBba(hasEnoughSignal(sess) ? bbaPredict(sess) : null);

      // Haptic on concerning detection
      if (trust.level === 'alert' || trust.level === 'suspect') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    },
    [],
  );

  const handleStartTracking = useCallback(async () => {
    const newSession = createSession();
    setSession(newSession);
    setIsTracking(true);
    await saveActiveSession(newSession);
    updateAnalysis(newSession, baseline);

    // Refresh analysis periodically
    refreshInterval.current = setInterval(async () => {
      const active = await getActiveSession();
      if (active) {
        updateAnalysis(active, baseline);
        setSession(active);
      }
    }, 5000);

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [baseline, updateAnalysis]);

  const handleStopTracking = useCallback(async () => {
    if (!session) return;

    if (refreshInterval.current) {
      clearInterval(refreshInterval.current);
      refreshInterval.current = null;
    }

    const finished = endSession(session);
    setSession(finished);
    setIsTracking(false);

    // Save to history & rebuild baseline
    await saveSessionToHistory(finished);
    await clearActiveSession();

    const history = await loadSessionHistory();
    setSessionCount(history.length);

    const newBaseline = buildBaseline(history);
    if (newBaseline) {
      await saveBaseline(newBaseline);
      setBaseline(newBaseline);
    }

    updateAnalysis(finished, newBaseline ?? baseline);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [session, baseline, updateAnalysis]);

  const handleResetBaseline = useCallback(() => {
    Alert.alert(
      'Reset Baseline?',
      'This will clear your behavioral profile. The system will need 3+ sessions to rebuild it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setBaseline(null);
            await saveBaseline({
              sessionsUsed: 0,
              avgTapDurationMs: 0,
              avgSwipeSpeedPxPerMs: 0,
              avgSessionDurationMs: 0,
              avgTapsPerSession: 0,
              avgSwipesPerSession: 0,
              tapZoneDistribution: {},
              topScreens: [],
              lastUpdated: Date.now(),
            });
          },
        },
      ],
    );
  }, []);

  const stats = session ? getSessionStats(session) : null;

  return (
    <GradientBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={tc.text} />
          </Pressable>
          <Text style={styles.title}>Behavior Monitor</Text>
          <View style={{ width: 40 }} />
        </View>

        <Text style={styles.subtitle}>
          PhishSafe-powered behavioral analysis for personal safety
        </Text>

        {/* Trust Score Circle */}
        <Animated.View
          style={[styles.scoreContainer, { transform: [{ scale: pulseAnim }] }]}
        >
          <LinearGradient
            colors={
              trustResult
                ? [trustResult.color + '30', trustResult.color + '10']
                : ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']
            }
            style={styles.scoreCircle}
          >
            <Text
              style={[
                styles.scoreNumber,
                trustResult && { color: trustResult.color },
              ]}
            >
              {trustResult ? trustResult.score : '--'}
            </Text>
            <Text style={styles.scoreLabel}>Trust Score</Text>
            {trustResult && (
              <View
                style={[
                  styles.levelBadge,
                  { backgroundColor: trustResult.color + '25' },
                ]}
              >
                <Text style={[styles.levelText, { color: trustResult.color }]}>
                  {trustResult.level.toUpperCase()}
                </Text>
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        {/* Detection Alert */}
        {detection && detection.type !== 'normal' && (
          <GlassCard variant="elevated" style={styles.alertCard}>
            <View style={styles.alertHeader}>
              <LinearGradient
                colors={['#ef4444', '#dc2626']}
                style={styles.alertIcon}
              >
                <MaterialCommunityIcons
                  name={detection.icon as any}
                  size={20}
                  color="#fff"
                />
              </LinearGradient>
              <View style={styles.alertContent}>
                <Text style={styles.alertTitle}>{detection.label}</Text>
                <Text style={styles.alertConfidence}>
                  {detection.confidence}% confidence
                </Text>
              </View>
            </View>
            <Text style={styles.alertDescription}>{detection.description}</Text>
            <View style={styles.alertSuggestion}>
              <MaterialCommunityIcons
                name="lightbulb-outline"
                size={14}
                color={tc.warning}
              />
              <Text style={styles.alertSuggestionText}>
                {detection.actionSuggestion}
              </Text>
            </View>
          </GlassCard>
        )}

        {detection && detection.type === 'normal' && isTracking && (
          <GlassCard variant="accent" style={styles.normalCard}>
            <View style={styles.normalRow}>
              <MaterialCommunityIcons
                name="shield-check"
                size={22}
                color={tc.success}
              />
              <Text style={styles.normalText}>
                Normal usage patterns detected
              </Text>
            </View>
          </GlassCard>
        )}

        {/* BBA model live score */}
        {isTracking && (
          <GlassCard variant="elevated" style={styles.bbaCard}>
            <View style={styles.bbaHeader}>
              <MaterialCommunityIcons
                name="brain"
                size={18}
                color={tc.accentViolet}
              />
              <Text style={styles.bbaTitle}>BBA fraud model</Text>
              {bba?.unusual && (
                <View style={styles.bbaBadge}>
                  <Text style={styles.bbaBadgeText}>UNUSUAL</Text>
                </View>
              )}
            </View>
            {bba ? (
              <>
                <View style={styles.bbaRow}>
                  <Text style={styles.bbaLabel}>Risk score</Text>
                  <Text
                    style={[
                      styles.bbaValue,
                      { color: bba.unusual ? tc.danger : tc.success },
                    ]}
                  >
                    {(bba.probability * 100).toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.bbaBarTrack}>
                  <View
                    style={[
                      styles.bbaBarFill,
                      {
                        width: `${Math.min(100, bba.probability * 100)}%`,
                        backgroundColor: bba.unusual ? tc.danger : tc.success,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.bbaThreshMark,
                      { left: `${bba.threshold * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.bbaFootnote}>
                  Re-auth fires when score &gt; {(bba.threshold * 100).toFixed(0)}%
                  · 19 features · on-device
                </Text>
              </>
            ) : (
              <Text style={styles.bbaIdle}>
                Need at least 8 s and 6 taps to score this session.
              </Text>
            )}
          </GlassCard>
        )}

        {/* Start/Stop Button */}
        <View style={styles.actionRow}>
          {!isTracking ? (
            <PrimaryButton
              title="Start Behavior Tracking"
              onPress={() => void handleStartTracking()}
            />
          ) : (
            <PrimaryButton
              title="Stop Tracking"
              variant="danger"
              onPress={() => void handleStopTracking()}
            />
          )}
        </View>

        {/* Manual re-auth test — verifies the gate UI without needing
            real unusual behaviour to occur. */}
        <Pressable
          onPress={() =>
            forceReauthChallenge(
              'Manual test of the re-auth gate from Behavior Monitor.',
            )
          }
          style={styles.testReauthBtn}
        >
          <MaterialCommunityIcons
            name="shield-key-outline"
            size={16}
            color={tc.warning}
          />
          <Text style={styles.testReauthText}>Test re-auth gate</Text>
        </Pressable>

        {/* Session Stats */}
        {stats && (
          <>
            <Text style={styles.sectionLabel}>SESSION STATS</Text>
            <View style={styles.statsGrid}>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue}>{stats.totalTaps}</Text>
                <Text style={styles.statLabel}>Taps</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue}>{stats.totalSwipes}</Text>
                <Text style={styles.statLabel}>Swipes</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue}>{stats.avgTapDurationMs}</Text>
                <Text style={styles.statLabel}>Avg Tap (ms)</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue}>
                  {stats.uniqueScreensVisited}
                </Text>
                <Text style={styles.statLabel}>Screens</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue}>
                  {Math.round(stats.sessionDurationMs / 1000)}s
                </Text>
                <Text style={styles.statLabel}>Duration</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue}>
                  {stats.avgSwipeSpeedPxPerMs}
                </Text>
                <Text style={styles.statLabel}>Swipe Speed</Text>
              </GlassCard>
            </View>
          </>
        )}

        {/* Behavior Flags */}
        {trustResult && trustResult.flags.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>BEHAVIOR FLAGS</Text>
            {trustResult.flags.map((flag, i) => (
              <GlassCard key={`flag-${flag.id}-${i}`} style={styles.flagCard}>
                <View style={styles.flagHeader}>
                  <View style={styles.flagDot}>
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor:
                            flag.penalty <= -10
                              ? tc.danger
                              : flag.penalty <= -6
                                ? tc.warning
                                : tc.info,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.flagContent}>
                    <Text style={styles.flagTitle}>{flag.label}</Text>
                    <Text style={styles.flagPenalty}>
                      {flag.penalty} points
                    </Text>
                  </View>
                </View>
                <Text style={styles.flagDetail}>{flag.detail}</Text>
              </GlassCard>
            ))}
          </>
        )}

        {/* Baseline Info */}
        <Text style={styles.sectionLabel}>BEHAVIORAL PROFILE</Text>
        <GlassCard variant="elevated" style={styles.baselineCard}>
          {baseline && baseline.sessionsUsed > 0 ? (
            <>
              <View style={styles.baselineRow}>
                <MaterialCommunityIcons
                  name="brain"
                  size={20}
                  color={tc.accentViolet}
                />
                <Text style={styles.baselineTitle}>
                  Baseline Active ({baseline.sessionsUsed} sessions)
                </Text>
              </View>
              <View style={styles.baselineStats}>
                <Text style={styles.baselineStat}>
                  Avg tap: {Math.round(baseline.avgTapDurationMs)}ms
                </Text>
                <Text style={styles.baselineStat}>
                  Avg swipe: {baseline.avgSwipeSpeedPxPerMs.toFixed(2)} px/ms
                </Text>
                <Text style={styles.baselineStat}>
                  Avg session: {Math.round(baseline.avgSessionDurationMs / 1000)}s
                </Text>
                <Text style={styles.baselineStat}>
                  Avg taps/session: {Math.round(baseline.avgTapsPerSession)}
                </Text>
              </View>
              <Pressable onPress={handleResetBaseline} style={styles.resetBtn}>
                <Text style={styles.resetText}>Reset Baseline</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.noBaseline}>
              <MaterialCommunityIcons
                name="brain"
                size={28}
                color={tc.textMuted}
              />
              <Text style={styles.noBaselineTitle}>
                Building Behavioral Profile
              </Text>
              <Text style={styles.noBaselineText}>
                {sessionCount < 3
                  ? `Need ${3 - sessionCount} more session${3 - sessionCount > 1 ? 's' : ''} to build your baseline.`
                  : 'Profile will be built after next session.'}
                {'\n'}Your normal interaction patterns will be learned to detect anomalies.
              </Text>
            </View>
          )}
        </GlassCard>

        {/* Info Card */}
        <GlassCard style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <MaterialCommunityIcons
              name="information"
              size={18}
              color={tc.info}
            />
            <Text style={styles.infoTitle}>How It Works</Text>
          </View>
          <Text style={styles.infoText}>
            Adapted from banking-grade PhishSafe technology, this feature monitors
            your tap patterns, swipe behavior, and screen navigation to build a
            behavioral fingerprint. It can detect if someone else is using your
            phone, if you're under duress, or if panic patterns emerge — and
            suggest safety actions accordingly.
          </Text>
          <Text style={styles.infoText}>
            All analysis is done locally on your device. No behavioral data is
            sent to any server.
          </Text>
        </GlassCard>

        {/* Total sessions tracker */}
        <Text style={styles.footerText}>
          {sessionCount} session{sessionCount !== 1 ? 's' : ''} recorded
        </Text>
      </ScrollView>
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: c.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: c.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },

  // Score circle
  scoreContainer: { alignItems: 'center', marginBottom: 24 },
  scoreCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  scoreNumber: {
    fontSize: 56,
    fontWeight: '900',
    color: c.text,
    letterSpacing: -2,
  },
  scoreLabel: {
    fontSize: 12,
    color: c.textMuted,
    fontWeight: '600',
    marginTop: -4,
  },
  levelBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
  },
  levelText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // Alert card
  alertCard: {
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertContent: { flex: 1 },
  alertTitle: { fontSize: 16, fontWeight: '800', color: c.danger },
  alertConfidence: { fontSize: 11, color: c.textMuted },
  alertDescription: { fontSize: 13, color: c.textMuted, lineHeight: 19, marginBottom: 10 },
  alertSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(251,191,36,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  alertSuggestionText: { fontSize: 12, color: c.warning, flex: 1 },

  // Normal card
  normalCard: { padding: 14, marginBottom: 16 },
  normalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  normalText: { fontSize: 14, fontWeight: '700', color: c.success },

  // BBA card
  bbaCard: { padding: 16, marginBottom: 16 },
  bbaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  bbaTitle: { fontSize: 14, fontWeight: '800', color: c.text, flex: 1 },
  bbaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.18)',
  },
  bbaBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: c.danger,
  },
  bbaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  bbaLabel: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
  bbaValue: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  bbaBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  bbaBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 4,
  },
  bbaThreshMark: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
    backgroundColor: c.warning,
    opacity: 0.7,
  },
  bbaFootnote: { fontSize: 11, color: c.textSecondary, lineHeight: 15 },
  bbaIdle: { fontSize: 12, color: c.textMuted, lineHeight: 18 },

  // Action
  actionRow: { marginBottom: 12 },
  testReauthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
    backgroundColor: 'rgba(251,191,36,0.08)',
    alignSelf: 'center',
    marginBottom: 24,
  },
  testReauthText: { fontSize: 12, color: c.warning, fontWeight: '700' },

  // Section
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: c.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    width: '30%',
    flexGrow: 1,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: c.text,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 10,
    color: c.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },

  // Flags
  flagCard: { padding: 14, marginBottom: 10 },
  flagHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  flagDot: { width: 20, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flagContent: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flagTitle: { fontSize: 14, fontWeight: '700', color: c.text },
  flagPenalty: { fontSize: 12, color: c.danger, fontWeight: '600' },
  flagDetail: { fontSize: 12, color: c.textMuted, lineHeight: 17, marginLeft: 30 },

  // Baseline
  baselineCard: { padding: 18, marginBottom: 20 },
  baselineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  baselineTitle: { fontSize: 15, fontWeight: '800', color: c.text },
  baselineStats: { gap: 4, marginBottom: 14 },
  baselineStat: { fontSize: 12, color: c.textMuted, lineHeight: 18 },
  resetBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  resetText: { fontSize: 12, color: c.danger, fontWeight: '600' },

  noBaseline: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  noBaselineTitle: { fontSize: 15, fontWeight: '800', color: c.text },
  noBaselineText: {
    fontSize: 12,
    color: c.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Info card
  infoCard: { padding: 16, marginBottom: 16 },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  infoTitle: { fontSize: 14, fontWeight: '800', color: c.info },
  infoText: { fontSize: 12, color: c.textMuted, lineHeight: 18, marginBottom: 8 },

  footerText: {
    fontSize: 11,
    color: c.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
});
