import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { GestureTracker } from '../../components/GestureTracker';
import { VoiceGuideOverlay } from '../../components/VoiceGuideOverlay';
import { isDemoAuthenticated } from '../../lib/demo-auth';
import { AccessibilityProvider } from '../../providers/AccessibilityProvider';
import { useAuth } from '../../providers/AuthProvider';
import { HearMeProvider, useHearMe } from '../../providers/HearMeProvider';
import { ThemeProvider, useTheme } from '../../providers/ThemeProvider';
import { VoiceGuideProvider } from '../../providers/VoiceGuideProvider';
import LockScreen from '../lock';
import DisguiseScreen from '../disguise';

// Boot-screen fallback color used before ThemeProvider mounts.
const BOOT_BG = '#0a0118';
const BOOT_ACCENT = '#a78bfa';

const FULLSCREEN_OPTIONS = {
  presentation: 'fullScreenModal' as const,
  animation: 'fade' as const,
  contentStyle: { backgroundColor: '#020617' },
};

function SettingsBridge({ children }: { children: React.ReactNode }) {
  const { settings } = useHearMe();
  return (
    <ThemeProvider darkMode={settings.darkMode}>
      <AccessibilityProvider
        oneHandedMode={settings.oneHandedMode}
        dyslexiaFont={settings.dyslexiaFont}
      >
        {children}
      </AccessibilityProvider>
    </ThemeProvider>
  );
}

function LockGate({ children }: { children: React.ReactNode }) {
  const { ready, locked, settings } = useHearMe();
  if (!ready) return null;
  if (locked) {
    return settings.disguiseEnabled ? <DisguiseScreen /> : <LockScreen />;
  }
  return <>{children}</>;
}

function ThemedStack() {
  const { colors: tc } = useTheme();
  const modalOptions = {
    presentation: 'modal' as const,
    animation: 'slide_from_bottom' as const,
    contentStyle: { backgroundColor: tc.bgTop },
  };
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tc.bgTop },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="helplines" options={modalOptions} />
      <Stack.Screen name="fake-call" options={FULLSCREEN_OPTIONS} />
      <Stack.Screen name="camera-detector" options={modalOptions} />
      <Stack.Screen name="nearby-services" options={modalOptions} />
      <Stack.Screen name="audio-recorder" options={modalOptions} />
      <Stack.Screen name="alert-history" options={modalOptions} />
      <Stack.Screen name="behavior-monitor" options={modalOptions} />
      <Stack.Screen name="check-in" options={modalOptions} />
      <Stack.Screen name="journey-monitor" options={modalOptions} />
      <Stack.Screen name="evidence-locker" options={modalOptions} />
      <Stack.Screen name="user-profile" options={modalOptions} />
      <Stack.Screen name="neuroband" options={modalOptions} />
    </Stack>
  );
}

function MainStack() {
  return (
    <HearMeProvider>
      <SettingsBridge>
      <LockGate>
        <VoiceGuideProvider>
          <GestureTracker>
            <ThemedStack />
          </GestureTracker>
          <VoiceGuideOverlay />
        </VoiceGuideProvider>
      </LockGate>
      </SettingsBridge>
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
        <ActivityIndicator color={BOOT_ACCENT} size="large" />
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
    backgroundColor: BOOT_BG,
  },
});
