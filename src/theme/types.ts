import type {
  ControlTokens,
  LayoutTokens,
  Radius,
  Spacing,
  TypographyTokens,
} from "./primitives";
import type { MotionSprings } from "./motionSprings";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type ThemeSource = "aether" | "material-you";

export type Material3ColorRoles = {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  inversePrimary?: string;
  secondary?: string;
  onSecondary?: string;
  secondaryContainer?: string;
  onSecondaryContainer?: string;
  tertiary?: string;
  onTertiary?: string;
  tertiaryContainer?: string;
  onTertiaryContainer?: string;
  background?: string;
  onBackground?: string;
  surface?: string;
  onSurface?: string;
  surfaceVariant?: string;
  onSurfaceVariant?: string;
  outline?: string;
  outlineVariant?: string;
  error?: string;
  onError?: string;
  errorContainer?: string;
  onErrorContainer?: string;
};

export type SemanticColors = {
  // Canvas / Surfaces
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceElevated: string;
  surfacePressed: string;
  elevatedSurface: string; // Backward-compatible alias for surfaceRaised

  // Chrome & Glass
  glassChrome: string;
  glassChromeFallback: string;
  scrim: string;

  // Typography
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  textOnAccent: string;

  // Borders & Separators
  border: string;
  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;
  borderSelected: string;
  borderFocused: string;
  separator: string;
  focusRing: string;

  // Interaction & Accents
  interactive: string;
  interactiveForeground: string;
  interactivePressed: string;
  selected: string;
  selectedForeground: string;
  accent: string;
  onAccent: string;
  accentContainer: string;
  onAccentContainer: string;
  focus: string;
  ripple: string;

  // Status
  destructive: string;
  onDestructive: string;
  destructiveContainer: string;
  destructiveBorder: string;
  warning: string;
  success: string;
};

export type ComponentTokens = {
  card: {
    background: string;
    border: string;
    borderSelected: string;
  };
  button: {
    primaryBackground: string;
    primaryForeground: string;
    secondaryBackground: string;
    secondaryForeground: string;
    secondaryBorder: string;
    ghostForeground: string;
    destructiveBackground: string;
    destructiveForeground: string;
    destructiveBorder: string;
  };
  field: {
    background: string;
    border: string;
    borderFocused: string;
    borderError: string;
    placeholder: string;
    text: string;
  };
  navigation: {
    background: string;
    indicatorActive: string;
    iconActive: string;
    iconInactive: string;
    labelActive: string;
    labelInactive: string;
  };
  control: {
    switchTrackActive: string;
    switchThumbActive: string;
    switchTrackInactive: string;
    switchThumbInactive: string;
    switchBorderInactive: string;
  };
  sheet: {
    background: string;
    border: string;
    handle: string;
  };
  pill: {
    activeBackground: string;
    activeForeground: string;
    inactiveBackground: string;
    inactiveForeground: string;
    inactiveBorder: string;
  };
};

export interface AetherTheme {
  mode: ResolvedTheme;
  source: ThemeSource;
  colors: SemanticColors;
  components: ComponentTokens;
  radii: typeof Radius;
  spacing: typeof Spacing;
  layout: typeof LayoutTokens;
  typography: typeof TypographyTokens;
  control: typeof ControlTokens;
  motion: typeof MotionSprings;
}

export type SemanticColorScheme = SemanticColors;
