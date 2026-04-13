import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '../../constants/theme';
import { isDemoAuthenticated } from '../../lib/demo-auth';
import { useAuth } from '../../providers/AuthProvider';
import { HearMeProvider } from '../../providers/HearMeProvider';

export default function MainLayout() {
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
        <ActivityIndicator color={colors.accentViolet} size="large" />
      </View>
    );
  }

  if (demoAuth) {
    return (
      <HearMeProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bgTop },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="helplines"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: colors.bgTop },
            }}
          />
          <Stack.Screen
            name="fake-call"
            options={{
              presentation: 'fullScreenModal',
              animation: 'fade',
              contentStyle: { backgroundColor: '#020617' },
            }}
          />
        </Stack>
      </HearMeProvider>
    );
  }

  if (!session) return <Redirect href="/login" />;
  if (!profileComplete) return <Redirect href="/profile" />;

  return (
    <HearMeProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bgTop },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="helplines"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: colors.bgTop },
          }}
        />
        <Stack.Screen
          name="fake-call"
          options={{
            presentation: 'fullScreenModal',
            animation: 'fade',
            contentStyle: { backgroundColor: '#020617' },
          }}
        />
      </Stack>
    </HearMeProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgTop,
  },
});
