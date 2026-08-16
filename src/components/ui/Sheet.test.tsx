import { describe, expect, mock, test } from "bun:test";
import React from "react";

const MockView: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("View", props, props.children as React.ReactNode);

const MockText: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("Text", props, props.children as React.ReactNode);

// Mock react-native and dependencies for the Bun test environment
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
  Pressable: MockView,
  Modal: MockView,
  Touchable: { Mixin: {} },
  useColorScheme: () => "dark",
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
}));

mock.module("@expo/ui/community/bottom-sheet", () => ({
  BottomSheet: (props: Record<string, unknown>) =>
    React.createElement(
      "BottomSheet",
      props,
      props.children as React.ReactNode,
    ),
}));

mock.module("@/theme/useResolvedTheme", () => ({
  useIsDark: () => true,
  useResolvedTheme: () => "dark",
}));

mock.module("@/theme/useAetherTheme", () => ({
  useAetherTheme: () => ({
    mode: "dark",
    source: "aether",
    isDynamicColorAvailable: false,
    colors: {
      textSecondary: "#8E8E93",
    },
    components: {
      sheet: {
        background: "#000000",
        border: "rgba(255, 255, 255, 0.08)",
        handle: "#52525B",
      },
    },
    shape: { sheet: 36 },
  }),
}));

// Import Sheet and test renderer
const { Sheet } = await import("./Sheet");
const ReactTestRenderer = (await import("react-test-renderer")).default;
const { act } = await import("react-test-renderer");

describe("Sheet native-first presentation adapter", () => {
  test("renders children and maps visible state to BottomSheet index", () => {
    const onRequestClose = mock(() => {});
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    act(() => {
      renderer = ReactTestRenderer.create(
        <Sheet
          visible={true}
          onRequestClose={onRequestClose}
          title="Test Sheet"
          subtitle="Subtitle text"
          testID="test-sheet"
        >
          <MockView testID="content-child" />
        </Sheet>,
      );
    });

    const root = renderer!.root;
    const dialogView = root.findByProps({ accessibilityLabel: "Test Sheet" });
    expect(dialogView).toBeDefined();
    expect(dialogView.props.role).toBe("dialog");
    expect(dialogView.props.testID).toBe("test-sheet");

    const contentChild = root.findByProps({ testID: "content-child" });
    expect(contentChild).toBeDefined();
  });

  test("calls onRequestClose on dismissal when dismissible is true", () => {
    const onRequestClose = mock(() => {});
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    act(() => {
      renderer = ReactTestRenderer.create(
        <Sheet
          visible={true}
          onRequestClose={onRequestClose}
          dismissible={true}
          title="Dismissible Sheet"
        >
          <MockView testID="content" />
        </Sheet>,
      );
    });

    const bottomSheet = renderer!.root.findByType("BottomSheet");
    expect(bottomSheet).toBeDefined();
    expect(bottomSheet.props.index).toBe(0);
    expect(bottomSheet.props.enablePanDownToClose).toBe(true);

    act(() => {
      bottomSheet.props.onClose();
    });

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  test("does not call onRequestClose on dismissal when dismissible is false", () => {
    const onRequestClose = mock(() => {});
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    act(() => {
      renderer = ReactTestRenderer.create(
        <Sheet
          visible={true}
          onRequestClose={onRequestClose}
          dismissible={false}
          title="Locked Sheet"
        >
          <MockView testID="content" />
        </Sheet>,
      );
    });

    const bottomSheet = renderer!.root.findByType("BottomSheet");
    expect(bottomSheet.props.enablePanDownToClose).toBe(false);

    act(() => {
      bottomSheet.props.onClose();
    });

    expect(onRequestClose).toHaveBeenCalledTimes(0);
  });

  test("renders headerAction, footer, and custom snap points", () => {
    const onRequestClose = mock(() => {});
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    act(() => {
      renderer = ReactTestRenderer.create(
        <Sheet
          visible={true}
          onRequestClose={onRequestClose}
          title="Header Sheet"
          headerAction={<MockView testID="custom-header-action" />}
          footer={<MockView testID="custom-footer" />}
          snapPoints={["50%", "90%"]}
        >
          <MockView testID="body" />
        </Sheet>,
      );
    });

    const root = renderer!.root;
    const headerAction = root.findByProps({ testID: "custom-header-action" });
    expect(headerAction).toBeDefined();

    const footer = root.findByProps({ testID: "custom-footer" });
    expect(footer).toBeDefined();

    const bottomSheet = root.findByType("BottomSheet");
    expect(bottomSheet.props.snapPoints).toEqual(["50%", "90%"]);
  });

  test("sets index to -1 when visible is false", () => {
    const onRequestClose = mock(() => {});
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    act(() => {
      renderer = ReactTestRenderer.create(
        <Sheet
          visible={false}
          onRequestClose={onRequestClose}
          title="Closed Sheet"
        >
          <MockView testID="body" />
        </Sheet>,
      );
    });

    const bottomSheet = renderer!.root.findByType("BottomSheet");
    expect(bottomSheet.props.index).toBe(-1);
  });
});
