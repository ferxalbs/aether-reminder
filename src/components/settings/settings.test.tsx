import { describe, expect, mock, test } from "bun:test";
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

mock.module("expo-blur", () => ({
  BlurView: MockView,
  BlurTargetView: MockView,
}));

mock.module("expo-asset", () => ({
  Asset: { fromModule: () => ({ uri: "test-uri" }) },
}));

mock.module("expo-font", () => ({
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));

mock.module("react-native-svg", () => ({
  default: MockView,
  Svg: MockView,
  Path: MockView,
  Circle: MockView,
  Rect: MockView,
  G: MockView,
}));

const MockView: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("View", props, props.children as React.ReactNode);

const MockText: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("Text", props, props.children as React.ReactNode);

mock.module("react-native", () => ({
  Platform: {
    OS: "ios",
    select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
  },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    flatten: (style: unknown) =>
      Array.isArray(style) ? Object.assign({}, ...style) : style || {},
    hairlineWidth: 1,
    absoluteFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
    absoluteFillObject: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
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

mock.module("react-native-reanimated", () => ({
  default: {
    View: MockView,
    Text: MockText,
    createAnimatedComponent: (c: unknown) => c,
  },
  useReducedMotion: () => false,
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useSharedValue: (val: unknown) => ({ value: val }),
  withSpring: (toValue: unknown) => toValue,
  withTiming: (toValue: unknown) => toValue,
  ReduceMotion: { Never: 0 },
  Layout: {
    springify: () => ({
      damping: () => ({
        stiffness: () => undefined,
      }),
    }),
  },
  FadeIn: {
    duration: () => ({
      damping: () => ({
        stiffness: () => undefined,
      }),
    }),
  },
  FadeOut: {
    duration: () => ({
      damping: () => ({
        stiffness: () => undefined,
      }),
    }),
  },
  FadeInDown: {
    duration: () => ({
      damping: () => ({
        stiffness: () => undefined,
      }),
    }),
  },
  FadeOutDown: {
    duration: () => ({
      damping: () => ({
        stiffness: () => undefined,
      }),
    }),
  },
}));

mock.module("lucide-react-native", () => ({
  Check: MockView,
  RefreshCw: MockView,
  Search: MockView,
  ChevronDown: MockView,
  Flag: MockView,
  Mic: MockView,
  Minus: MockView,
  Plus: MockView,
  Repeat2: MockView,
  X: MockView,
  Clock: MockView,
  Sparkles: MockView,
  Trash2: MockView,
  ArrowUp: MockView,
  Key: MockView,
  Cpu: MockView,
  Eye: MockView,
  EyeOff: MockView,
  Info: MockView,
  Lock: MockView,
  Moon: MockView,
  Palette: MockView,
  RotateCcw: MockView,
  Shield: MockView,
  ShieldCheck: MockView,
  Vibrate: MockView,
}));

mock.module("@/stores/settings.store", () => ({
  useSettingsStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      hapticsEnabled: true,
      openRouterApiKey: "test-openrouter-key",
      openAiApiKey: "test-openai-key",
      openRouterKeyLoaded: true,
      openAiKeyLoaded: true,
      openRouterConfigured: true,
      openAiConfigured: true,
      secureStoreAvailable: true,
      selectedModel: "anthropic/claude-3.5-sonnet",
      theme: "dark",
      materialColorsEnabled: false,
      autoSummarize: true,
      adaptiveNudgesEnabled: true,
    };
    return selector ? selector(state) : state;
  },
}));

mock.module("expo-haptics", () => ({
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  selectionAsync: mock(() => Promise.resolve()),
  notificationAsync: mock(() => Promise.resolve()),
  impactAsync: mock(() => Promise.resolve()),
  performAndroidHapticsAsync: mock(() => Promise.resolve()),
  AndroidHaptics: {
    Confirm: "confirm",
    Gesture_End: "gesture_end",
    Reject: "reject",
    Segment_Frequent_Tick: "segment_frequent_tick",
  },
}));

mock.module("@/lib/haptics", () => ({
  impactAsync: mock(() => Promise.resolve()),
  selectionAsync: mock(() => Promise.resolve()),
  notificationAsync: mock(() => Promise.resolve()),
}));

const { SettingsSectionHeader } = await import("./SettingsSectionHeader");
const { SettingsCard } = await import("./SettingsCard");
const { SettingsHeaderRow } = await import("./SettingsHeaderRow");
const { SettingsRow } = await import("./SettingsRow");
const { SettingsSecurityCard } = await import("./SettingsSecurityCard");
const { SettingsAccordion } = await import("./SettingsAccordion");

describe("Settings Modular Components", () => {
  test("renders SettingsSectionHeader with uppercase text", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <SettingsSectionHeader title="AI Reasoning" />,
      );
    });
    expect(renderer).toBeDefined();
    const texts = renderer!.root.findAllByType("Text");
    expect(texts.some((t) => t.props.children === "AI REASONING")).toBe(true);
  });

  test("renders SettingsCard with children", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <SettingsCard>
          <MockText>Card Content</MockText>
        </SettingsCard>,
      );
    });
    expect(renderer).toBeDefined();
    const texts = renderer!.root.findAllByType("Text");
    expect(texts.some((t) => t.props.children === "Card Content")).toBe(true);
  });

  test("renders SettingsHeaderRow with title and subtitle", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <SettingsHeaderRow
          icon={<MockText>Icon</MockText>}
          title="OpenRouter API Key"
          subtitle="Powers reasoning"
        />,
      );
    });
    expect(renderer).toBeDefined();
    const texts = renderer!.root.findAllByType("Text");
    expect(texts.some((t) => t.props.children === "OpenRouter API Key")).toBe(
      true,
    );
    expect(texts.some((t) => t.props.children === "Powers reasoning")).toBe(
      true,
    );
  });

  test("renders SettingsRow with title, description and trailing control", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <SettingsRow
          title="Haptic Feedback"
          description="Tactile touch responses"
          trailing={<MockText>Switch</MockText>}
        />,
      );
    });
    expect(renderer).toBeDefined();
    const texts = renderer!.root.findAllByType("Text");
    expect(texts.some((t) => t.props.children === "Haptic Feedback")).toBe(
      true,
    );
    expect(
      texts.some((t) => t.props.children === "Tactile touch responses"),
    ).toBe(true);
  });

  test("renders SettingsSecurityCard", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(<SettingsSecurityCard />);
    });
    expect(renderer).toBeDefined();
    const texts = renderer!.root.findAllByType("Text");
    expect(
      texts.some((t) => t.props.children === "Expo SecureStore Encrypted"),
    ).toBe(true);
  });

  test("renders SettingsAccordion with About & Privacy sections", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(<SettingsAccordion />);
    });
    expect(renderer).toBeDefined();
    const texts = renderer!.root.findAllByType("Text");
    expect(texts.some((t) => t.props.children === "About AETHER")).toBe(true);
    expect(texts.some((t) => t.props.children === "Privacy Information")).toBe(
      true,
    );
  });
});
