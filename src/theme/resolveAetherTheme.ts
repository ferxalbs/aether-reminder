import {
  Colors,
  ControlTokens,
  LayoutTokens,
  Radius,
  Spacing,
  TypographyTokens,
} from "./primitives";
import { MotionSprings } from "./motionSprings";
import type {
  AetherTheme,
  ComponentTokens,
  Material3ColorRoles,
  ResolvedTheme,
  SemanticColors,
  ThemeSource,
} from "./types";

/**
 * Pure resolver that produces AETHER semantic colors.
 *
 * Guaranteed invariants:
 * 1. Pitch-black OLED dark canvas (`#000000`) is never tinted by wallpaper.
 * 2. Status colors (destructive/error) always remain true red (`#FF453A` / `#D70015`).
 * 3. Typography contrast levels remain pristine monochrome.
 * 4. On Android 12+ with Material You enabled, dynamic accent roles adapt to the user's wallpaper.
 * 5. When disabled or on Apple platforms, pure AETHER monochrome identity is authoritative.
 */
export function resolveSemanticColors(
  mode: ResolvedTheme,
  dynamicEnabled = false,
  dynamicPalette?: Material3ColorRoles | null,
): SemanticColors {
  const isDark = mode === "dark";
  const hasDynamic = Boolean(
    dynamicEnabled && dynamicPalette && dynamicPalette.primary,
  );

  const baseSurfaceRaised = isDark
    ? Colors.surfaceRaisedDark
    : Colors.surfaceRaisedLight;
  const baseElevatedSurface = isDark ? Colors.zinc800 : Colors.zinc100;

  if (isDark) {
    const accent = hasDynamic
      ? (dynamicPalette!.primary as string)
      : Colors.white;
    const onAccent = hasDynamic
      ? (dynamicPalette!.onPrimary as string)
      : Colors.black;
    const accentContainer = hasDynamic
      ? (dynamicPalette!.primaryContainer as string)
      : baseElevatedSurface;
    const onAccentContainer = hasDynamic
      ? (dynamicPalette!.onPrimaryContainer as string)
      : Colors.white;

    return {
      // Canvas / Surfaces (Strict OLED Dark Identity)
      background: Colors.backgroundDark,
      surface: Colors.surfaceDark,
      surfaceRaised: baseSurfaceRaised,
      surfaceElevated: Colors.zinc800,
      surfacePressed: Colors.zinc700,
      elevatedSurface: baseSurfaceRaised,

      // Chrome & Glass
      glassChrome: Colors.glassDark,
      glassChromeFallback: Colors.glassDarkFallback,
      scrim: Colors.scrimDark,

      // Typography
      textPrimary: Colors.textDark,
      textSecondary: Colors.secondaryTextDark,
      textTertiary: Colors.tertiaryTextDark,
      textDisabled: "rgba(255, 255, 255, 0.38)",
      textOnAccent: onAccent,

      // Borders & Hairlines
      border: Colors.borderDark,
      borderSubtle: "rgba(255, 255, 255, 0.04)",
      borderDefault: Colors.borderDark,
      borderStrong: "rgba(255, 255, 255, 0.16)",
      borderSelected: accent,
      borderFocused: accent,
      separator: Colors.separatorDark,
      focusRing: accent,

      // Interaction & Accents
      interactive: accent,
      interactiveForeground: onAccent,
      interactivePressed: hasDynamic
        ? (dynamicPalette!.primaryContainer as string)
        : Colors.zinc200,
      selected: accentContainer,
      selectedForeground: onAccentContainer,
      accent,
      onAccent,
      accentContainer,
      onAccentContainer,
      focus: accent,
      ripple: Colors.rippleDark,

      // Status (Preserved high-contrast semantics)
      destructive: Colors.destructiveTextDark,
      onDestructive: Colors.white,
      destructiveContainer: Colors.destructiveBackgroundDark,
      destructiveBorder: Colors.destructiveBorderDark,
      warning: Colors.warningDark,
      success: Colors.successDark,
    };
  }

  // Light Mode
  const accent = hasDynamic
    ? (dynamicPalette!.primary as string)
    : Colors.black;
  const onAccent = hasDynamic
    ? (dynamicPalette!.onPrimary as string)
    : Colors.white;
  const accentContainer = hasDynamic
    ? (dynamicPalette!.primaryContainer as string)
    : baseElevatedSurface;
  const onAccentContainer = hasDynamic
    ? (dynamicPalette!.onPrimaryContainer as string)
    : Colors.black;

  return {
    // Canvas / Surfaces
    background: Colors.backgroundLight,
    surface: Colors.surfaceLight,
    surfaceRaised: baseSurfaceRaised,
    surfaceElevated: Colors.zinc200,
    surfacePressed: Colors.zinc200,
    elevatedSurface: baseSurfaceRaised,

    // Chrome & Glass
    glassChrome: Colors.glassLight,
    glassChromeFallback: Colors.glassLightFallback,
    scrim: Colors.scrimLight,

    // Typography
    textPrimary: Colors.textLight,
    textSecondary: Colors.secondaryTextLight,
    textTertiary: Colors.tertiaryTextLight,
    textDisabled: "rgba(0, 0, 0, 0.38)",
    textOnAccent: onAccent,

    // Borders & Hairlines
    border: Colors.borderLight,
    borderSubtle: "rgba(0, 0, 0, 0.03)",
    borderDefault: Colors.borderLight,
    borderStrong: "rgba(0, 0, 0, 0.12)",
    borderSelected: accent,
    borderFocused: accent,
    separator: Colors.separatorLight,
    focusRing: accent,

    // Interaction & Accents
    interactive: accent,
    interactiveForeground: onAccent,
    interactivePressed: hasDynamic
      ? (dynamicPalette!.primaryContainer as string)
      : Colors.zinc800,
    selected: accentContainer,
    selectedForeground: onAccentContainer,
    accent,
    onAccent,
    accentContainer,
    onAccentContainer,
    focus: accent,
    ripple: Colors.rippleLight,

    // Status
    destructive: Colors.destructiveTextLight,
    onDestructive: Colors.white,
    destructiveContainer: Colors.destructiveBackgroundLight,
    destructiveBorder: Colors.destructiveBorderLight,
    warning: Colors.warningLight,
    success: Colors.successLight,
  };
}

/**
 * Pure resolver that produces component tokens from semantic colors.
 */
export function resolveComponentTokens(
  colors: SemanticColors,
): ComponentTokens {
  return {
    card: {
      background: colors.surfaceRaised,
      border: colors.borderDefault,
      borderSelected: colors.borderSelected,
    },
    button: {
      primaryBackground: colors.interactive,
      primaryForeground: colors.interactiveForeground,
      secondaryBackground: colors.surfaceRaised,
      secondaryForeground: colors.textPrimary,
      secondaryBorder: colors.borderDefault,
      ghostForeground: colors.textSecondary,
      destructiveBackground: colors.destructiveContainer,
      destructiveForeground: colors.destructive,
      destructiveBorder: colors.destructiveBorder,
    },
    field: {
      background: colors.surfaceRaised,
      border: colors.borderDefault,
      borderFocused: colors.borderFocused,
      borderError: colors.destructive,
      placeholder: colors.textTertiary,
      text: colors.textPrimary,
    },
    navigation: {
      background: colors.glassChrome,
      indicatorActive: colors.accentContainer,
      iconActive: colors.accent,
      iconInactive: colors.textSecondary,
      labelActive: colors.accent,
      labelInactive: colors.textSecondary,
    },
    control: {
      switchTrackActive: colors.accent,
      switchThumbActive: colors.onAccent,
      switchTrackInactive: colors.surfaceRaised,
      switchThumbInactive: colors.textSecondary,
      switchBorderInactive: colors.borderDefault,
    },
    sheet: {
      background: colors.surface,
      border: colors.borderDefault,
      handle: colors.textTertiary,
    },
    pill: {
      activeBackground: colors.accent,
      activeForeground: colors.onAccent,
      inactiveBackground: colors.surfaceRaised,
      inactiveForeground: colors.textSecondary,
      inactiveBorder: colors.borderDefault,
    },
  };
}

/**
 * Resolves the complete unified AetherTheme object.
 */
export function resolveAetherTheme(
  mode: ResolvedTheme,
  dynamicColorsEnabled = false,
  dynamicPalette?: Material3ColorRoles | null,
): AetherTheme {
  const colors = resolveSemanticColors(
    mode,
    dynamicColorsEnabled,
    dynamicPalette,
  );
  const components = resolveComponentTokens(colors);
  const source: ThemeSource =
    dynamicColorsEnabled && dynamicPalette?.primary ? "material-you" : "aether";

  return {
    mode,
    source,
    colors,
    components,
    radii: Radius,
    spacing: Spacing,
    layout: LayoutTokens,
    typography: TypographyTokens,
    control: ControlTokens,
    motion: MotionSprings,
  };
}

/**
 * Backward-compatible helper for legacy getSemanticColors call sites.
 */
export function getSemanticColors(
  theme: ResolvedTheme,
  materialColorsEnabled = false,
  dynamicPalette?: Material3ColorRoles | null,
): SemanticColors {
  return resolveSemanticColors(theme, materialColorsEnabled, dynamicPalette);
}
