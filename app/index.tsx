import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';
import { isDemoAuthenticated } from '../lib/demo-auth';
import { loadLanguage } from '../lib/i18n';
import { useAuth } from '../providers/AuthProvider';
import { loadSettings } from '../lib/app-data';

export default function Index() {
  const { loading, session, profileComplete } = useAuth();
  const [demoAuth, setDemoAuth] = useState(false);
  const [demoReady, setDemoReady] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(true);
  const [langSelected, setLangSelected] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [value, settings, lang] = await Promise.all([
        isDemoAuthenticated(),
        loadSettings(),
        loadLanguage(),
      ]);
      if (!mounted) return;
      setDemoAuth(value);
      setOnboardingDone(settings.onboardingComplete);
      setLangSelected(!!lang);
      setDemoReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading || !demoReady) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.accentViolet} />
      </View>
    );
  }

  if (!onboardingDone) return <Redirect href="/onboarding" />;
  if (!langSelected) return <Redirect href="/language" />;
  if (demoAuth) return <Redirect href="/(main)" />;
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
