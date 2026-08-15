import { StyleSheet } from 'react-native';

export const Colors = {
  // Pure monochrome base values
  black: '#000000',
  white: '#FFFFFF',

  // Light Canvas & Surfaces (Crisp White & Minimal Gray)
  backgroundLight: '#FFFFFF',
  surfaceLight: '#FFFFFF',
  surfaceRaisedLight: '#F4F4F6',

  // OLED Dark Mode Canvas & Surfaces (True #000000 Pitch Black)
  backgroundDark: '#000000',
  surfaceDark: '#000000',
  surfaceRaisedDark: '#121215',

  // Glass Chrome Surfaces (Restricted to Floating Chrome Only)
  glassDark: 'rgba(18, 18, 20, 0.55)',
  glassLight: 'rgba(244, 244, 246, 0.65)',
  glassDarkFallback: 'rgba(18, 18, 20, 0.85)',
  glassLightFallback: 'rgba(244, 244, 246, 0.90)',

  // Typography Contrast Levels
  textLight: '#0A0A0A',
  textDark: '#FFFFFF',
  secondaryTextLight: '#666666',
  secondaryTextDark: '#8E8E93',
  tertiaryTextLight: '#999999',
  tertiaryTextDark: '#52525B',

  // Subtle Hairline Borders & Separators (Semantic Hairlines)
  borderLight: 'rgba(0, 0, 0, 0.04)',
  borderDark: 'rgba(255, 255, 255, 0.08)',
  separatorLight: 'rgba(0, 0, 0, 0.04)',
  separatorDark: 'rgba(255, 255, 255, 0.06)',

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
  destructiveTextLight: '#D70015',
  destructiveTextDark: '#FF453A',
  priorityBadgeBackgroundLight: '#F4F4F5',
  priorityBadgeBackgroundDark: '#18181B',

  // Touch & Feedback Surfaces
  rippleLight: 'rgba(0, 0, 0, 0.08)',
  rippleDark: 'rgba(255, 255, 255, 0.12)',
  scrimLight: 'rgba(0, 0, 0, 0.40)',
  scrimDark: 'rgba(0, 0, 0, 0.75)',
} as const;

/** Material 3 baseline accent roles used only when the user opts in. */
export const MaterialColors = {
  light: {
    primary: '#6750A4',
    onPrimary: '#FFFFFF',
    primaryContainer: '#EADDFF',
    onPrimaryContainer: '#21005D',
  },
  dark: {
    primary: '#D0BCFF',
    onPrimary: '#381E72',
    primaryContainer: '#4F378B',
    onPrimaryContainer: '#EADDFF',
  },
} as const;

export const SemanticColors = {
  light: {
    background: Colors.backgroundLight,
    surface: Colors.surfaceLight,
    elevatedSurface: Colors.surfaceRaisedLight,
    glassChrome: Colors.glassLight,
    glassChromeFallback: Colors.glassLightFallback,
    textPrimary: Colors.textLight,
    textSecondary: Colors.secondaryTextLight,
    textTertiary: Colors.tertiaryTextLight,
    border: Colors.borderLight,
    separator: Colors.separatorLight,
    interactive: Colors.black,
    interactiveForeground: Colors.white,
    interactivePressed: Colors.zinc800,
    selected: Colors.zinc100,
    accent: Colors.black,
    onAccent: Colors.white,
    accentContainer: Colors.zinc100,
    onAccentContainer: Colors.black,
    destructive: Colors.destructiveTextLight,
    focus: Colors.black,
    scrim: Colors.scrimLight,
  },
  dark: {
    background: Colors.backgroundDark,
    surface: Colors.surfaceDark,
    elevatedSurface: Colors.surfaceRaisedDark,
    glassChrome: Colors.glassDark,
    glassChromeFallback: Colors.glassDarkFallback,
    textPrimary: Colors.textDark,
    textSecondary: Colors.secondaryTextDark,
    textTertiary: Colors.tertiaryTextDark,
    border: Colors.borderDark,
    separator: Colors.separatorDark,
    interactive: Colors.white,
    interactiveForeground: Colors.black,
    interactivePressed: Colors.zinc200,
    selected: Colors.zinc800,
    accent: Colors.white,
    onAccent: Colors.black,
    accentContainer: Colors.zinc800,
    onAccentContainer: Colors.white,
    destructive: Colors.destructiveTextDark,
    focus: Colors.white,
    scrim: Colors.scrimDark,
  },
} as const;

export type SemanticColorScheme = {
  [Key in keyof typeof SemanticColors.light]: string;
};

export function getSemanticColors(
  theme: 'light' | 'dark',
  materialColorsEnabled = false,
): SemanticColorScheme {
  const baseColors = SemanticColors[theme];
  if (!materialColorsEnabled) return baseColors;

  const materialColors = MaterialColors[theme];
  return {
    ...baseColors,
    interactive: materialColors.primary,
    interactiveForeground: materialColors.onPrimary,
    interactivePressed: materialColors.primaryContainer,
    selected: materialColors.primaryContainer,
    accent: materialColors.primary,
    onAccent: materialColors.onPrimary,
    accentContainer: materialColors.primaryContainer,
    onAccentContainer: materialColors.onPrimaryContainer,
    focus: materialColors.primary,
  };
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

export const Hairline = {
  width: StyleSheet.hairlineWidth || 1,
} as const;

export const LayoutTokens = {
  screenHorizontal: 20,
  screenHorizontalWide: 32,
  contentMaxWidth: 980,
  readingMaxWidth: 680,
  navigationMaxWidth: 640,
  navigationHeight: 60,
  composerHeight: 56,
  sectionGap: 32,
  titleToDescriptionGap: 8,
  descriptionToContentGap: 24,
} as const;

export const Radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 9999,
} as const;

export const ControlTokens = {
  borderWidth: Hairline.width,
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
  sheetHandleWidth: 40,
  sheetHandleHeight: 5,
  sheetHorizontalPadding: Spacing.lg,
  sheetContentGap: Spacing.md,
  sheetTopRadius: 36,
  sheetElevation: 0,
  sheetMaxHeight: '90%',
} as const;

export const TouchTargets = {
  ios: 44,
  android: 48,
} as const;

export const getMinimumTouchTarget = (platform: string): number =>
  platform === 'android' ? TouchTargets.android : TouchTargets.ios;

export { MotionSprings as Motion } from './motionSprings';

export const TypographyTokens = {
  display: {
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
    fontWeight: '700' as const,
  },
  headline: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
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
    letterSpacing: -0.05,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.05,
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
