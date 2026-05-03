import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';
import { loadLanguage } from '../lib/i18n';
import { useAuth } from '../providers/AuthProvider';
import { loadSettings } from '../lib/app-data';
import { isDemoAuthenticated } from '../lib/demo-auth';

export default function Index() {
  const { loading, session, profileComplete } = useAuth();
  const [onboardingDone, setOnboardingDone] = useState(true);
  const [langSelected, setLangSelected] = useState(true);
  const [demoAuth, setDemoAuth] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [settings, lang, demo] = await Promise.all([
        loadSettings(),
        loadLanguage(),
        isDemoAuthenticated(),
      ]);
      if (!mounted) return;
      setOnboardingDone(settings.onboardingComplete);
      setLangSelected(!!lang);
      setDemoAuth(demo);
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
  // Demo-authenticated users bypass the Supabase session check.
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
