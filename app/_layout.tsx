import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../providers/AuthProvider';
import { LanguageProvider } from '../providers/LanguageProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <StatusBar style="light" translucent />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: '#0a0118' },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="language" />
            <Stack.Screen name="login" />
            <Stack.Screen name="verify-otp" />
            <Stack.Screen name="aadhaar" />
            <Stack.Screen name="setup-pin" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="(main)" />
          </Stack>
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
