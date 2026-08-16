import { describe, expect, mock, test, beforeEach } from "bun:test";
import React from "react";

const MockView: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("View", props, props.children as React.ReactNode);

const MockText: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("Text", props, props.children as React.ReactNode);

let currentPlatform = "android";

// Mock react-native
mock.module("react-native", () => ({
  Platform: {
    get OS() {
      return currentPlatform;
    },
    select: (obj: Record<string, unknown>) =>
      obj[currentPlatform] ?? obj.default,
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

// Mock @expo/ui Universal Switch, Picker & Host
const MockPickerItem = (props: Record<string, unknown>) =>
  React.createElement("ExpoPickerItem", props, null);

const MockPicker = Object.assign(
  (props: Record<string, unknown>) =>
    React.createElement("ExpoPicker", props, props.children as React.ReactNode),
  { Item: MockPickerItem },
);

const MockUniversalSwitch = (props: Record<string, unknown>) =>
  React.createElement("ExpoUniversalSwitch", props, null);

const MockHost = (props: Record<string, unknown>) =>
  React.createElement("ExpoHost", props, props.children as React.ReactNode);

mock.module("@expo/ui", () => ({
  Host: MockHost,
  Picker: MockPicker,
  Switch: MockUniversalSwitch,
}));

// Mock @expo/ui/jetpack-compose
const MockComposeSwitch = (props: Record<string, unknown>) =>
  React.createElement("ExpoComposeSwitch", props, null);

mock.module("@expo/ui/jetpack-compose", () => ({
  Switch: MockComposeSwitch,
}));

mock.module("@expo/ui/jetpack-compose/modifiers", () => ({
  testID: (tag: string) => ({ type: "testID", tag }),
}));

// Mock @expo/ui/swift-ui
const MockSwiftUIToggle = (props: Record<string, unknown>) =>
  React.createElement("ExpoSwiftUIToggle", props, null);

mock.module("@expo/ui/swift-ui", () => ({
  Toggle: MockSwiftUIToggle,
}));

mock.module("@expo/ui/swift-ui/modifiers", () => ({
  tint: (color: string) => ({ type: "tint", color }),
  labelsHidden: () => ({ type: "labelsHidden" }),
  disabled: (disabled: boolean) => ({ type: "disabled", disabled }),
}));

let mockHapticsEnabled = true;
let mockMaterialColorsEnabled = false;

mock.module("@/stores/settings.store", () => ({
  useSettingsStore: (
    selector?: (state: {
      hapticsEnabled: boolean;
      materialColorsEnabled: boolean;
    }) => unknown,
  ) => {
    const state = {
      hapticsEnabled: mockHapticsEnabled,
      materialColorsEnabled: mockMaterialColorsEnabled,
    };
    return selector ? selector(state) : state;
  },
}));
Object.assign((await import("@/stores/settings.store")).useSettingsStore, {
  getState: () => ({
    hapticsEnabled: mockHapticsEnabled,
    materialColorsEnabled: mockMaterialColorsEnabled,
  }),
});

const mockSelectionAsync = mock(() => Promise.resolve());
mock.module("@/lib/haptics", () => ({
  selectionAsync: mockSelectionAsync,
}));

mock.module("@/theme/useResolvedTheme", () => ({
  useIsDark: () => true,
  useResolvedTheme: () => "dark",
}));

mock.module("@/theme/useSemanticColors", () => ({
  useSemanticColors: () =>
    resolveSemanticColors(
      "dark",
      mockMaterialColorsEnabled,
      mockMaterialColorsEnabled
        ? {
            primary: "#FFB4AB",
            onPrimary: "#690005",
            primaryContainer: "#93000A",
            onPrimaryContainer: "#FFDAD6",
          }
        : null,
    ),
}));

const { resolveSemanticColors } = await import("@/theme/resolveAetherTheme");
const { ToggleSwitch } = await import("./ToggleSwitch");
const ReactTestRenderer = (await import("react-test-renderer")).default;
const { act } = await import("react-test-renderer");

describe("ToggleSwitch Platform Native Adapter", () => {
  beforeEach(() => {
    currentPlatform = "android";
    mockHapticsEnabled = true;
    mockMaterialColorsEnabled = false;
    mockSelectionAsync.mockClear();
  });

  describe("Android (Jetpack Compose Switch)", () => {
    test("renders ComposeSwitch with explicit AETHER OLED dark colors when material colors disabled", () => {
      currentPlatform = "android";
      mockMaterialColorsEnabled = false;
      const onValueChange = mock(() => {});

      let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
      act(() => {
        renderer = ReactTestRenderer.create(
          <ToggleSwitch
            value={true}
            onValueChange={onValueChange}
            accessibilityLabel="Haptic Feedback"
            accessibilityHint="Toggles tactile feedback"
            testID="haptics-switch"
          />,
        );
      });

      const root = renderer!.root;
      const host = root.findByType("ExpoHost");
      expect(host).toBeDefined();
      expect(host.props.matchContents).toBe(true);
      expect(host.props.colorScheme).toBe("dark");
      // seedColor must NOT be set on Host to prevent derived cyan/teal palette
      expect(host.props.seedColor).toBeUndefined();
      expect(host.props.accessibilityLabel).toBe("Haptic Feedback");
      expect(host.props.accessibilityHint).toBe("Toggles tactile feedback");

      const switchComp = root.findByType("ExpoComposeSwitch");
      expect(switchComp).toBeDefined();
      expect(switchComp.props.value).toBe(true);
      expect(switchComp.props.enabled).toBe(true);
      expect(switchComp.props.modifiers).toEqual([
        { type: "testID", tag: "haptics-switch" },
      ]);

      // Verify explicit AETHER dark theme colors
      const colors = switchComp.props.colors;
      expect(colors.checkedTrackColor).toBe("#FFFFFF");
      expect(colors.checkedThumbColor).toBe("#000000");
      expect(colors.checkedBorderColor).toBe("#FFFFFF");
      expect(colors.uncheckedTrackColor).toBe("#121215");
      expect(colors.uncheckedThumbColor).toBe("#8E8E93");
      expect(colors.uncheckedBorderColor).toBe("rgba(255, 255, 255, 0.08)");
    });

    test("renders ComposeSwitch with Material 3 dynamic primary palette when material colors enabled", () => {
      currentPlatform = "android";
      mockMaterialColorsEnabled = true;
      const onValueChange = mock(() => {});

      let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
      act(() => {
        renderer = ReactTestRenderer.create(
          <ToggleSwitch
            value={false}
            onValueChange={onValueChange}
            accessibilityLabel="Material Colors"
          />,
        );
      });

      const switchComp = renderer!.root.findByType("ExpoComposeSwitch");
      const colors = switchComp.props.colors;
      // In dark mode with dynamic Material You: accent is dynamic primary (#FFB4AB), onAccent is #690005
      expect(colors.checkedTrackColor).toBe("#FFB4AB");
      expect(colors.checkedThumbColor).toBe("#690005");
      expect(colors.checkedBorderColor).toBe("#FFB4AB");
    });

    test("forwards onCheckedChange to onValueChange and fires haptics once when enabled", () => {
      currentPlatform = "android";
      mockHapticsEnabled = true;
      mockSelectionAsync.mockClear();
      const onValueChange = mock(() => {});

      let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
      act(() => {
        renderer = ReactTestRenderer.create(
          <ToggleSwitch
            value={false}
            onValueChange={onValueChange}
            accessibilityLabel="Auto Summarize"
          />,
        );
      });

      const switchComp = renderer!.root.findByType("ExpoComposeSwitch");
      act(() => {
        switchComp.props.onCheckedChange(true);
      });

      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenCalledWith(true);
      expect(mockSelectionAsync).toHaveBeenCalledTimes(1);
    });

    test("disabled switch sets enabled=false and disables onCheckedChange handler", () => {
      currentPlatform = "android";
      mockHapticsEnabled = true;
      mockSelectionAsync.mockClear();
      const onValueChange = mock(() => {});

      let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
      act(() => {
        renderer = ReactTestRenderer.create(
          <ToggleSwitch
            value={false}
            onValueChange={onValueChange}
            accessibilityLabel="Disabled Switch"
            disabled={true}
          />,
        );
      });

      const switchComp = renderer!.root.findByType("ExpoComposeSwitch");
      expect(switchComp.props.enabled).toBe(false);
      expect(switchComp.props.onCheckedChange).toBeUndefined();
      expect(onValueChange).toHaveBeenCalledTimes(0);
      expect(mockSelectionAsync).toHaveBeenCalledTimes(0);
    });
  });

  describe("Apple iOS / iPadOS (SwiftUI Toggle)", () => {
    test("renders SwiftUIToggle with tint modifier, labelsHidden, and accessible label", () => {
      currentPlatform = "ios";
      const onValueChange = mock(() => {});

      let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
      act(() => {
        renderer = ReactTestRenderer.create(
          <ToggleSwitch
            value={true}
            onValueChange={onValueChange}
            accessibilityLabel="Haptic Feedback"
            testID="ios-haptics-switch"
          />,
        );
      });

      const root = renderer!.root;
      const toggle = root.findByType("ExpoSwiftUIToggle");
      expect(toggle).toBeDefined();
      expect(toggle.props.isOn).toBe(true);
      expect(toggle.props.label).toBe("Haptic Feedback");
      expect(toggle.props.testID).toBe("ios-haptics-switch");

      // Modifiers should include tint(#FFFFFF) and labelsHidden()
      expect(toggle.props.modifiers).toEqual([
        { type: "tint", color: "#FFFFFF" },
        { type: "labelsHidden" },
      ]);
    });

    test("includes disabled modifier and suppresses onIsOnChange when disabled on iOS", () => {
      currentPlatform = "ios";
      const onValueChange = mock(() => {});

      let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
      act(() => {
        renderer = ReactTestRenderer.create(
          <ToggleSwitch
            value={false}
            onValueChange={onValueChange}
            accessibilityLabel="Disabled Toggle"
            disabled={true}
          />,
        );
      });

      const toggle = renderer!.root.findByType("ExpoSwiftUIToggle");
      expect(toggle.props.onIsOnChange).toBeUndefined();
      expect(toggle.props.modifiers).toEqual([
        { type: "tint", color: "#FFFFFF" },
        { type: "labelsHidden" },
        { type: "disabled", disabled: true },
      ]);
    });

    test("forwards onIsOnChange to onValueChange and fires haptics on iOS", () => {
      currentPlatform = "ios";
      mockHapticsEnabled = true;
      mockSelectionAsync.mockClear();
      const onValueChange = mock(() => {});

      let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
      act(() => {
        renderer = ReactTestRenderer.create(
          <ToggleSwitch
            value={false}
            onValueChange={onValueChange}
            accessibilityLabel="Adaptive Nudges"
          />,
        );
      });

      const toggle = renderer!.root.findByType("ExpoSwiftUIToggle");
      act(() => {
        toggle.props.onIsOnChange(true);
      });

      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenCalledWith(true);
      expect(mockSelectionAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe("Web / Fallback Platform (Universal Switch)", () => {
    test("renders UniversalSwitch on web platform", () => {
      currentPlatform = "web";
      const onValueChange = mock(() => {});

      let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
      act(() => {
        renderer = ReactTestRenderer.create(
          <ToggleSwitch
            value={true}
            onValueChange={onValueChange}
            accessibilityLabel="Web Switch"
          />,
        );
      });

      const switchComp = renderer!.root.findByType("ExpoUniversalSwitch");
      expect(switchComp).toBeDefined();
      expect(switchComp.props.value).toBe(true);
    });
  });
});
