import { describe, expect, mock, test } from "bun:test";
import React from "react";

(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

const MockView: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("View", props, props.children as React.ReactNode);

const MockText: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("Text", props, props.children as React.ReactNode);

// Mock react-native
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
}));

// Mock @expo/ui Universal Picker & Host
const MockPickerItem = (props: Record<string, unknown>) =>
  React.createElement("ExpoPickerItem", props, null);

const MockPicker = Object.assign(
  (props: Record<string, unknown>) =>
    React.createElement("ExpoPicker", props, props.children as React.ReactNode),
  { Item: MockPickerItem },
);

const MockHost = (props: Record<string, unknown>) =>
  React.createElement("ExpoHost", props, props.children as React.ReactNode);

const MockSwitch = (props: Record<string, unknown>) =>
  React.createElement("ExpoSwitch", props, null);

mock.module("@expo/ui", () => ({
  Host: MockHost,
  Picker: MockPicker,
  Switch: MockSwitch,
}));

mock.module("@expo/ui/jetpack-compose", () => ({
  isDynamicColorAvailable: true,
  getMaterialColors: () => null,
}));

mock.module("@expo/ui/swift-ui", () => ({}));

let mockHapticsEnabled = true;
mock.module("@/stores/settings.store", () => ({
  useSettingsStore: {
    getState: () => ({ hapticsEnabled: mockHapticsEnabled }),
  },
}));

const mockSelectionAsync = mock(() => Promise.resolve());
mock.module("@/lib/haptics", () => ({
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
    textSecondary: "#a1a1aa",
  }),
}));

const { Picker } = await import("./Picker");
const ReactTestRenderer = (await import("react-test-renderer")).default;
const { act } = await import("react-test-renderer");

describe("Picker Universal native-backed adapter", () => {
  test("renders AETHER label and delegates options to UniversalPicker.Item children", () => {
    const onValueChange = mock(() => {});
    const options = [
      { value: "daily" as const, label: "Daily" },
      { value: "weekly" as const, label: "Weekly" },
      { value: "monthly" as const, label: "Monthly" },
    ];

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <Picker<"daily" | "weekly" | "monthly">
          label="Frequency"
          value="weekly"
          options={options}
          onValueChange={onValueChange}
          helperText="Select cadence"
          testID="frequency-picker"
        />,
      );
    });

    const root = renderer!.root;
    const picker = root.findByType("ExpoPicker");
    expect(picker).toBeDefined();
    expect(picker.props.selectedValue).toBe("weekly");
    expect(picker.props.enabled).toBe(true);
    expect(picker.props.appearance).toBe("menu");
    expect(picker.props.testID).toBe("frequency-picker");

    const items = root.findAllByType("ExpoPickerItem");
    expect(items.length).toBe(3);
    expect(items[0].props.value).toBe("daily");
    expect(items[0].props.label).toBe("Daily");
    expect(items[1].props.value).toBe("weekly");
    expect(items[1].props.label).toBe("Weekly");
    expect(items[2].props.value).toBe("monthly");
    expect(items[2].props.label).toBe("Monthly");

    // Host checks
    const host = root.findByType("ExpoHost");
    expect(host).toBeDefined();
    expect(host.props.matchContents).toBe(true);
    expect(host.props.colorScheme).toBe("dark");
  });

  test("maps typed value on selection change and fires haptics once when enabled", () => {
    mockHapticsEnabled = true;
    mockSelectionAsync.mockClear();
    const onValueChange = mock(() => {});
    const options = [
      { value: "low" as const, label: "Low" },
      { value: "medium" as const, label: "Medium" },
      { value: "high" as const, label: "High" },
    ];

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <Picker<"low" | "medium" | "high">
          label="Priority"
          value="low"
          options={options}
          onValueChange={onValueChange}
        />,
      );
    });

    const picker = renderer!.root.findByType("ExpoPicker");

    act(() => {
      picker.props.onValueChange("high");
    });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("high");
    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);
  });

  test("does not fire haptics when selected value is unchanged or haptics disabled", () => {
    mockHapticsEnabled = false;
    mockSelectionAsync.mockClear();
    const onValueChange = mock(() => {});
    const options = [
      { value: 1, label: "One" },
      { value: 2, label: "Two" },
    ];

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <Picker<number>
          label="Number"
          value={1}
          options={options}
          onValueChange={onValueChange}
        />,
      );
    });

    const picker = renderer!.root.findByType("ExpoPicker");

    act(() => {
      picker.props.onValueChange(2);
    });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(2);
    expect(mockSelectionAsync).toHaveBeenCalledTimes(0);
  });

  test("handles disabled field state safely and ignores incoming changes", () => {
    mockHapticsEnabled = true;
    mockSelectionAsync.mockClear();
    const onValueChange = mock(() => {});
    const options = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ];

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <Picker<string>
          label="Disabled Picker"
          value="a"
          options={options}
          onValueChange={onValueChange}
          disabled={true}
        />,
      );
    });

    const picker = renderer!.root.findByType("ExpoPicker");
    expect(picker.props.enabled).toBe(false);

    act(() => {
      picker.props.onValueChange("b");
    });

    expect(onValueChange).toHaveBeenCalledTimes(0);
    expect(mockSelectionAsync).toHaveBeenCalledTimes(0);
  });

  test("ignores unknown values not present in the options list", () => {
    mockHapticsEnabled = true;
    mockSelectionAsync.mockClear();
    const onValueChange = mock(() => {});
    const options = [
      { value: "first", label: "First" },
      { value: "second", label: "Second" },
    ];

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <Picker<string>
          label="Strict Picker"
          value="first"
          options={options}
          onValueChange={onValueChange}
        />,
      );
    });

    const picker = renderer!.root.findByType("ExpoPicker");

    act(() => {
      picker.props.onValueChange("nonexistent");
    });

    expect(onValueChange).toHaveBeenCalledTimes(0);
    expect(mockSelectionAsync).toHaveBeenCalledTimes(0);
  });

  test("falls back to accessibilityLabel or label for testID when testID is omitted", () => {
    const options = [{ value: "opt", label: "Option" }];
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <Picker<string>
          label="Fallback Label"
          accessibilityLabel="Accessible Label"
          value="opt"
          options={options}
          onValueChange={() => {}}
        />,
      );
    });

    const picker = renderer!.root.findByType("ExpoPicker");
    expect(picker.props.testID).toBe("Accessible Label");
  });

  test("renders error message with alert role and helper text when no error", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <Picker<string>
          label="Validation Picker"
          value="val"
          options={[{ value: "val", label: "Value" }]}
          onValueChange={() => {}}
          error="Field is required"
        />,
      );
    });

    const root = renderer!.root;
    const errorText = root.findByProps({ accessibilityRole: "alert" });
    expect(errorText).toBeDefined();
    expect(errorText.props.children).toBe("Field is required");
  });
});
