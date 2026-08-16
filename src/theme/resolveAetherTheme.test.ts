import { describe, expect, mock, test } from "bun:test";
import type { Material3ColorRoles } from "./types";

const MockView: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("View", props, props.children as React.ReactNode);
const MockText: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("Text", props, props.children as React.ReactNode);

// Mock react-native for pure unit tests
mock.module("react-native", () => ({
  Platform: {
    OS: "android",
    select: (obj: Record<string, unknown>) => obj.android ?? obj.default,
  },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    flatten: (style: unknown) =>
      Array.isArray(style) ? Object.assign({}, ...style) : style || {},
    hairlineWidth: 1,
    absoluteFill: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    absoluteFillObject: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
  },
  View: MockView,
  Text: MockText,
  TextInput: MockView,
  ActivityIndicator: MockView,
  FlatList: MockView,
  Pressable: MockView,
  Modal: MockView,
  Touchable: { Mixin: {} },
  useColorScheme: () => "dark",
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
}));

const {
  resolveAetherTheme,
  resolveComponentTokens,
  resolveSemanticColors,
} = await import("./resolveAetherTheme");
const { resolveTheme } = await import("./resolveTheme");
const { Colors } = await import("./primitives");

describe("AETHER Theme & Design Token Resolver", () => {
  const sampleRedWallpaperDarkPalette: Material3ColorRoles = {
    primary: "#FFB4AB",
    onPrimary: "#690005",
    primaryContainer: "#93000A",
    onPrimaryContainer: "#FFDAD6",
    secondary: "#E7BDB7",
    onSecondary: "#442926",
    secondaryContainer: "#5D3F3B",
    onSecondaryContainer: "#FFDAD6",
    surface: "#1A1110",
    onSurface: "#F1DFDD",
  };

  const sampleGreenWallpaperLightPalette: Material3ColorRoles = {
    primary: "#006D39",
    onPrimary: "#FFFFFF",
    primaryContainer: "#98F7B3",
    onPrimaryContainer: "#00210C",
    secondary: "#4F6352",
    onSecondary: "#FFFFFF",
    secondaryContainer: "#D2E8D3",
    onSecondaryContainer: "#0D1F12",
    surface: "#F6FBF3",
    onSurface: "#181D18",
  };

  describe("AETHER Monochrome Theme (Material You OFF / iOS)", () => {
    test("Dark mode: true OLED pitch-black background and high-contrast monochrome accents", () => {
      const theme = resolveAetherTheme("dark", false);

      expect(theme.mode).toBe("dark");
      expect(theme.source).toBe("aether");
      expect(theme.colors.background).toBe("#000000");
      expect(theme.colors.surface).toBe("#000000");
      expect(theme.colors.surfaceRaised).toBe(Colors.surfaceRaisedDark);
      expect(theme.colors.accent).toBe(Colors.white);
      expect(theme.colors.onAccent).toBe(Colors.black);
      expect(theme.colors.interactive).toBe(Colors.white);
      expect(theme.colors.interactiveForeground).toBe(Colors.black);
      expect(theme.colors.textPrimary).toBe(Colors.textDark);
      expect(theme.colors.destructive).toBe(Colors.destructiveTextDark);
    });

    test("Light mode: crisp light canvas with crisp black accents", () => {
      const theme = resolveAetherTheme("light", false);

      expect(theme.mode).toBe("light");
      expect(theme.source).toBe("aether");
      expect(theme.colors.background).toBe("#FFFFFF");
      expect(theme.colors.surface).toBe("#FFFFFF");
      expect(theme.colors.surfaceRaised).toBe(Colors.surfaceRaisedLight);
      expect(theme.colors.accent).toBe(Colors.black);
      expect(theme.colors.onAccent).toBe(Colors.white);
      expect(theme.colors.interactive).toBe(Colors.black);
      expect(theme.colors.interactiveForeground).toBe(Colors.white);
      expect(theme.colors.textPrimary).toBe(Colors.textLight);
      expect(theme.colors.destructive).toBe(Colors.destructiveTextLight);
    });
  });

  describe("Android Material You Dynamic Theming (Material You ON)", () => {
    test("Dark mode + Red Wallpaper: maps dynamic roles to accents while preserving OLED pitch black", () => {
      const theme = resolveAetherTheme(
        "dark",
        true,
        sampleRedWallpaperDarkPalette,
      );

      expect(theme.mode).toBe("dark");
      expect(theme.source).toBe("material-you");

      // Critical Invariant: OLED background remains pitch-black (#000000), never turned red!
      expect(theme.colors.background).toBe("#000000");
      expect(theme.colors.surface).toBe("#000000");

      // Accents adapt directly to the user's wallpaper dynamic palette
      expect(theme.colors.accent).toBe("#FFB4AB");
      expect(theme.colors.onAccent).toBe("#690005");
      expect(theme.colors.accentContainer).toBe("#93000A");
      expect(theme.colors.onAccentContainer).toBe("#FFDAD6");
      expect(theme.colors.interactive).toBe("#FFB4AB");
      expect(theme.colors.interactiveForeground).toBe("#690005");
      expect(theme.colors.interactivePressed).toBe("#93000A");
      expect(theme.colors.borderSelected).toBe("#FFB4AB");
      expect(theme.colors.borderFocused).toBe("#FFB4AB");

      // Status color MUST NOT be overwritten by dynamic primary
      expect(theme.colors.destructive).toBe(Colors.destructiveTextDark);
    });

    test("Light mode + Green Wallpaper: maps dynamic roles to accents on light canvas", () => {
      const theme = resolveAetherTheme(
        "light",
        true,
        sampleGreenWallpaperLightPalette,
      );

      expect(theme.mode).toBe("light");
      expect(theme.source).toBe("material-you");

      expect(theme.colors.background).toBe("#FFFFFF");
      expect(theme.colors.surface).toBe("#FFFFFF");

      expect(theme.colors.accent).toBe("#006D39");
      expect(theme.colors.onAccent).toBe("#FFFFFF");
      expect(theme.colors.accentContainer).toBe("#98F7B3");
      expect(theme.colors.onAccentContainer).toBe("#00210C");
      expect(theme.colors.interactive).toBe("#006D39");
      expect(theme.colors.interactiveForeground).toBe("#FFFFFF");

      expect(theme.colors.destructive).toBe(Colors.destructiveTextLight);
    });

    test("Fallback when dynamic palette is unavailable (Android < 12 or missing palette)", () => {
      const theme = resolveAetherTheme("dark", true, null);

      expect(theme.mode).toBe("dark");
      expect(theme.source).toBe("aether");
      expect(theme.colors.background).toBe("#000000");
      expect(theme.colors.accent).toBe(Colors.white);
      expect(theme.colors.onAccent).toBe(Colors.black);
    });
  });

  describe("Anti-Purple Baseline Regression Guards", () => {
    test("Never resolves to old hardcoded baseline purple (#6750A4, #D0BCFF) by default", () => {
      const darkAether = resolveSemanticColors("dark", false);
      const lightAether = resolveSemanticColors("light", false);
      const darkDynamic = resolveSemanticColors(
        "dark",
        true,
        sampleRedWallpaperDarkPalette,
      );

      // Verify the old hardcoded baseline purple is not present
      expect(darkAether.accent).not.toBe("#D0BCFF");
      expect(darkAether.accent).not.toBe("#6750A4");
      expect(lightAether.accent).not.toBe("#6750A4");
      expect(darkDynamic.accent).not.toBe("#D0BCFF");
    });
  });

  describe("Component Tokens Resolution", () => {
    test("Generates consistent component-level tokens from resolved semantic colors", () => {
      const colors = resolveSemanticColors(
        "dark",
        true,
        sampleRedWallpaperDarkPalette,
      );
      const components = resolveComponentTokens(colors);

      expect(components.button.primaryBackground).toBe(colors.interactive);
      expect(components.button.primaryForeground).toBe(
        colors.interactiveForeground,
      );
      expect(components.control.switchTrackActive).toBe(colors.accent);
      expect(components.control.switchThumbActive).toBe(colors.onAccent);
      expect(components.field.borderFocused).toBe(colors.borderFocused);
      expect(components.navigation.indicatorActive).toBe(
        colors.accentContainer,
      );
      expect(components.pill.activeBackground).toBe(colors.accent);
      expect(components.pill.activeForeground).toBe(colors.onAccent);
    });
  });

  describe("System Appearance Resolution Matrix", () => {
    test("Follows explicit light/dark or system OS preference", () => {
      expect(resolveTheme("light", "dark")).toBe("light");
      expect(resolveTheme("dark", "light")).toBe("dark");
      expect(resolveTheme("system", "light")).toBe("light");
      expect(resolveTheme("system", "dark")).toBe("dark");
      expect(resolveTheme("system", null)).toBe("dark");
    });
  });
});
