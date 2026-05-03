import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../components/GradientBackground';
import { GlassCard } from '../../components/GlassCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { radii } from '../../constants/theme';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { saveLocalAvatar, loadLocalAvatar, clearLocalAvatar } from '../../lib/app-data';
import { clearDemoAuth } from '../../lib/demo-auth';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme, type ThemeColors } from '../../providers/ThemeProvider';
import * as Session from '../../lib/session';

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [aadhaarLast4, setAadhaarLast4] = useState<string | null>(null);

  // Load profile data + local avatar + aadhaar
  useEffect(() => {
    (async () => {
      const [localAvatar, last4] = await Promise.all([
        loadLocalAvatar(),
        Session.getUidLast4(),
      ]);
      setAadhaarLast4(last4);
      if (profile) {
        setName(profile.name ?? '');
        setAge(profile.age?.toString() ?? '');
        setDob(profile.dob ?? '');
        setPhone(profile.phone ?? '');
        setLocation(profile.location ?? '');
        // Prefer remote URL, fall back to locally saved avatar
        setAvatarUrl(profile.avatar_url ?? localAvatar ?? '');
      } else if (localAvatar) {
        setAvatarUrl(localAvatar);
      }
    })();
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
    // Show local preview immediately and persist locally
    setAvatarUrl(asset.uri);
    await saveLocalAvatar(asset.uri);

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
        await saveLocalAvatar(data.publicUrl);
      }
    } catch {
      // Local preview is already set and persisted
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
    setEditing(false);
  };

  const onCancelEdit = () => {
    setName(profile?.name ?? '');
    setAge(profile?.age?.toString() ?? '');
    setDob(profile?.dob ?? '');
    setPhone(profile?.phone ?? '');
    setLocation(profile?.location ?? '');
    setAvatarUrl(profile?.avatar_url ?? '');
    setEditing(false);
  };

  const onSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await clearLocalAvatar();
          await clearDemoAuth();
          await signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  const displayName = profile?.name ?? 'User';
  const displayEmail = user?.email ?? profile?.email ?? '';
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <MaterialCommunityIcons name="chevron-left" size={28} color={tc.text} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            {!editing && (
              <Pressable onPress={() => setEditing(true)} hitSlop={12}>
                <MaterialCommunityIcons name="pencil-outline" size={22} color={tc.accentViolet} />
              </Pressable>
            )}
          </View>

          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <Pressable onPress={editing ? uploadAvatar : undefined}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarLarge} />
              ) : (
                <LinearGradient
                  colors={[tc.accentViolet, tc.accentPink]}
                  style={styles.avatarLarge}
                >
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </LinearGradient>
              )}
              {editing && (
                <View style={styles.cameraOverlay}>
                  <MaterialCommunityIcons name="camera" size={18} color="#fff" />
                </View>
              )}
            </Pressable>
            {!editing && (
              <>
                <Text style={styles.displayName}>{displayName}</Text>
                {displayEmail ? <Text style={styles.displayEmail}>{displayEmail}</Text> : null}
              </>
            )}
          </View>

          {editing ? (
            /* Edit Mode */
            <GlassCard variant="elevated" style={styles.card}>
              <Text style={styles.sectionTitle}>Edit Profile</Text>

              <Text style={styles.fieldLabel}>FULL NAME</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Full name"
                style={styles.input}
                placeholderTextColor={tc.textMuted}
              />

              <Text style={styles.fieldLabel}>AGE</Text>
              <TextInput
                value={age}
                onChangeText={(t) => setAge(t.replace(/\D/g, ''))}
                placeholder="Age"
                style={styles.input}
                keyboardType="number-pad"
                placeholderTextColor={tc.textMuted}
              />

              <Text style={styles.fieldLabel}>DATE OF BIRTH</Text>
              <TextInput
                value={dob}
                onChangeText={setDob}
                placeholder="YYYY-MM-DD"
                style={styles.input}
                placeholderTextColor={tc.textMuted}
              />

              <Text style={styles.fieldLabel}>PHONE</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone number"
                style={styles.input}
                keyboardType="phone-pad"
                placeholderTextColor={tc.textMuted}
              />

              <Text style={styles.fieldLabel}>LOCATION</Text>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="City, State"
                style={styles.input}
                placeholderTextColor={tc.textMuted}
              />

              <Pressable onPress={detectLocation} style={styles.detectBtn}>
                <MaterialCommunityIcons name="crosshairs-gps" size={16} color={tc.accentViolet} />
                <Text style={styles.detectText}>Auto-detect location</Text>
              </Pressable>

              {/* Aadhaar — read-only, shown if verified */}
              {aadhaarLast4 && (
                <>
                  <Text style={styles.fieldLabel}>AADHAAR NUMBER</Text>
                  <View style={styles.aadhaarRow}>
                    <MaterialCommunityIcons name="shield-check" size={18} color={tc.accentEmerald} />
                    <Text style={styles.aadhaarText}>XXXX XXXX {aadhaarLast4}</Text>
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  </View>
                </>
              )}

              <View style={styles.editActions}>
                <Pressable onPress={onCancelEdit} style={styles.cancelBtn}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <View style={styles.saveBtnWrap}>
                  <PrimaryButton
                    title="Save Changes"
                    onPress={onSave}
                    loading={saving}
                    disabled={!isValid}
                  />
                </View>
              </View>
            </GlassCard>
          ) : (
            /* View Mode */
            <>
              <GlassCard variant="elevated" style={styles.card}>
                <Text style={styles.sectionTitle}>Personal Information</Text>

                <ProfileField
                  icon="account"
                  label="Full Name"
                  value={profile?.name}
                />
                <ProfileField
                  icon="calendar"
                  label="Date of Birth"
                  value={profile?.dob}
                />
                <ProfileField
                  icon="numeric"
                  label="Age"
                  value={profile?.age?.toString()}
                />
                <ProfileField
                  icon="phone"
                  label="Phone"
                  value={profile?.phone}
                />
                <ProfileField
                  icon="email"
                  label="Email"
                  value={displayEmail}
                />
                <ProfileField
                  icon="map-marker"
                  label="Location"
                  value={profile?.location}
                  last={!aadhaarLast4}
                />
                {aadhaarLast4 && (
                  <ProfileField
                    icon="card-account-details-outline"
                    label="Aadhaar"
                    value={`XXXX XXXX ${aadhaarLast4}`}
                    badge="Verified"
                    last
                  />
                )}
              </GlassCard>

              <GlassCard variant="elevated" style={styles.card}>
                <Text style={styles.sectionTitle}>Account</Text>
                <ProfileField
                  icon="identifier"
                  label="User ID"
                  value={user?.id ? user.id.slice(0, 8) + '...' : 'N/A'}
                />
                <ProfileField
                  icon="clock-outline"
                  label="Member Since"
                  value={
                    profile?.created_at
                      ? new Date(profile.created_at).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : null
                  }
                  last
                />
              </GlassCard>

              {/* Sign Out */}
              <Pressable
                onPress={onSignOut}
                style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.8 }]}
              >
                <MaterialCommunityIcons name="logout" size={20} color={tc.danger} />
                <Text style={styles.signOutText}>Sign Out</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

function ProfileField({
  icon,
  label,
  value,
  badge,
  last,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string | null | undefined;
  badge?: string;
  last?: boolean;
}) {
  const { colors: tc } = useTheme();
  const fieldStyles = useThemedStyles(makeFieldStyles);
  return (
    <View style={[fieldStyles.row, !last && fieldStyles.border]}>
      <View style={fieldStyles.iconWrap}>
        <MaterialCommunityIcons name={icon} size={18} color={tc.accentViolet} />
      </View>
      <View style={fieldStyles.info}>
        <Text style={fieldStyles.label}>{label}</Text>
        <View style={fieldStyles.valueRow}>
          <Text style={fieldStyles.value}>{value || 'Not set'}</Text>
          {badge && (
            <View style={fieldStyles.badge}>
              <MaterialCommunityIcons name="shield-check" size={12} color={tc.accentEmerald} />
              <Text style={fieldStyles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const makeFieldStyles = (c: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(167,139,250,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: c.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: c.text,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(52,211,153,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: c.accentEmerald,
  },
});

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    color: c.text,
    fontSize: 16,
    fontWeight: '600',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(167,139,250,0.4)',
  },
  avatarInitials: {
    fontSize: 40,
    fontWeight: '800',
    color: '#fff',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.accentViolet,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: c.bgTop,
  },
  displayName: {
    fontSize: 24,
    fontWeight: '900',
    color: c.text,
    marginTop: 12,
  },
  displayEmail: {
    fontSize: 14,
    color: c.textMuted,
    marginTop: 4,
  },
  card: {
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: c.text,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: c.textSecondary,
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.cardBorder,
    backgroundColor: c.inputBg,
    color: c.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  detectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  detectText: {
    color: c.accentViolet,
    fontWeight: '700',
    fontSize: 13,
  },
  aadhaarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(52,211,153,0.06)',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  aadhaarText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
    letterSpacing: 1.5,
  },
  verifiedBadge: {
    backgroundColor: 'rgba(52,211,153,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '800',
    color: c.accentEmerald,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  cancelText: {
    color: c.textMuted,
    fontWeight: '700',
    fontSize: 15,
  },
  saveBtnWrap: {
    flex: 1,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    backgroundColor: 'rgba(239,68,68,0.06)',
    marginTop: 4,
  },
  signOutText: {
    color: c.danger,
    fontWeight: '700',
    fontSize: 15,
  },
});
