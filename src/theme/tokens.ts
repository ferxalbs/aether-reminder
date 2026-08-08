export const Colors = {
  // Pure monochrome palette
  black: '#000000',
  white: '#FFFFFF',
  
  // Grayscale levels (dark mode primary, adapt for high contrast)
  zinc950: '#09090B',
  zinc900: '#18181B',
  zinc800: '#27272A',
  zinc700: '#3F3F46',
  zinc600: '#52525B',
  zinc500: '#71717A',
  zinc400: '#A1A1AA',
  zinc300: '#D4D4D8',
  zinc200: '#E4E4E7',
  zinc100: '#F4F4F5',
  zinc50: '#FAFAFA',

  // Translucent glass overlays
  glassDark: 'rgba(24, 24, 27, 0.75)',
  glassLight: 'rgba(255, 255, 255, 0.75)',
  glassBorderDark: 'rgba(255, 255, 255, 0.12)',
  glassBorderLight: 'rgba(0, 0, 0, 0.08)',
  
  // Shadows & Elevators
  shadowDark: 'rgba(0, 0, 0, 0.5)',
  shadowLight: 'rgba(0, 0, 0, 0.05)',

  // System
  systemGreenLight: '#34C759',
  systemGreenDark: '#30D158',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  huge: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 9999,
} as const;

export const TypographyTokens = {
  display: {
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
    fontWeight: '700' as const,
  },
  headline: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
    fontWeight: '700' as const,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.1,
    fontWeight: '500' as const,
  },
  tiny: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.2,
    fontWeight: '600' as const,
  },
} as const;
