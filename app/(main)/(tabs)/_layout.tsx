import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../../constants/theme';
import { useTheme } from '../../../providers/ThemeProvider';

const TAB_CONTENT = 58;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 10);
  const { colors: tc } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: tc.tabBar,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: tc.tabBarBorder,
          height: TAB_CONTENT + bottom,
          paddingBottom: bottom,
          paddingTop: 6,
          elevation: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.4,
          shadowRadius: 16,
        },
        tabBarActiveTintColor: tc.accentViolet,
        tabBarInactiveTintColor: tc.textSecondary,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 0.5,
          marginBottom: 0,
        },
        tabBarItemStyle: { paddingTop: 4 },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View>
              {focused && (
                <LinearGradient
                  colors={['rgba(167,139,250,0.3)', 'rgba(167,139,250,0)']}
                  style={styles.activeGlow}
                />
              )}
              <MaterialCommunityIcons name="shield-home" color={color} size={26} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="account-heart" color={color} size={26} />
          ),
        }}
      />
      <Tabs.Screen
        name="speed"
        options={{
          title: 'Speed',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="speedometer" color={color} size={26} />
          ),
        }}
      />
      <Tabs.Screen
        name="safety"
        options={{
          title: 'Safety',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="shield-star" color={color} size={26} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="cog" color={color} size={26} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  activeGlow: {
    position: 'absolute',
    top: -12,
    left: -10,
    right: -10,
    height: 48,
    borderRadius: 24,
  },
});
