import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../../components/GradientBackground';
import { GlassCard } from '../../../components/GlassCard';
import { OutlineButton } from '../../../components/OutlineButton';
import { colors } from '../../../constants/theme';
import { clearDemoAuth } from '../../../lib/demo-auth';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { useAuth } from '../../../providers/AuthProvider';
import { useHearMe } from '../../../providers/HearMeProvider';

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { ready } = useHearMe();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [sendingEmergency, setSendingEmergency] = useState(false);

  useEffect(() => {
    if (!profile) void refreshProfile();
  }, []);

  const runEmergency = () =>
    void (async () => {
      if (!isSupabaseConfigured) {
        Alert.alert('Supabase not configured', 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY, then restart Expo.');
        return;
      }
      if (!user) return;
      setSendingEmergency(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setSendingEmergency(false);
        Alert.alert('Permission needed', 'Enable location permission to trigger emergency logs.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({});
      const locationText = `${current.coords.latitude}, ${current.coords.longitude}`;
      const { error } = await supabase.from('emergency_logs').insert({
        user_id: user.id,
        location: locationText,
      });
      setSendingEmergency(false);
      if (error) {
        Alert.alert('Emergency log failed', error.message);
        return;
      }
      Alert.alert('Emergency alert sent', 'Your current location has been saved in emergency logs.');
    })();

  if (!ready) {
    return (
      <GradientBackground>
        <View style={[styles.center, { paddingTop: insets.top }]} />
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 12,
            paddingBottom: tabBarHeight + 28,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>Dashboard</Text>
            <Text style={styles.subBrand}>Welcome back, {profile?.name ?? 'User'}</Text>
          </View>
        </View>

        <GlassCard style={styles.card}>
          <View style={styles.profileRow}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar} />
            )}
            <View style={styles.profileInfo}>
              <Text style={styles.name}>{profile?.name ?? 'Unknown user'}</Text>
              <Text style={styles.detail}>{profile?.email ?? user?.email ?? 'No email'}</Text>
              <Text style={styles.detail}>{profile?.phone ?? 'No phone'}</Text>
              <Text style={styles.detail}>{profile?.location ?? 'No location'}</Text>
            </View>
          </View>
          <View style={styles.row2}>
            <View style={styles.half}>
              <OutlineButton
                title="Edit Profile"
                icon={<MaterialCommunityIcons name="account-edit" size={20} color={colors.text} />}
                onPress={() => router.push('/profile')}
              />
            </View>
            <View style={styles.half}>
              <OutlineButton
                title="Emergency"
                icon={<MaterialCommunityIcons name="alarm-light" size={20} color={colors.text} />}
                onPress={runEmergency}
                disabled={sendingEmergency}
              />
            </View>
          </View>
          <View style={styles.logoutWrap}>
            <OutlineButton
              title="Logout"
              icon={<MaterialCommunityIcons name="logout" size={20} color={colors.text} />}
              onPress={() =>
                void (async () => {
                  await clearDemoAuth();
                  await signOut();
                })()
              }
            />
          </View>
        </GlassCard>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  brand: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  subBrand: { marginTop: 4, color: colors.textMuted, fontSize: 14 },
  card: { padding: 16 },
  profileRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 18 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  profileInfo: { flex: 1 },
  name: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  detail: { color: colors.textMuted, fontSize: 13, marginBottom: 3 },
  row2: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  logoutWrap: { marginTop: 12 },
});
