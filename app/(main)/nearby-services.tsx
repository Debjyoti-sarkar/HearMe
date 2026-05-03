import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../components/GradientBackground';
import { GlassCard } from '../../components/GlassCard';
import { radii } from '../../constants/theme';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useTheme, type ThemeColors } from '../../providers/ThemeProvider';

type Service = {
  id: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  query: string;
  gradient: [string, string];
};

const SERVICES: Service[] = [
  {
    id: 'police',
    icon: 'shield-account',
    title: 'Police Stations',
    subtitle: 'Find nearest police stations for help',
    query: 'police+station',
    gradient: ['#3b82f6', '#1d4ed8'],
  },
  {
    id: 'hospital',
    icon: 'hospital-building',
    title: 'Hospitals',
    subtitle: 'Emergency medical care nearby',
    query: 'hospital',
    gradient: ['#ef4444', '#dc2626'],
  },
  {
    id: 'pharmacy',
    icon: 'medical-bag',
    title: 'Pharmacies',
    subtitle: 'Medicine and first aid supplies',
    query: 'pharmacy',
    gradient: ['#10b981', '#059669'],
  },
  {
    id: 'fire',
    icon: 'fire-truck',
    title: 'Fire Stations',
    subtitle: 'Fire and rescue services',
    query: 'fire+station',
    gradient: ['#f97316', '#ea580c'],
  },
  {
    id: 'bus',
    icon: 'bus-stop-covered',
    title: 'Bus Stations',
    subtitle: 'Public transport nearby',
    query: 'bus+station',
    gradient: ['#8b5cf6', '#7c3aed'],
  },
  {
    id: 'atm',
    icon: 'cash-multiple',
    title: 'ATMs',
    subtitle: 'Cash withdrawal points',
    query: 'atm',
    gradient: ['#06b6d4', '#0891b2'],
  },
  {
    id: 'women-shelter',
    icon: 'home-heart',
    title: 'Women Shelters',
    subtitle: 'Safe houses and support centers',
    query: 'women+shelter+help+center',
    gradient: ['#ec4899', '#db2777'],
  },
  {
    id: 'embassy',
    icon: 'flag',
    title: 'Government Offices',
    subtitle: 'SDM, collector, and administration offices',
    query: 'government+office',
    gradient: ['#6366f1', '#4f46e5'],
  },
];

export default function NearbyServicesScreen() {
  const insets = useSafeAreaInsets();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [loading, setLoading] = useState<string | null>(null);

  const openNearby = async (service: Service) => {
    setLoading(service.id);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Enable location to find nearby services.');
        setLoading(null);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      const url = `https://www.google.com/maps/search/${service.query}/@${latitude},${longitude},14z`;
      await Linking.openURL(url);
    } catch {
      // Fallback without location
      const url = `https://www.google.com/maps/search/${service.query}/`;
      await Linking.openURL(url);
    }
    setLoading(null);
  };

  return (
    <GradientBackground>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={tc.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Nearby Services</Text>
        <View style={{ width: 28 }} />
      </View>

      <Text style={styles.intro}>
        Find help nearby — opens Google Maps with your current location to locate essential services.
      </Text>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {SERVICES.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => void openNearby(s)}
              disabled={loading === s.id}
              style={({ pressed }) => [
                styles.serviceCard,
                pressed && styles.pressed,
                loading === s.id && styles.loading,
              ]}
            >
              <GlassCard style={styles.cardInner}>
                <LinearGradient colors={s.gradient} style={styles.iconCircle}>
                  <MaterialCommunityIcons name={s.icon} size={28} color="#fff" />
                </LinearGradient>
                <Text style={styles.serviceTitle}>{s.title}</Text>
                <Text style={styles.serviceSub}>{s.subtitle}</Text>
                <View style={styles.openRow}>
                  <Text style={styles.openText}>Open Maps</Text>
                  <MaterialCommunityIcons name="open-in-new" size={14} color={tc.accentViolet} />
                </View>
              </GlassCard>
            </Pressable>
          ))}
        </View>

        <GlassCard style={styles.tip}>
          <MaterialCommunityIcons name="lightbulb-outline" size={20} color={tc.warning} />
          <Text style={styles.tipText}>
            Save important locations offline in Google Maps for areas with poor connectivity.
            Download offline maps for your regular routes.
          </Text>
        </GlassCard>
      </ScrollView>
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
  headerTitle: { fontSize: 20, fontWeight: '800', color: c.text },
  intro: {
    color: c.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  list: { paddingHorizontal: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  serviceCard: {
    width: '48%',
    flexGrow: 1,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  loading: { opacity: 0.5 },
  cardInner: {
    padding: 18,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  serviceTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: c.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  serviceSub: {
    fontSize: 11,
    color: c.textMuted,
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: 10,
  },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  openText: {
    fontSize: 12,
    fontWeight: '700',
    color: c.accentViolet,
  },
  tip: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    alignItems: 'flex-start',
  },
  tipText: {
    flex: 1,
    color: c.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
