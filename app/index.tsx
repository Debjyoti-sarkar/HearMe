import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';
import { isDemoAuthenticated } from '../lib/demo-auth';
import { useAuth } from '../providers/AuthProvider';

export default function Index() {
  const { loading, session, profileComplete } = useAuth();
  const [demoAuth, setDemoAuth] = useState(false);
  const [demoReady, setDemoReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const value = await isDemoAuthenticated();
      if (!mounted) return;
      setDemoAuth(value);
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
