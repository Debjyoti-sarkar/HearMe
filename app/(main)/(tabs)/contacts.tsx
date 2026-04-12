import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '../../../components/GradientBackground';
import { GlassCard } from '../../../components/GlassCard';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { colors, radii } from '../../../constants/theme';
import type { EmergencyContact } from '../../../lib/types';
import { useHearMe } from '../../../providers/HearMeProvider';

export default function ContactsTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { ready, contacts, upsertContact, removeContact } = useHearMe();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<EmergencyContact | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const openNew = () => {
    setEditing(null);
    setName('');
    setPhone('');
    setModal(true);
  };

  const openEdit = (c: EmergencyContact) => {
    setEditing(c);
    setName(c.name);
    setPhone(c.phone);
    setModal(true);
  };

  const save = async () => {
    const nm = name.trim();
    const ph = phone.trim().replace(/\s/g, '');
    if (nm.length < 1 || ph.replace(/\D/g, '').length < 8) {
      Alert.alert('Check fields', 'Enter a name and a realistic phone number.');
      return;
    }
    const id = editing?.id ?? `c-${Date.now()}`;
    await upsertContact({ id, name: nm, phone: ph });
    setModal(false);
  };

  const confirmDelete = (c: EmergencyContact) => {
    Alert.alert('Remove contact?', `${c.name} will no longer receive alerts.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void removeContact(c.id),
      },
    ]);
  };

  if (!ready) {
    return <GradientBackground style={styles.flex} />;
  }

  return (
    <GradientBackground>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.title}>Trusted contacts</Text>
          <Text style={styles.sub}>People who receive SOS & location SMS.</Text>
        </View>
        <Pressable onPress={openNew} style={styles.fab}>
          <LinearGradient
            colors={[colors.accentPink, colors.accentRose]}
            style={styles.fabIn}
          >
            <MaterialCommunityIcons name="plus" size={26} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: tabBarHeight + 28 },
        ]}
        ListEmptyComponent={
          <GlassCard style={styles.empty}>
            <MaterialCommunityIcons
              name="account-heart-outline"
              size={48}
              color={colors.textMuted}
            />
            <Text style={styles.emptyTitle}>No contacts yet</Text>
            <Text style={styles.emptyTxt}>
              Tap + to add family or friends. Use full numbers with country code for best SMS
              delivery.
            </Text>
          </GlassCard>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openEdit(item)}>
            <GlassCard style={styles.card}>
              <View style={styles.row}>
                <LinearGradient
                  colors={['rgba(167,139,250,0.5)', 'rgba(236,72,153,0.35)']}
                  style={styles.avatar}
                >
                  <Text style={styles.avatarTxt}>
                    {item.name.trim().charAt(0).toUpperCase() || '?'}
                  </Text>
                </LinearGradient>
                <View style={styles.meta}>
                  <Text style={styles.nm}>{item.name}</Text>
                  <Text style={styles.ph}>{item.phone}</Text>
                </View>
                <Pressable
                  onPress={() => confirmDelete(item)}
                  hitSlop={12}
                  style={styles.del}
                >
                  <MaterialCommunityIcons
                    name="trash-can-outline"
                    size={22}
                    color={colors.accentRose}
                  />
                </Pressable>
              </View>
            </GlassCard>
          </Pressable>
        )}
      />

      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <GlassCard style={[styles.modalCard, { marginBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>{editing ? 'Edit contact' : 'New contact'}</Text>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Priya Sharma"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <Text style={styles.label}>Phone</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+91xxxxxxxxxx"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModal(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </Pressable>
              <PrimaryButton title="Save" onPress={() => void save()} style={{ flex: 1 }} />
            </View>
          </GlassCard>
        </View>
      </Modal>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '900', color: colors.text },
  sub: { marginTop: 4, color: colors.textMuted, fontSize: 14, maxWidth: 240 },
  fab: { borderRadius: 999, overflow: 'hidden', elevation: 6 },
  fabIn: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: 20 },
  card: { padding: 16, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { fontSize: 20, fontWeight: '800', color: '#fff' },
  meta: { flex: 1, marginLeft: 14 },
  nm: { fontSize: 17, fontWeight: '700', color: colors.text },
  ph: { marginTop: 2, color: colors.textMuted, fontSize: 14 },
  del: { padding: 8 },
  empty: { padding: 28, alignItems: 'center', marginTop: 20 },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: '800', color: colors.text },
  emptyTxt: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  modalCard: { padding: 22 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 16 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'center' },
  cancelBtn: { paddingVertical: 14, paddingHorizontal: 16 },
  cancelTxt: { color: colors.textMuted, fontWeight: '700' },
});
