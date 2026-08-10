export const Colors = {
  // Neutral and legacy values retained for provider/settings states.
  black: '#000000',
  white: '#FFFFFF',

  // AETHER foundation palette. The light surface is intentionally quiet so
  // the capture action and reminder state carry the visual weight.
  backgroundLight: '#F5F7FB',
  backgroundDark: '#071019',
  surfaceLight: '#FFFFFF',
  surfaceDark: '#101B27',
  surfaceRaisedLight: '#FBFCFF',
  surfaceRaisedDark: '#142231',
  textLight: '#0E1722',
  textDark: '#F7FAFC',
  secondaryTextLight: '#637084',
  secondaryTextDark: '#A8B5C4',
  tertiaryTextLight: '#8D99A8',
  tertiaryTextDark: '#77879A',
  borderLight: 'rgba(14, 23, 34, 0.10)',
  borderDark: 'rgba(247, 250, 252, 0.13)',
  brandInk: '#0C1622',
  successLight: '#18864B',
  successDark: '#6BE7A2',
  warningLight: '#9A5C00',
  warningDark: '#F8C66D',
  
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
  systemGray4Light: '#D1D1D6',
  systemGray4Dark: '#3A3A3C',

  // Semantic action colors
  destructiveBackgroundLight: 'rgba(239, 68, 68, 0.10)',
  destructiveBackgroundDark: 'rgba(239, 68, 68, 0.16)',
  destructiveBorderLight: 'rgba(239, 68, 68, 0.20)',
  destructiveBorderDark: 'rgba(239, 68, 68, 0.30)',
  destructiveTextLight: '#DC2626',
  destructiveTextDark: '#FCA5A5',
  priorityBadgeBackgroundLight: 'rgba(39, 39, 42, 0.20)',
  priorityBadgeBackgroundDark: 'rgba(228, 228, 231, 0.20)',

  // Platform feedback surfaces
  rippleLight: 'rgba(0, 0, 0, 0.12)',
  rippleDark: 'rgba(255, 255, 255, 0.18)',
  scrimLight: 'rgba(0, 0, 0, 0.18)',
  scrimDark: 'rgba(0, 0, 0, 0.50)',
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

export const LayoutTokens = {
  screenHorizontal: 20,
  screenHorizontalWide: 32,
  contentMaxWidth: 980,
  readingMaxWidth: 680,
  navigationMaxWidth: 640,
  navigationHeight: 78,
} as const;

export const Radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 9999,
} as const;

export const ControlTokens = {
  borderWidth: 1,
  fieldPaddingHorizontal: Spacing.md,
  fieldPaddingVertical: Spacing.sm,
  fieldContentGap: Spacing.sm,
  fieldLabelGap: Spacing.xs,
  fieldMessageGap: Spacing.xs,
  fieldIconSize: 18,
  disabledOpacity: 0.55,
  pickerOptionPaddingHorizontal: Spacing.md,
  pickerOptionPaddingVertical: Spacing.sm,
  pickerChevronSize: 18,
  sheetHandleWidth: Spacing.xl,
  sheetHandleHeight: Spacing.xs,
  sheetHorizontalPadding: Spacing.md,
  sheetContentGap: Spacing.sm,
  sheetTopRadius: Radius.xl,
  sheetElevation: 8,
  sheetMaxHeight: '90%',
} as const;

export const TouchTargets = {
  ios: 44,
  android: 48,
} as const;

export const getMinimumTouchTarget = (platform: string): number =>
  platform === 'android' ? TouchTargets.android : TouchTargets.ios;

export const Motion = {
  pressSpring: {
    damping: 26.5,
    stiffness: 350,
    mass: 0.5,
  },
  toggleSpring: {
    damping: 28,
    stiffness: 200,
    mass: 1,
    overshootClamping: true,
  },
  cardSpring: {
    damping: 34.5,
    stiffness: 300,
    mass: 1,
  },
  buttonPressScale: 0.97,
  cardPressScale: 0.98,
  iconPressScale: 0.93,
  pressScale: 0.96,
  reducedMotionDuration: 120,
  screenSpring: {
    damping: 24,
    stiffness: 180,
    mass: 0.8,
  },
} as const;

export const TypographyTokens = {
  display: {
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -1.1,
    fontWeight: '700' as const,
  },
  headline: {
    fontSize: 25,
    lineHeight: 31,
    letterSpacing: -0.55,
    fontWeight: '700' as const,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    letterSpacing: 0,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontSize: 16,
    lineHeight: 23,
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
