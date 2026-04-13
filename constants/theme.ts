export const colors = {
  // Background gradient
  bgTop: '#0a0118',
  bgMid: '#1a1145',
  bgBottom: '#2d1b69',

  // Cards & surfaces
  card: 'rgba(255,255,255,0.07)',
  cardBorder: 'rgba(255,255,255,0.12)',
  cardHover: 'rgba(255,255,255,0.11)',

  // Text
  text: '#f1f5f9',
  textMuted: 'rgba(241,245,249,0.6)',
  textSecondary: 'rgba(241,245,249,0.45)',

  // Inputs
  inputBg: 'rgba(15,23,42,0.65)',
  inputBorder: 'rgba(255,255,255,0.1)',

  // Accent palette
  accentPink: '#ec4899',
  accentRose: '#f43f5e',
  accentViolet: '#a78bfa',
  accentIndigo: '#818cf8',
  accentCyan: '#22d3ee',
  accentEmerald: '#34d399',
  accentAmber: '#fbbf24',

  // Semantic
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#ef4444',
  info: '#38bdf8',

  // SOS
  sosRed: '#dc2626',
  sosRedGlow: 'rgba(220,38,38,0.4)',

  // Tab bar
  tabBar: 'rgba(6,4,16,0.97)',
  tabBarBorder: 'rgba(255,255,255,0.08)',
} as const;

export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  }),
} as const;
