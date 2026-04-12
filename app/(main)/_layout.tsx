import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '../../constants/theme';
import { resolveInitialRoute, type InitialRoute } from '../../lib/session';
import { HearMeProvider } from '../../providers/HearMeProvider';

export default function MainLayout() {
  const [target, setTarget] = useState<InitialRoute | null>(null);

  useEffect(() => {
    let m = true;
    (async () => {
      const r = await resolveInitialRoute();
      if (m) setTarget(r);
    })();
    return () => {
      m = false;
    };
  }, []);

  if (target === null) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accentViolet} size="large" />
      </View>
    );
  }

  if (target !== '/(main)') {
    return <Redirect href={target} />;
  }

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
