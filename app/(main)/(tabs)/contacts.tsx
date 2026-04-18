import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Contacts from 'expo-contacts';
import * as Haptics from 'expo-haptics';
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
import { useAccessibility } from '../../../providers/AccessibilityProvider';
import { useHearMe } from '../../../providers/HearMeProvider';

const AVATAR_COLORS: [string, string][] = [
  ['#7c3aed', '#a78bfa'],
  ['#ec4899', '#f472b6'],
  ['#06b6d4', '#22d3ee'],
  ['#10b981', '#34d399'],
  ['#f59e0b', '#fbbf24'],
  ['#ef4444', '#f87171'],
];

export default function ContactsTab() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { ready, contacts, upsertContact, removeContact } = useHearMe();
  const { oneHandedShift, bodyText, headingText } = useAccessibility();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<EmergencyContact | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');

  const [pickingContact, setPickingContact] = useState(false);

  const pickFromPhone = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Contacts permission is required to import from your phone.');
      return;
    }
    // Close the add modal first to avoid collision
    setModal(false);
    setPickingContact(true);
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      sort: Contacts.SortTypes.FirstName,
    });
    setPickingContact(false);

    const withPhone = data.filter(
      (c) => c.name && c.phoneNumbers && c.phoneNumbers.length > 0,
    );

    if (withPhone.length === 0) {
      Alert.alert('No contacts', 'No contacts with phone numbers found on your device.');
      return;
    }

    setPhoneContacts(withPhone);
    setPhoneSearchQuery('');
    // Delay opening picker until add modal closes
    setTimeout(() => setPhonePickerModal(true), 350);
  };

  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [phonePickerModal, setPhonePickerModal] = useState(false);
  const [phoneSearchQuery, setPhoneSearchQuery] = useState('');

  const fillAndShowAddModal = (contactName: string, contactPhone: string) => {
    setName(contactName);
    setPhone(contactPhone);
    setEditing(null);
    setPhonePickerModal(false);
    // Delay opening add modal until picker modal animation finishes
    setTimeout(() => setModal(true), 350);
  };

  const selectPhoneContact = (contact: Contacts.Contact) => {
    const contactName = contact.name ?? '';
    const phones = contact.phoneNumbers ?? [];

    if (phones.length === 1) {
      fillAndShowAddModal(contactName, phones[0].number ?? '');
      return;
    }

    // Multiple numbers — let user pick
    Alert.alert(
      contactName,
      'Choose a phone number',
      [
        ...phones.map((p) => ({
          text: `${p.label ?? 'Phone'}: ${p.number ?? ''}`,
          onPress: () => {
            fillAndShowAddModal(contactName, p.number ?? '');
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const openNew = () => {
    setEditing(null);
    setName('');
    setPhone('');
    setRelation('');
    setModal(true);
  };

  const openEdit = (c: EmergencyContact) => {
    setEditing(c);
    setName(c.name);
    setPhone(c.phone);
    setRelation('');
    setModal(true);
  };

  const save = async () => {
    const nm = name.trim();
    const ph = phone.trim().replace(/\s/g, '');
    if (nm.length < 1 || ph.replace(/\D/g, '').length < 8) {
      Alert.alert('Check fields', 'Enter a name and a valid phone number with country code.');
      return;
    }
    const id = editing?.id ?? `c-${Date.now()}`;
    await upsertContact({ id, name: nm, phone: ph });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setModal(false);
  };

  const confirmDelete = (c: EmergencyContact) => {
    Alert.alert(
      'Remove contact?',
      `${c.name} will no longer receive emergency alerts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void removeContact(c.id),
        },
      ],
    );
  };

  if (!ready) return <GradientBackground style={{ flex: 1 }} />;

  return (
    <GradientBackground>
      <View style={[styles.header, { paddingTop: insets.top + 12 + oneHandedShift }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, headingText]}>Trusted Circle</Text>
          <Text style={[styles.sub, bodyText]}>
            {contacts.length === 0
              ? 'Add your emergency contacts'
              : `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} will receive SOS alerts`}
          </Text>
        </View>
        <Pressable onPress={openNew} style={styles.addBtn}>
          <LinearGradient
            colors={[colors.accentPink, colors.accentRose]}
            style={styles.addBtnGrad}
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
          <GlassCard variant="elevated" style={styles.empty}>
            <LinearGradient
              colors={['rgba(167,139,250,0.2)', 'rgba(236,72,153,0.1)']}
              style={styles.emptyIcon}
            >
              <MaterialCommunityIcons name="account-heart-outline" size={48} color={colors.accentViolet} />
            </LinearGradient>
            <Text style={styles.emptyTitle}>No contacts yet</Text>
            <Text style={styles.emptyText}>
              Add family or friends who should be notified during emergencies. Use full phone numbers
              with country code (+91) for reliable SMS delivery.
            </Text>
            <Pressable onPress={openNew}>
              <LinearGradient
                colors={[colors.accentViolet, colors.accentPink]}
                style={styles.addFirstBtn}
              >
                <MaterialCommunityIcons name="plus" size={20} color="#fff" />
                <Text style={styles.addFirstText}>Add First Contact</Text>
              </LinearGradient>
            </Pressable>
          </GlassCard>
        }
        renderItem={({ item, index }) => {
          const gradColors = AVATAR_COLORS[index % AVATAR_COLORS.length];
          return (
            <Pressable
              onPress={() => openEdit(item)}
              style={({ pressed }) => [pressed && styles.cardPressed]}
            >
              <GlassCard style={styles.card}>
                <View style={styles.cardRow}>
                  <LinearGradient colors={gradColors} style={styles.avatar}>
                    <Text style={styles.avatarTxt}>
                      {item.name.trim().charAt(0).toUpperCase() || '?'}
                    </Text>
                  </LinearGradient>
                  <View style={styles.meta}>
                    <Text style={styles.contactName}>{item.name}</Text>
                    <View style={styles.phoneRow}>
                      <MaterialCommunityIcons name="phone" size={14} color={colors.textMuted} />
                      <Text style={styles.contactPhone}>{item.phone}</Text>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <Pressable onPress={() => openEdit(item)} hitSlop={8} style={styles.actionBtn}>
                      <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.accentViolet} />
                    </Pressable>
                    <Pressable onPress={() => confirmDelete(item)} hitSlop={8} style={styles.actionBtn}>
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.accentRose} />
                    </Pressable>
                  </View>
                </View>
              </GlassCard>
            </Pressable>
          );
        }}
      />

      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <GlassCard variant="elevated" style={[styles.modalCard, { marginBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editing ? 'Edit Contact' : 'Add Contact'}
              </Text>
              <Pressable onPress={() => setModal(false)} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>

            {!editing && (
              <Pressable
                onPress={pickFromPhone}
                disabled={pickingContact}
                style={({ pressed }) => [styles.importBtn, pressed && { opacity: 0.8 }]}
              >
                <LinearGradient
                  colors={['rgba(167,139,250,0.12)', 'rgba(52,211,153,0.08)']}
                  style={styles.importBtnGrad}
                >
                  <MaterialCommunityIcons name="contacts" size={22} color={colors.accentViolet} />
                  <View style={styles.importBtnInfo}>
                    <Text style={styles.importBtnTitle}>
                      {pickingContact ? 'Loading contacts...' : 'Import from Phone'}
                    </Text>
                    <Text style={styles.importBtnSub}>Pick from your saved contacts</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
                </LinearGradient>
              </Pressable>
            )}

            <Text style={styles.label}>Full Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Priya Sharma"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              style={styles.input}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setModal(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </Pressable>
              <PrimaryButton title="Save Contact" onPress={() => void save()} style={{ flex: 1 }} />
            </View>
          </GlassCard>
        </View>
      </Modal>

      {/* Phone Contact Picker Modal */}
      <Modal visible={phonePickerModal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <GlassCard variant="elevated" style={[styles.pickerCard, { marginBottom: insets.bottom + 16, maxHeight: '75%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Contact</Text>
              <Pressable onPress={() => setPhonePickerModal(false)} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>

            <TextInput
              value={phoneSearchQuery}
              onChangeText={setPhoneSearchQuery}
              placeholder="Search contacts..."
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, styles.searchInput]}
            />

            <FlatList
              data={phoneContacts.filter((c) =>
                (c.name ?? '').toLowerCase().includes(phoneSearchQuery.toLowerCase()),
              )}
              keyExtractor={(item) => (item as any).id ?? item.name ?? String(Math.random())}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => {
                const gradColors = AVATAR_COLORS[index % AVATAR_COLORS.length];
                const firstPhone = item.phoneNumbers?.[0]?.number ?? '';
                return (
                  <Pressable
                    onPress={() => selectPhoneContact(item)}
                    style={({ pressed }) => [styles.pickerItem, pressed && { opacity: 0.7 }]}
                  >
                    <LinearGradient colors={gradColors} style={styles.pickerAvatar}>
                      <Text style={styles.pickerAvatarTxt}>
                        {(item.name ?? '?').charAt(0).toUpperCase()}
                      </Text>
                    </LinearGradient>
                    <View style={styles.pickerMeta}>
                      <Text style={styles.pickerName}>{item.name}</Text>
                      <Text style={styles.pickerPhone}>{firstPhone}</Text>
                    </View>
                    <MaterialCommunityIcons name="plus-circle-outline" size={22} color={colors.accentViolet} />
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.pickerEmpty}>No matching contacts</Text>
              }
            />
          </GlassCard>
        </View>
      </Modal>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerLeft: { flex: 1, marginRight: 16 },
  title: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  sub: { marginTop: 6, color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  addBtn: {
    borderRadius: radii.full,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: colors.accentPink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  addBtnGrad: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: 20 },
  card: { padding: 16, marginBottom: 10 },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { fontSize: 20, fontWeight: '800', color: '#fff' },
  meta: { flex: 1, marginLeft: 14 },
  contactName: { fontSize: 16, fontWeight: '800', color: colors.text },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  contactPhone: { color: colors.textMuted, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  empty: { padding: 32, alignItems: 'center', marginTop: 20 },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    maxWidth: 300,
  },
  addFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radii.full,
  },
  addFirstText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  modalCard: { padding: 24 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  cancelBtn: { paddingVertical: 14, paddingHorizontal: 16 },
  cancelTxt: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  // Import from phone button
  importBtn: {
    marginBottom: 18,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  importBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.15)',
    gap: 12,
  },
  importBtnInfo: { flex: 1 },
  importBtnTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  importBtnSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  // Phone contact picker modal
  pickerCard: { padding: 20 },
  searchInput: {
    marginBottom: 12,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  pickerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerAvatarTxt: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  pickerMeta: { flex: 1 },
  pickerName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  pickerPhone: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  pickerEmpty: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: 24,
  },
});
