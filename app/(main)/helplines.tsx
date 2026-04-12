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
import { colors } from '../../constants/theme';
import { INDIA_HELPLINES, type Helpline } from '../../constants/helplines';

export default function HelplinesScreen() {
  const insets = useSafeAreaInsets();

  const dial = (n: string) => {
    void Linking.openURL(`tel:${n.replace(/\D/g, '')}`);
  };

  const renderItem: ListRenderItem<Helpline> = ({ item }) => (
    <Pressable onPress={() => dial(item.number)}>
      <GlassCard style={styles.card}>
        <View style={styles.row}>
          <LinearGradient
            colors={['rgba(52,211,153,0.45)', 'rgba(56,189,248,0.35)']}
            style={styles.iconRing}
          >
            <MaterialCommunityIcons name="phone-in-talk" size={22} color={colors.text} />
          </LinearGradient>
          <View style={styles.meta}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.sub}>{item.subtitle}</Text>
            <Text style={styles.num}>{item.number}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={26} color={colors.textMuted} />
        </View>
      </GlassCard>
    </Pressable>
  );

  return (
    <GradientBackground>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.headTitle}>Helplines</Text>
        <View style={{ width: 36 }} />
      </View>
      <Text style={styles.intro}>
        One-tap dial shortcuts inspired by public-safety patterns across the Trio reference apps
        (SheGuard, SafeGuardHer, LadyBuddy, WSafe, SheSecure).
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

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  back: { padding: 4 },
  headTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  intro: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  list: { paddingHorizontal: 20 },
  card: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, marginLeft: 14 },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  sub: { marginTop: 2, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  num: { marginTop: 6, fontSize: 18, fontWeight: '900', color: colors.accentViolet },
});
