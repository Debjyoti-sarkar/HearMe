import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { loadLanguage } from '../lib/i18n';
import { useAuth } from '../providers/AuthProvider';
import { loadSettings } from '../lib/app-data';
import { isDemoAuthenticated } from '../lib/demo-auth';
import { useTheme, type ThemeColors } from '../providers/ThemeProvider';

export default function Index() {
  const { loading, session, profileComplete } = useAuth();
  const { colors: tc } = useTheme();
  const styles = useThemedStyles(makeStyles);
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
        <ActivityIndicator size="large" color={tc.accentViolet} />
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: c.bgTop,
  },
});
