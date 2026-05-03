import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../components/GradientBackground';
import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { radii } from '../constants/theme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { useTheme, type ThemeColors } from '../providers/ThemeProvider';

export default function ProfileCompletionScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile, profileComplete } = useAuth();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [name, setName] = useState(profile?.name ?? '');
  const [age, setAge] = useState(profile?.age?.toString() ?? '');
  const [dob, setDob] = useState(profile?.dob ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [location, setLocation] = useState(profile?.location ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    if (profileComplete) router.replace('/(main)');
  }, [user, profileComplete]);

  useEffect(() => {
    setName(profile?.name ?? '');
    setAge(profile?.age?.toString() ?? '');
    setDob(profile?.dob ?? '');
    setPhone(profile?.phone ?? '');
    setLocation(profile?.location ?? '');
    setAvatarUrl(profile?.avatar_url ?? '');
  }, [profile]);

  const isValid = useMemo(() => {
    const parsedAge = Number.parseInt(age, 10);
    return (
      name.trim().length >= 2 &&
      Number.isInteger(parsedAge) &&
      parsedAge > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(dob) &&
      phone.trim().length >= 8 &&
      location.trim().length >= 3
    );
  }, [name, age, dob, phone, location]);

  const detectLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Location permission is required to auto-detect location.');
      return;
    }
    const coords = await Location.getCurrentPositionAsync({});
    const geocode = await Location.reverseGeocodeAsync(coords.coords);
    const g = geocode[0];
    const readable = g
      ? [g.city, g.region, g.country].filter(Boolean).join(', ')
      : `${coords.coords.latitude.toFixed(5)}, ${coords.coords.longitude.toFixed(5)}`;
    setLocation(readable);
  };

  const handlePickedAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    setAvatarUrl(asset.uri);

    if (!user || !isSupabaseConfigured) return;

    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, blob, {
        upsert: true,
        contentType: asset.mimeType ?? 'image/jpeg',
      });
      if (!error) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        setAvatarUrl(data.publicUrl);
      }
    } catch {
      // Local preview is already set
    }
  };

  const pickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Photo permission is required to choose a picture.');
      return;
    }
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (pick.canceled || !pick.assets[0]) return;
    await handlePickedAsset(pick.assets[0]);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Camera permission is required to take a picture.');
      return;
    }
    const pick = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (pick.canceled || !pick.assets[0]) return;
    await handlePickedAsset(pick.assets[0]);
  };

  const uploadAvatar = () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Gallery', onPress: pickFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onSave = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert('Supabase not configured', 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY, then restart Expo.');
      return;
    }
    if (!user || !isValid) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        name: name.trim(),
        age: Number.parseInt(age, 10),
        dob,
        phone: phone.trim(),
        location: location.trim(),
        avatar_url: avatarUrl || null,
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    await refreshProfile();
    router.replace('/(main)');
  };

  return (
    <GradientBackground>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 20,
        }}
      >
        <Text style={styles.title}>Complete your profile</Text>
        <Text style={styles.subTitle}>This unlocks your dashboard and emergency services.</Text>

        <GlassCard style={styles.card}>
          <View style={styles.avatarRow}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} /> : <View style={styles.avatar} />}
            <Pressable onPress={uploadAvatar} style={styles.pickButton}>
              <Text style={styles.pickText}>Upload photo</Text>
            </Pressable>
          </View>

          <TextInput value={name} onChangeText={setName} placeholder="Full name" style={styles.input} placeholderTextColor={tc.textMuted} />
          <TextInput value={age} onChangeText={(t) => setAge(t.replace(/\D/g, ''))} placeholder="Age" style={styles.input} keyboardType="number-pad" placeholderTextColor={tc.textMuted} />
          <TextInput value={dob} onChangeText={setDob} placeholder="DOB (YYYY-MM-DD)" style={styles.input} placeholderTextColor={tc.textMuted} />
          <TextInput value={phone} onChangeText={setPhone} placeholder="Phone number" style={styles.input} keyboardType="phone-pad" placeholderTextColor={tc.textMuted} />
          <TextInput value={location} onChangeText={setLocation} placeholder="Location" style={styles.input} placeholderTextColor={tc.textMuted} />

          <PrimaryButton title="Auto-detect location" onPress={detectLocation} style={styles.secondary} />
          <PrimaryButton title="Save profile" onPress={onSave} loading={saving} disabled={!isValid} />
        </GlassCard>
      </ScrollView>
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  title: { fontSize: 28, fontWeight: '900', color: c.text },
  subTitle: { color: c.textMuted, marginTop: 6, marginBottom: 16 },
  card: { padding: 16, gap: 10 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: c.cardBorder,
  },
  pickButton: {
    borderWidth: 1,
    borderColor: c.cardBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pickText: { color: c.text, fontWeight: '700' },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.cardBorder,
    backgroundColor: c.inputBg,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  secondary: { marginTop: 6, opacity: 0.95 },
});
