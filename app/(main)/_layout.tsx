import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { GestureTracker } from '../../components/GestureTracker';
import { colors } from '../../constants/theme';
import { isDemoAuthenticated } from '../../lib/demo-auth';
import { useAuth } from '../../providers/AuthProvider';
import { HearMeProvider, useHearMe } from '../../providers/HearMeProvider';
import LockScreen from '../lock';
import DisguiseScreen from '../disguise';

const MODAL_OPTIONS = {
  presentation: 'modal' as const,
  animation: 'slide_from_bottom' as const,
  contentStyle: { backgroundColor: colors.bgTop },
};

const FULLSCREEN_OPTIONS = {
  presentation: 'fullScreenModal' as const,
  animation: 'fade' as const,
  contentStyle: { backgroundColor: '#020617' },
};

function LockGate({ children }: { children: React.ReactNode }) {
  const { ready, locked, settings } = useHearMe();
  if (!ready) return null;
  if (locked) {
    // If disguise is enabled, show the calculator decoy first; secret PIN inside
    // it reveals the real app. Otherwise the standard lock screen.
    return settings.disguiseEnabled ? <DisguiseScreen /> : <LockScreen />;
  }
  return <>{children}</>;
}

function MainStack() {
  return (
    <HearMeProvider>
      <LockGate>
        <GestureTracker>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bgTop },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="helplines" options={MODAL_OPTIONS} />
            <Stack.Screen name="fake-call" options={FULLSCREEN_OPTIONS} />
            <Stack.Screen name="camera-detector" options={MODAL_OPTIONS} />
            <Stack.Screen name="nearby-services" options={MODAL_OPTIONS} />
            <Stack.Screen name="audio-recorder" options={MODAL_OPTIONS} />
            <Stack.Screen name="alert-history" options={MODAL_OPTIONS} />
            <Stack.Screen name="behavior-monitor" options={MODAL_OPTIONS} />
            <Stack.Screen name="check-in" options={MODAL_OPTIONS} />
            <Stack.Screen name="evidence-locker" options={MODAL_OPTIONS} />
            <Stack.Screen name="user-profile" options={MODAL_OPTIONS} />
          </Stack>
        </GestureTracker>
      </LockGate>
    </HearMeProvider>
  );
}

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

  if (demoAuth) return <MainStack />;
  if (!session) return <Redirect href="/login" />;
  if (!profileComplete) return <Redirect href="/profile" />;

  return <MainStack />;
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgTop,
  },
});
