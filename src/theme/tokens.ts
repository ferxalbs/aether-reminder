export const Colors = {
  // Pure monochrome base values
  black: '#000000',
  white: '#FFFFFF',

  // Light Canvas & Surfaces (Crisp White & Minimal Gray)
  backgroundLight: '#FFFFFF',
  surfaceLight: '#FFFFFF',
  surfaceRaisedLight: '#F4F4F5',

  // OLED Dark Mode Canvas & Surfaces (True #000000 Pitch Black)
  backgroundDark: '#000000',
  surfaceDark: '#000000',
  surfaceRaisedDark: '#121212',

  // Typography Contrast Levels
  textLight: '#0A0A0A',
  textDark: '#FFFFFF',
  secondaryTextLight: '#666666',
  secondaryTextDark: '#8E8E93',
  tertiaryTextLight: '#999999',
  tertiaryTextDark: '#52525B',

  // Subtle 1px Borders & Separators (Zero shadows/glows)
  borderLight: '#E5E5E7',
  borderDark: '#262626',
  separatorLight: '#EEEEEE',
  separatorDark: '#1C1C1E',

  // Monochrome Ink & Statuses
  brandInk: '#000000',
  successLight: '#000000',
  successDark: '#FFFFFF',
  warningLight: '#333333',
  warningDark: '#D4D4D8',

  // Neutral Grayscale Scale
  zinc950: '#09090B',
  zinc900: '#121212',
  zinc800: '#18181B',
  zinc700: '#27272A',
  zinc600: '#3F3F46',
  zinc500: '#71717A',
  zinc400: '#A1A1AA',
  zinc300: '#D4D4D8',
  zinc200: '#E4E4E7',
  zinc100: '#F4F4F5',
  zinc50: '#FAFAFA',

  // Surface Overlays & Glass Fallbacks (Strict Monochrome)
  glassDark: 'rgba(18, 18, 18, 0.85)',
  glassLight: 'rgba(255, 255, 255, 0.85)',
  glassBorderDark: '#262626',
  glassBorderLight: '#E5E5E7',

  // Shadows & Elevators (Deprecated to transparent for clean separation via borders/surfaces)
  shadowDark: 'transparent',
  shadowLight: 'transparent',

  // System Badges (Monochrome High-Contrast)
  systemGreenLight: '#000000',
  systemGreenDark: '#FFFFFF',
  systemGray4Light: '#E5E5E7',
  systemGray4Dark: '#262626',

  // Semantic Actions (Monochrome Neutral Contrast)
  destructiveBackgroundLight: '#F4F4F5',
  destructiveBackgroundDark: '#18181B',
  destructiveBorderLight: '#E5E5E7',
  destructiveBorderDark: '#262626',
  destructiveTextLight: '#000000',
  destructiveTextDark: '#FFFFFF',
  priorityBadgeBackgroundLight: '#F4F4F5',
  priorityBadgeBackgroundDark: '#18181B',

  // Touch & Feedback Surfaces
  rippleLight: 'rgba(0, 0, 0, 0.08)',
  rippleDark: 'rgba(255, 255, 255, 0.12)',
  scrimLight: 'rgba(0, 0, 0, 0.40)',
  scrimDark: 'rgba(0, 0, 0, 0.75)',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

export const LayoutTokens = {
  screenHorizontal: 20,
  screenHorizontalWide: 32,
  contentMaxWidth: 980,
  readingMaxWidth: 680,
  navigationMaxWidth: 640,
  navigationHeight: 72,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 9999,
} as const;

export const ControlTokens = {
  borderWidth: 1,
  fieldPaddingHorizontal: Spacing.lg,
  fieldPaddingVertical: Spacing.md,
  fieldContentGap: Spacing.sm,
  fieldLabelGap: Spacing.xs,
  fieldMessageGap: Spacing.xs,
  fieldIconSize: 18,
  disabledOpacity: 0.5,
  pickerOptionPaddingHorizontal: Spacing.lg,
  pickerOptionPaddingVertical: Spacing.md,
  pickerChevronSize: 18,
  sheetHandleWidth: 36,
  sheetHandleHeight: 4,
  sheetHorizontalPadding: Spacing.lg,
  sheetContentGap: Spacing.md,
  sheetTopRadius: Radius.xl,
  sheetElevation: 0,
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
    damping: 28,
    stiffness: 380,
    mass: 0.5,
  },
  toggleSpring: {
    damping: 30,
    stiffness: 220,
    mass: 1,
    overshootClamping: true,
  },
  cardSpring: {
    damping: 35,
    stiffness: 320,
    mass: 1,
  },
  buttonPressScale: 0.97,
  cardPressScale: 0.98,
  iconPressScale: 0.93,
  pressScale: 0.96,
  reducedMotionDuration: 120,
  screenSpring: {
    damping: 26,
    stiffness: 200,
    mass: 0.8,
  },
} as const;

export const TypographyTokens = {
  display: {
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -1.0,
    fontWeight: '700' as const,
  },
  headline: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.6,
    fontWeight: '600' as const,
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
