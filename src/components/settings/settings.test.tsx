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
  AlertTriangle: MockView,
  Zap: MockView,
}));


mock.module("@/stores/settings.store", () => ({
  useSettingsStore: (
    selector?: (state: Record<string, unknown>) => unknown,
  ) => {
    const state = {
      hapticsEnabled: true,
      theme: "dark",
      materialColorsEnabled: false,
      autoSummarize: true,
      adaptiveNudgesEnabled: true,
    };
    return selector ? selector(state) : state;
  },
}));

mock.module("@/hooks/useAetherUsage", () => ({
  useAetherUsage: () => ({
    snapshot: {
      plan: { tier: "free", displayName: "AETHER Free" },
      period: { resetsAt: "2026-10-01T00:00:00Z" },
      ai: { used: 42, limit: 75, remaining: 33 },
      voice: { usedSeconds: 252, limitSeconds: 600, remainingSeconds: 348 },
      automations: { used: 0, limit: 20, remaining: 20 },
      capabilities: {
        hostedInference: true,
        liveTranscription: true,
        cloudAutomations: false,
      },
    },
    plan: { tier: "free", displayName: "AETHER Free" },
    state: "loaded",
    errorMessage: null,
    refresh: () => Promise.resolve(),
  }),
}));

mock.module("expo-haptics", () => ({
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
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
const { UsageSection } = await import("./UsageSection");
const { SettingsAccordion } = await import("./SettingsAccordion");

describe("Settings Modular Components", () => {
  test("renders SettingsSectionHeader with uppercase text", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <SettingsSectionHeader title="Hosted AI & Voice" />,
      );
    });
    expect(renderer).toBeDefined();
    const texts = renderer!.root.findAllByType("Text");
    expect(texts.some((t) => t.props.children === "HOSTED AI & VOICE")).toBe(true);
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
          title="App Settings"
          subtitle="Customize your experience"
        />,
      );
    });
    expect(renderer).toBeDefined();
    const texts = renderer!.root.findAllByType("Text");
    expect(texts.some((t) => t.props.children === "App Settings")).toBe(
      true,
    );
    expect(texts.some((t) => t.props.children === "Customize your experience")).toBe(
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

  test("renders UsageSection with plan badge, metrics, and upgrade CTA", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(<UsageSection />);
    });
    expect(renderer).toBeDefined();
    const texts = renderer!.root.findAllByType("Text");
    expect(texts.some((t) => t.props.children === "AETHER Free")).toBe(true);
    expect(texts.some((t) => t.props.children === "AI Assistant")).toBe(true);
    expect(texts.some((t) => t.props.children === "Voice Capture")).toBe(true);
    expect(texts.some((t) => t.props.children === "Upgrade to Pro")).toBe(true);
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
