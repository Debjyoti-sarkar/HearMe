import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';
import { loadLanguage } from '../lib/i18n';
import { useAuth } from '../providers/AuthProvider';
import { loadSettings } from '../lib/app-data';

export default function Index() {
  const { loading, session, profileComplete } = useAuth();
  const [onboardingDone, setOnboardingDone] = useState(true);
  const [langSelected, setLangSelected] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [settings, lang] = await Promise.all([loadSettings(), loadLanguage()]);
      if (!mounted) return;
      setOnboardingDone(settings.onboardingComplete);
      setLangSelected(!!lang);
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading || !ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.accentViolet} />
      </View>
    );
  }

  if (!onboardingDone) return <Redirect href="/onboarding" />;
  if (!langSelected) return <Redirect href="/language" />;
  if (!session) return <Redirect href="/login" />;
  if (!profileComplete) return <Redirect href="/profile" />;
  return <Redirect href="/(main)" />;
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgTop,
  },
});
