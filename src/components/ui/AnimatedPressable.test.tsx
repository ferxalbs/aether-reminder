import { describe, expect, mock, test } from "bun:test";
import React from "react";

(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

const MockPressable: React.FC<Record<string, unknown>> = (props) =>
  React.createElement(
    "MockPressable",
    props,
    props.children as React.ReactNode,
  );

mock.module("react-native", () => ({
  Platform: { OS: "android" },
  Pressable: MockPressable,
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    flatten: (style: unknown) =>
      Array.isArray(style) ? Object.assign({}, ...style) : style || {},
    hairlineWidth: 1,
  },
}));

mock.module("react-native-reanimated", () => ({
  default: {
    createAnimatedComponent: (component: unknown) => component,
  },
  ReduceMotion: { Never: 0 },
  useAnimatedStyle: () => ({}),
  useReducedMotion: () => false,
  useSharedValue: (value: number) => ({ value }),
  withSpring: (value: number) => value,
}));

mock.module("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
}));

mock.module("@/stores/settings.store", () => ({
  useSettingsStore: {
    getState: () => ({ hapticsEnabled: false }),
  },
}));

mock.module("@/lib/haptics", () => ({
  impactAsync: () => Promise.resolve(),
}));

mock.module("@/lib/nonFatalError", () => ({
  reportNonFatalError: () => undefined,
}));

mock.module("@/motion", () => ({
  useMotionPreset: () => ({
    mode: "none",
    damping: 0,
    stiffness: 0,
    mass: 0,
  }),
}));

const {
  AnimatedPressable,
  getBoundedRippleConfig,
  getFeedbackClipStyle,
  getMinimumTouchTargetHitSlop,
} = await import("./AnimatedPressable");
const { Radius } = await import("@/theme/tokens");
const ReactTestRenderer = (await import("react-test-renderer")).default;
const { act } = await import("react-test-renderer");

function flattenStyle(style: unknown): Record<string, unknown> {
  return Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : ((style as Record<string, unknown>) ?? {});
}

function renderPressable(
  props: Partial<React.ComponentProps<typeof AnimatedPressable>> = {},
) {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = ReactTestRenderer.create(
      <AnimatedPressable onPress={() => undefined} {...props}>
        <React.Fragment />
      </AnimatedPressable>,
    );
  });
  return renderer!.root.findByType("MockPressable").props;
}

describe("AnimatedPressable interaction-shape contract", () => {
  test("preserves the Android minimum touch target by default", () => {
    const props = renderPressable();
    const style = flattenStyle(props.style);

    expect(style.minWidth).toBe(48);
    expect(style.minHeight).toBe(48);
  });

  test("maps an optional feedback radius to a bounded clip", () => {
    const props = renderPressable({
      interactionRadius: Radius.pill,
      android_ripple: { color: "#ffffff", borderless: true },
    });
    const style = flattenStyle(props.style);

    expect(style.borderRadius).toBe(Radius.pill);
    expect(style.overflow).toBe("hidden");
    expect(props.android_ripple.borderless).toBe(false);
  });

  test("does not impose global clipping on unshaped callers", () => {
    const props = renderPressable({
      android_ripple: { color: "#ffffff", borderless: true },
    });
    const style = flattenStyle(props.style);

    expect(style.overflow).toBeUndefined();
    expect(props.android_ripple.borderless).toBe(true);
    expect(getFeedbackClipStyle()).toEqual({});
  });

  test("keeps compact visual surfaces smaller while hit slop reaches the minimum", () => {
    const props = renderPressable({
      interactionRadius: 4,
      minimumTouchTarget: false,
      hitSlop: getMinimumTouchTargetHitSlop(20, 20, "android"),
    });
    const style = flattenStyle(props.style);

    expect(style.minWidth).toBeUndefined();
    expect(style.minHeight).toBeUndefined();
    expect(props.hitSlop).toEqual({
      top: 14,
      bottom: 14,
      left: 14,
      right: 14,
    });
  });

  test("preserves Pressable state styles and leaves external focus rings alone", () => {
    const props = renderPressable({
      interactionRadius: Radius.lg,
      style: ({ pressed }) => ({
        backgroundColor: pressed ? "#111111" : "transparent",
      }),
    });
    const style = flattenStyle(props.style({ pressed: true }));

    expect(style.backgroundColor).toBe("#111111");
    expect(style.borderRadius).toBe(Radius.lg);
    expect(style.overflow).toBe("hidden");
    expect(style.outlineWidth).toBeUndefined();
  });

  test("forces bounded ripples only for declared shaped surfaces", () => {
    expect(
      getBoundedRippleConfig({ color: "#ffffff", borderless: true }, 18),
    ).toEqual({ color: "#ffffff", borderless: false });
    expect(
      getBoundedRippleConfig({ color: "#ffffff", borderless: true }),
    ).toEqual({ color: "#ffffff", borderless: true });
  });
});
