import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, mock, test } from 'bun:test';

// React 19's renderer requires this flag for act()-based interaction tests.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const motionState = { reduceMotion: false };
const springCalls: { target: number; config: Record<string, unknown> }[] = [];

mock.module('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
  Pressable: 'Pressable',
  StyleSheet: {
    absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    create: <T,>(styles: T): T => styles,
  },
  Text: 'Text',
  View: 'View',
}));

mock.module('react-native-reanimated', () => ({
  ReduceMotion: {
    Never: 'never',
  },
  createAnimatedComponent: (component: unknown) => component,
  default: {
    View: 'AnimatedView',
    createAnimatedComponent: (component: unknown) => component,
  },
  interpolateColor: (value: number, input: number[], output: string[]) =>
    value <= input[0] ? output[0] : output[output.length - 1],
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => motionState.reduceMotion,
  useSharedValue: <T,>(value: T) => ({ value }),
  withSpring: (target: number, config: Record<string, unknown>) => {
    springCalls.push({ target, config });
    return target;
  },
  withTiming: (target: number) => target,
}));

mock.module('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

mock.module('expo-blur', () => ({ BlurView: 'BlurView' }));

mock.module('expo-glass-effect', () => ({
  GlassView: 'GlassView',
  isGlassEffectAPIAvailable: () => false,
  isLiquidGlassAvailable: () => false,
}));

mock.module('@/stores/settings.store', () => ({
  useSettingsStore: {
    getState: () => ({ hapticsEnabled: false }),
  },
}));

mock.module('@/lib/haptics', () => ({
  impactAsync: async () => undefined,
  notificationAsync: async () => undefined,
  selectionAsync: async () => undefined,
}));

mock.module('@/lib/nonFatalError', () => ({
  reportNonFatalError: () => undefined,
}));

mock.module('@/theme/useResolvedTheme', () => ({
  useIsDark: () => false,
}));

mock.module('lucide-react-native', () => ({
  Check: 'Check',
  Clock: 'Clock',
  Sparkles: 'Sparkles',
  Trash2: 'Trash2',
}));

const flattenStyle = (style: unknown): Record<string, unknown> => {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (accumulator, item) => ({ ...accumulator, ...flattenStyle(item) }),
      {},
    );
  }
  if (typeof style === 'object') return style as Record<string, unknown>;
  return {};
};

const render = (element: React.ReactElement): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  return renderer;
};

const unmount = (renderer: ReactTestRenderer): void => {
  act(() => {
    renderer.unmount();
  });
};

const loadPrimitives = async () => {
  const [animatedPressable, button, card, glassSurface, iconButton, toggleSwitch, typography] =
    await Promise.all([
      import('./AnimatedPressable'),
      import('./Button'),
      import('./Card'),
      import('./GlassSurface'),
      import('./IconButton'),
      import('./ToggleSwitch'),
      import('./Typography'),
    ]);

  return {
    AnimatedPressable: animatedPressable.AnimatedPressable,
    Button: button.Button,
    Card: card.Card,
    GlassSurface: glassSurface.GlassSurface,
    IconButton: iconButton.IconButton,
    ToggleSwitch: toggleSwitch.ToggleSwitch,
    Typography: typography.Typography,
  };
};

describe('unified UI primitives', () => {
  test('AnimatedPressable exposes the shared press contract and honors Reduce Motion', async () => {
    const { AnimatedPressable } = await loadPrimitives();
    motionState.reduceMotion = false;
    springCalls.length = 0;

    const renderer = render(
      React.createElement(
        AnimatedPressable,
        {
          accessibilityRole: 'button',
          accessibilityLabel: 'Save task',
          onPress: () => undefined,
        },
        'Save',
      ),
    );
    const pressable = renderer.root.findByType('Pressable');

    expect(pressable.props.accessibilityRole).toBe('button');
    expect(pressable.props.accessibilityLabel).toBe('Save task');
    expect(flattenStyle(pressable.props.style)).toMatchObject({
      minWidth: 44,
      minHeight: 44,
    });

    act(() => {
      pressable.props.onPressIn({});
      pressable.props.onPressOut({});
    });
    expect(springCalls).toHaveLength(2);
    expect(springCalls[0].config).toMatchObject({ reduceMotion: 'never' });
    unmount(renderer);

    motionState.reduceMotion = true;
    springCalls.length = 0;
    const reducedRenderer = render(
      React.createElement(
        AnimatedPressable,
        { accessibilityRole: 'button', accessibilityLabel: 'Save task' },
        'Save',
      ),
    );
    const reducedPressable = reducedRenderer.root.findByType('Pressable');
    act(() => {
      reducedPressable.props.onPressIn({});
      reducedPressable.props.onPressOut({});
    });
    expect(springCalls).toHaveLength(0);
    unmount(reducedRenderer);
  });

  test('Button owns its role, label, disabled state, ripple, and touch target', async () => {
    const { Button } = await loadPrimitives();
    motionState.reduceMotion = false;
    const renderer = render(
      React.createElement(Button, {
        label: 'Continue',
        onPress: () => undefined,
        loading: true,
      }),
    );
    const pressable = renderer.root.findByType('Pressable');
    const style = flattenStyle(pressable.props.style);

    expect(pressable.props.accessibilityRole).toBe('button');
    expect(pressable.props.accessibilityLabel).toBe('Continue');
    expect(pressable.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(pressable.props.android_ripple).toEqual({ color: expect.any(String) });
    expect(style.minHeight).toBe(44);
    expect(style.borderRadius).toBe(9999);
    unmount(renderer);
  });

  test('IconButton clamps small visual sizes to the iOS touch target', async () => {
    const { IconButton } = await loadPrimitives();
    const renderer = render(
      React.createElement(IconButton, {
        icon: React.createElement('Icon'),
        onPress: () => undefined,
        accessibilityLabel: 'Delete task',
        size: 36,
      }),
    );
    const pressable = renderer.root.findByType('Pressable');
    const style = flattenStyle(pressable.props.style);

    expect(pressable.props.accessibilityRole).toBe('button');
    expect(pressable.props.accessibilityLabel).toBe('Delete task');
    expect(pressable.props.accessibilityState).toEqual({ disabled: false });
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
    unmount(renderer);
  });

  test('ToggleSwitch exposes a labeled switch and disables spring motion when requested', async () => {
    const { ToggleSwitch } = await loadPrimitives();
    motionState.reduceMotion = true;
    springCalls.length = 0;

    const renderer = render(
      React.createElement(ToggleSwitch, {
        value: true,
        onValueChange: () => undefined,
        accessibilityLabel: 'Haptic Feedback',
      }),
    );
    const pressable = renderer.root.findByType('Pressable');
    const style = flattenStyle(pressable.props.style);

    expect(pressable.props.accessibilityRole).toBe('switch');
    expect(pressable.props.accessibilityLabel).toBe('Haptic Feedback');
    expect(pressable.props.accessibilityState).toEqual({ checked: true, disabled: false });
    expect(style.minWidth).toBe(44);
    expect(style.minHeight).toBe(44);
    expect(springCalls).toHaveLength(0);
    unmount(renderer);
  });

  test('Card, GlassSurface, and Typography preserve semantic surface contracts', async () => {
    const { Card, GlassSurface, Typography } = await loadPrimitives();

    const cardRenderer = render(
      React.createElement(Card, {
        onPress: () => undefined,
        accessibilityLabel: 'Open task details',
        accessibilityHint: 'Opens task details',
      }, 'Task'),
    );
    const cardPressable = cardRenderer.root.findByType('Pressable');
    expect(cardPressable.props.accessibilityRole).toBe('button');
    expect(cardPressable.props.accessibilityLabel).toBe('Open task details');
    expect(cardPressable.props.accessibilityHint).toBe('Opens task details');
    unmount(cardRenderer);

    const glassCardRenderer = render(
      React.createElement(Card, { variant: 'glass' }, 'Glass card'),
    );
    expect(glassCardRenderer.root.findByType('BlurView')).toBeDefined();
    unmount(glassCardRenderer);

    const surfaceRenderer = render(
      React.createElement(GlassSurface, {
        accessible: true,
        accessibilityLabel: 'Summary surface',
      }, 'Summary'),
    );
    const surface = surfaceRenderer.root.findAllByType('View')[0];
    expect(surface.props.accessible).toBe(true);
    expect(surface.props.accessibilityLabel).toBe('Summary surface');
    unmount(surfaceRenderer);

    const typographyRenderer = render(
      React.createElement(Typography, { variant: 'title' }, 'AETHER'),
    );
    const text = typographyRenderer.root.findByType('Text');
    expect(text.props.allowFontScaling).toBe(true);
    expect(flattenStyle(text.props.style)).toMatchObject({ fontSize: 18, lineHeight: 24 });
    unmount(typographyRenderer);
  });

  test('TaskCard keeps non-interactive cards non-pressable and labels child actions', async () => {
    const { TaskCard } = await import('./TaskCard');
    motionState.reduceMotion = true;

    const renderer = render(
      React.createElement(TaskCard, {
        task: {
          id: 'task-1',
          title: 'Ship unified UI',
          completed: false,
          createdAt: '2026-08-08T00:00:00.000Z',
          priority: 'medium',
        },
        onToggle: () => undefined,
        onDelete: () => undefined,
      }),
    );
    const pressables = renderer.root.findAllByType('Pressable');

    expect(pressables).toHaveLength(2);
    expect(pressables[0].props.accessibilityRole).toBe('checkbox');
    expect(pressables[0].props.accessibilityLabel).toBe(
      'Mark Ship unified UI as complete',
    );
    expect(pressables[1].props.accessibilityRole).toBe('button');
    expect(pressables[1].props.accessibilityLabel).toBe('Delete Ship unified UI');
    expect(flattenStyle(pressables[1].props.style)).toMatchObject({
      width: 44,
      height: 44,
    });
    unmount(renderer);
  });

  test('design tokens expose platform touch targets and shared motion values', async () => {
    const { getMinimumTouchTarget, Motion, TouchTargets } = await import('@/theme/tokens');

    expect(getMinimumTouchTarget('ios')).toBe(TouchTargets.ios);
    expect(getMinimumTouchTarget('android')).toBe(TouchTargets.android);
    expect(TouchTargets.ios).toBe(44);
    expect(TouchTargets.android).toBe(48);
    expect(Motion.pressSpring).toMatchObject({ damping: 24, stiffness: 350 });
  });
});
