import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../components/GradientBackground';
import { GlassCard } from '../../components/GlassCard';
import { useScreenAnnounce } from '../../hooks/useScreenAnnounce';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useTheme, type ThemeColors } from '../../providers/ThemeProvider';
import { INDIA_HELPLINES, type Helpline } from '../../constants/helplines';

const GRADIENTS: Record<string, [string, string]> = {
  '112': ['#ef4444', '#dc2626'],
  '1091': ['#ec4899', '#db2777'],
  '181': ['#8b5cf6', '#7c3aed'],
  '139': ['#f59e0b', '#d97706'],
  '1075': ['#06b6d4', '#0891b2'],
  '1930': ['#6366f1', '#4f46e5'],
};

export default function HelplinesScreen() {
  useScreenAnnounce('screenHelplines', 'hintHelplines');
  const insets = useSafeAreaInsets();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const dial = (n: string) => {
    void Linking.openURL(`tel:${n.replace(/\D/g, '')}`);
  };

  const renderItem: ListRenderItem<Helpline> = ({ item }) => (
    <Pressable
      onPress={() => dial(item.number)}
      style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
    >
      <GlassCard style={styles.card}>
        <View style={styles.row}>
          <LinearGradient
            colors={GRADIENTS[item.id] || ['#10b981', '#059669']}
            style={styles.iconRing}
          >
            <MaterialCommunityIcons name="phone-in-talk" size={24} color="#fff" />
          </LinearGradient>
          <View style={styles.meta}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.sub}>{item.subtitle}</Text>
            <Text style={styles.num}>{item.number}</Text>
          </View>
          <View style={styles.callBtn}>
            <MaterialCommunityIcons name="phone" size={20} color={tc.success} />
          </View>
        </View>
      </GlassCard>
    </Pressable>
  );

  return (
    <GradientBackground>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={28} color={tc.text} />
        </Pressable>
        <Text style={styles.headTitle}>Emergency Helplines</Text>
        <View style={{ width: 36 }} />
      </View>
      <Text style={styles.intro}>
        One-tap dial to India's emergency services. Verified helpline numbers — always available 24/7.
      </Text>
      <FlatList
        data={INDIA_HELPLINES}
        keyExtractor={(h) => h.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 24 },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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
    marginBottom: 8,
  },
  back: { padding: 4 },
  headTitle: { fontSize: 20, fontWeight: '800', color: c.text },
  intro: {
    color: c.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  list: { paddingHorizontal: 20 },
  card: { padding: 18 },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  meta: { flex: 1, marginLeft: 16 },
  title: { fontSize: 16, fontWeight: '800', color: c.text },
  sub: { marginTop: 3, color: c.textMuted, fontSize: 12, lineHeight: 17 },
  num: { marginTop: 6, fontSize: 20, fontWeight: '900', color: c.accentViolet },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(52,211,153,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
