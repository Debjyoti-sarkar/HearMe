import { createContext, useContext, type ReactNode } from 'react';

export type ThemeColors = {
  bgTop: string;
  bgMid: string;
  bgBottom: string;
  card: string;
  cardBorder: string;
  cardHover: string;
  text: string;
  textMuted: string;
  textSecondary: string;
  inputBg: string;
  inputBorder: string;
  tabBar: string;
  tabBarBorder: string;
  // Accents stay the same across themes
  accentPink: string;
  accentRose: string;
  accentViolet: string;
  accentIndigo: string;
  accentCyan: string;
  accentEmerald: string;
  accentAmber: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  sosRed: string;
  sosRedGlow: string;
};

const DARK_COLORS: ThemeColors = {
  bgTop: '#0a0118',
  bgMid: '#1a1145',
  bgBottom: '#2d1b69',
  card: 'rgba(255,255,255,0.07)',
  cardBorder: 'rgba(255,255,255,0.12)',
  cardHover: 'rgba(255,255,255,0.11)',
  text: '#f1f5f9',
  textMuted: 'rgba(241,245,249,0.6)',
  textSecondary: 'rgba(241,245,249,0.45)',
  inputBg: 'rgba(15,23,42,0.65)',
  inputBorder: 'rgba(255,255,255,0.1)',
  tabBar: 'rgba(6,4,16,0.97)',
  tabBarBorder: 'rgba(255,255,255,0.08)',
  accentPink: '#ec4899',
  accentRose: '#f43f5e',
  accentViolet: '#a78bfa',
  accentIndigo: '#818cf8',
  accentCyan: '#22d3ee',
  accentEmerald: '#34d399',
  accentAmber: '#fbbf24',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#ef4444',
  info: '#38bdf8',
  sosRed: '#dc2626',
  sosRedGlow: 'rgba(220,38,38,0.4)',
};

const LIGHT_COLORS: ThemeColors = {
  bgTop: '#f8f7ff',
  bgMid: '#ede9fe',
  bgBottom: '#ddd6fe',
  card: 'rgba(255,255,255,0.85)',
  cardBorder: 'rgba(0,0,0,0.08)',
  cardHover: 'rgba(255,255,255,0.95)',
  text: '#1e1b2e',
  textMuted: 'rgba(30,27,46,0.6)',
  textSecondary: 'rgba(30,27,46,0.45)',
  inputBg: 'rgba(255,255,255,0.8)',
  inputBorder: 'rgba(0,0,0,0.12)',
  tabBar: 'rgba(255,255,255,0.97)',
  tabBarBorder: 'rgba(0,0,0,0.06)',
  accentPink: '#db2777',
  accentRose: '#e11d48',
  accentViolet: '#7c3aed',
  accentIndigo: '#6366f1',
  accentCyan: '#0891b2',
  accentEmerald: '#059669',
  accentAmber: '#d97706',
  success: '#059669',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#0284c7',
  sosRed: '#dc2626',
  sosRedGlow: 'rgba(220,38,38,0.3)',
};

type ThemeContextValue = {
  isDark: boolean;
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextValue>({
  isDark: true,
  colors: DARK_COLORS,
});

export function ThemeProvider({
  darkMode,
  children,
}: {
  darkMode: boolean;
  children: ReactNode;
}) {
  const themeColors = darkMode ? DARK_COLORS : LIGHT_COLORS;
  return (
    <ThemeContext.Provider value={{ isDark: darkMode, colors: themeColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
