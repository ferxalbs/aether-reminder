import { beforeEach, describe, expect, mock, test } from "bun:test";
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";

(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
process.env.EXPO_OS = "ios";
(globalThis as unknown as { window: Record<string, unknown> }).window = {
  location: { protocol: "http:", search: "?platform=ios" },
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as unknown as { expo: Record<string, unknown> }).expo = {
  EventEmitter: class {
    addListener() {
      return { remove: () => {} };
    }
    removeAllListeners() {}
    emit() {}
  },
  modules: {
    ExpoAsset: {},
  },
};

function MockView(props: Record<string, unknown>) {
  return React.createElement("View", props, props.children as React.ReactNode);
}

function MockText(props: Record<string, unknown>) {
  return React.createElement("Text", props, props.children as React.ReactNode);
}

mock.module("expo-blur", () => ({
  BlurView: MockView,
  BlurTargetView: MockView,
}));

mock.module("react-native", () => ({
  Platform: {
    OS: "ios",
    select: (obj: Record<string, unknown>) => obj.ios ?? obj.default ?? obj.web,
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
  ScrollView: MockView,
  Pressable: MockView,
  Modal: MockView,
  Image: MockView,
  Touchable: { Mixin: {} },
  useColorScheme: () => "dark",
  processColor: (c: unknown) => c,
  PanResponder: { create: () => ({ panHandlers: {} }) },
  findNodeHandle: () => null,
  PixelRatio: {
    get: () => 2,
    roundToNearestPixel: (n: number) => n,
  },
  NativeEventEmitter: class {
    addListener() {
      return { remove: () => {} };
    }
    removeAllListeners() {}
  },
  LogBox: {
    ignoreLogs: () => {},
    ignoreAllLogs: () => {},
  },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  AppRegistry: { registerComponent: () => {} },
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: () => {} }),
  },
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove: () => {} }),
  },
}));

mock.module("lucide-react-native", () => ({
  ChevronDown: MockView,
}));

let mockHapticsEnabled = true;
mock.module("@/stores/settings.store", () => ({
  useSettingsStore: Object.assign(
    () => ({ hapticsEnabled: mockHapticsEnabled }),
    { getState: () => ({ hapticsEnabled: mockHapticsEnabled }) },
  ),
}));

const mockSelectionAsync = mock(() => Promise.resolve());
mock.module("@/lib/haptics", () => ({
  impactAsync: mock(() => Promise.resolve()),
  notificationAsync: mock(() => Promise.resolve()),
  selectionAsync: mockSelectionAsync,
}));

mock.module("@/theme/useResolvedTheme", () => ({
  useIsDark: () => true,
  useResolvedTheme: () => "dark",
}));

mock.module("@/theme/useSemanticColors", () => ({
  useSemanticColors: () => ({
    accent: "#3b82f6",
    onAccent: "#ffffff",
    elevatedSurface: "#18181b",
    surfaceRaised: "#18181b",
    textPrimary: "#ffffff",
    textSecondary: "#a1a1aa",
    textTertiary: "#71717a",
    destructive: "#ff453a",
    ripple: "rgba(255,255,255,0.1)",
  }),
}));

const { Picker } = await import("./Picker");

describe("Picker component", () => {
  beforeEach(() => {
    mockHapticsEnabled = true;
    mockSelectionAsync.mockClear();
  });

  const options = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  test("renders label and options in segmented mode on iOS", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <Picker
          label="Recurrence"
          options={options}
          value="daily"
          onValueChange={() => {}}
        />,
      );
    });
    expect(renderer).toBeDefined();
    const texts = renderer!.root.findAllByType("Text");
    expect(texts.some((t) => t.props.children === "Recurrence")).toBe(true);
    expect(texts.some((t) => t.props.children === "Daily")).toBe(true);
    expect(texts.some((t) => t.props.children === "Weekly")).toBe(true);
    expect(texts.some((t) => t.props.children === "Monthly")).toBe(true);
  });

  test("renders helperText and error correctly", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <Picker
          label="Recurrence"
          options={options}
          value="daily"
          onValueChange={() => {}}
          helperText="Choose how often this task repeats"
        />,
      );
    });
    let texts = renderer!.root.findAllByType("Text");
    expect(
      texts.some(
        (t) => t.props.children === "Choose how often this task repeats",
      ),
    ).toBe(true);

    act(() => {
      renderer = ReactTestRenderer.create(
        <Picker
          label="Recurrence"
          options={options}
          value="daily"
          onValueChange={() => {}}
          error="Invalid recurrence option"
        />,
      );
    });
    texts = renderer!.root.findAllByType("Text");
    expect(
      texts.some((t) => t.props.children === "Invalid recurrence option"),
    ).toBe(true);
  });
});
