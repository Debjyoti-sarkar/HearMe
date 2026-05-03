import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../components/GradientBackground';
import { GlassCard } from '../../components/GlassCard';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useTheme, type ThemeColors } from '../../providers/ThemeProvider';
import { clearAlertHistory, loadAlertHistory, type AlertRecord } from '../../lib/alert-history';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TYPE_META: Record<AlertRecord['type'], { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; color: string; gradient: [string, string] }> = {
  sos: { icon: 'alert-circle', label: 'SOS Alert', color: '#ef4444', gradient: ['#ef4444', '#dc2626'] },
  shake: { icon: 'vibrate', label: 'Shake Alert', color: '#f59e0b', gradient: ['#f59e0b', '#d97706'] },
  crash: { icon: 'car-emergency', label: 'Crash Detected', color: '#ec4899', gradient: ['#ec4899', '#db2777'] },
  manual: { icon: 'hand-pointing-right', label: 'Manual Alert', color: '#8b5cf6', gradient: ['#8b5cf6', '#7c3aed'] },
};

export default function AlertHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);

  const STATUS_COLORS: Record<AlertRecord['status'], string> = {
    sent: tc.success,
    failed: tc.danger,
    cancelled: tc.warning,
  };

  useEffect(() => {
    void loadAlertHistory().then(setAlerts);
  }, []);

  const handleClear = useCallback(() => {
    Alert.alert('Clear all history?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearAlertHistory();
          setAlerts([]);
        },
      },
    ]);
  }, []);

  return (
    <GradientBackground>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={tc.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Alert History</Text>
        {alerts.length > 0 ? (
          <Pressable onPress={handleClear} hitSlop={12}>
            <MaterialCommunityIcons name="delete-sweep-outline" size={24} color={tc.textMuted} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      {alerts.length > 0 && (
        <View style={styles.statsRow}>
          <GlassCard style={styles.statCard}>
            <Text style={styles.statValue}>{alerts.length}</Text>
            <Text style={styles.statLabel}>Total Alerts</Text>
          </GlassCard>
          <GlassCard style={styles.statCard}>
            <Text style={[styles.statValue, { color: tc.success }]}>
              {alerts.filter((a) => a.status === 'sent').length}
            </Text>
            <Text style={styles.statLabel}>Sent</Text>
          </GlassCard>
          <GlassCard style={styles.statCard}>
            <Text style={[styles.statValue, { color: tc.danger }]}>
              {alerts.filter((a) => a.status === 'failed').length}
            </Text>
            <Text style={styles.statLabel}>Failed</Text>
          </GlassCard>
        </View>
      )}

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="history" size={56} color={tc.textSecondary} />
            <Text style={styles.emptyTitle}>No alerts yet</Text>
            <Text style={styles.emptyText}>
              When you trigger an SOS, shake alert, or crash detection, it will appear here with
              full details.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta = TYPE_META[item.type];
          return (
            <GlassCard style={styles.alertCard}>
              <View style={styles.alertRow}>
                <LinearGradient colors={meta.gradient} style={styles.alertIcon}>
                  <MaterialCommunityIcons name={meta.icon} size={22} color="#fff" />
                </LinearGradient>
                <View style={styles.alertMeta}>
                  <View style={styles.alertTopRow}>
                    <Text style={styles.alertType}>{meta.label}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
                      <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.alertDate}>{formatDate(item.timestamp)}</Text>
                  {item.location ? (
                    <Text style={styles.alertLocation} numberOfLines={1}>
                      {item.location}
                    </Text>
                  ) : null}
                  <View style={styles.alertBottomRow}>
                    <Text style={styles.alertCode}>Code: {item.safetyCode}</Text>
                    <Text style={styles.alertContacts}>
                      {item.contactsNotified} contact{item.contactsNotified !== 1 ? 's' : ''} notified
                    </Text>
                  </View>
                </View>
              </View>
            </GlassCard>
          );
        }}
      />
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: c.text },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    color: c.text,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: c.textMuted,
    marginTop: 4,
  },
  list: { paddingHorizontal: 20 },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: c.text,
  },
  emptyText: {
    color: c.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  alertCard: {
    padding: 16,
    marginBottom: 10,
  },
  alertRow: {
    flexDirection: 'row',
    gap: 14,
  },
  alertIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertMeta: { flex: 1 },
  alertTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  alertType: {
    fontSize: 15,
    fontWeight: '800',
    color: c.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  alertDate: {
    color: c.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  alertLocation: {
    color: c.textSecondary,
    fontSize: 11,
    marginBottom: 6,
  },
  alertBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  alertCode: {
    color: c.accentViolet,
    fontSize: 12,
    fontWeight: '700',
  },
  alertContacts: {
    color: c.textMuted,
    fontSize: 12,
  },
});
