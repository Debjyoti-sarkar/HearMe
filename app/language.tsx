import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientBackground } from '../components/GradientBackground';
import { colors, radii } from '../constants/theme';
import { LANGUAGES, type LangCode, useLanguage } from '../lib/i18n';

export default function LanguageScreen() {
  const insets = useSafeAreaInsets();
  const { lang, setLang, T } = useLanguage();
  const [selected, setSelected] = useState<LangCode>(lang);

  const onContinue = async () => {
    await setLang(selected);
    router.replace('/login');
  };

  return (
    <GradientBackground>
      <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <LinearGradient
            colors={['#7c3aed', '#a78bfa']}
            style={styles.logoCircle}
          >
            <MaterialCommunityIcons name="translate" size={36} color="#fff" />
          </LinearGradient>
          <Text style={styles.title}>{T('chooseLanguage')}</Text>
          <Text style={styles.subtitle}>{T('selectPreferred')}</Text>
        </View>

        {/* Language Grid */}
        <FlatList
          data={LANGUAGES}
          keyExtractor={(item) => item.code}
          numColumns={2}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isSelected = item.code === selected;
            return (
              <Pressable
                onPress={() => setSelected(item.code)}
                style={[
                  styles.langCard,
                  isSelected && styles.langCardSelected,
                ]}
              >
                <View style={styles.scriptBadge}>
                  <Text style={[styles.scriptText, isSelected && styles.scriptTextSelected]}>
                    {item.script}
                  </Text>
                </View>
                <Text style={[styles.langName, isSelected && styles.langNameSelected]}>
                  {item.name}
                </Text>
                <Text style={styles.langNameEn}>{item.nameEn}</Text>
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <MaterialCommunityIcons name="check" size={14} color="#fff" />
                  </View>
                )}
              </Pressable>
            );
          }}
        />

        {/* Continue Button */}
        <Pressable onPress={onContinue}>
          <LinearGradient
            colors={['#7c3aed', '#a78bfa']}
            style={styles.continueBtn}
          >
            <Text style={styles.continueBtnText}>{T('continueBtn')}</Text>
            <MaterialCommunityIcons name="arrow-right" size={22} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  header: { alignItems: 'center', marginBottom: 20 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  gridContent: { paddingBottom: 16 },
  row: { justifyContent: 'space-between', marginBottom: 12 },
  langCard: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    alignItems: 'center',
    position: 'relative',
  },
  langCardSelected: {
    borderColor: colors.accentViolet,
    backgroundColor: 'rgba(167,139,250,0.12)',
  },
  scriptBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  scriptText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textMuted,
  },
  scriptTextSelected: {
    color: colors.accentViolet,
  },
  langName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  langNameSelected: {
    color: colors.accentViolet,
  },
  langNameEn: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentViolet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: radii.full,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
});
