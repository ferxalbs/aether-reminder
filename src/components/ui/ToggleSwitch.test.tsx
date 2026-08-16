import { describe, expect, mock, test } from 'bun:test';
import React from 'react';

const MockView: React.FC<Record<string, unknown>> = (props) =>
  React.createElement('View', props, props.children as React.ReactNode);

const MockText: React.FC<Record<string, unknown>> = (props) =>
  React.createElement('Text', props, props.children as React.ReactNode);

// Mock react-native
mock.module('react-native', () => ({
  Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios ?? obj.default },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    flatten: (style: unknown) => (Array.isArray(style) ? Object.assign({}, ...style) : style || {}),
    hairlineWidth: 1,
    absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  },
  View: MockView,
  Text: MockText,
  useColorScheme: () => 'dark',
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
}));

// Mock @expo/ui Universal Switch, Picker & Host
const MockPickerItem = (props: Record<string, unknown>) =>
  React.createElement('ExpoPickerItem', props, null);

const MockPicker = Object.assign(
  (props: Record<string, unknown>) =>
    React.createElement('ExpoPicker', props, props.children as React.ReactNode),
  { Item: MockPickerItem }
);

const MockSwitch = (props: Record<string, unknown>) =>
  React.createElement('ExpoSwitch', props, null);

const MockHost = (props: Record<string, unknown>) =>
  React.createElement('ExpoHost', props, props.children as React.ReactNode);

mock.module('@expo/ui', () => ({
  Host: MockHost,
  Picker: MockPicker,
  Switch: MockSwitch,
}));

let mockHapticsEnabled = true;
mock.module('@/stores/settings.store', () => ({
  useSettingsStore: {
    getState: () => ({ hapticsEnabled: mockHapticsEnabled }),
  },
}));

const mockSelectionAsync = mock(() => Promise.resolve());
mock.module('@/lib/haptics', () => ({
  selectionAsync: mockSelectionAsync,
}));

mock.module('@/theme/useResolvedTheme', () => ({
  useIsDark: () => true,
  useResolvedTheme: () => 'dark',
}));

mock.module('@/theme/useSemanticColors', () => ({
  useSemanticColors: () => ({
    accent: '#3b82f6',
    onAccent: '#ffffff',
    elevatedSurface: '#18181b',
    textSecondary: '#a1a1aa',
  }),
}));

const { ToggleSwitch } = await import('./ToggleSwitch');
const ReactTestRenderer = (await import('react-test-renderer')).default;
const { act } = await import('react-test-renderer');

describe('ToggleSwitch Universal native-backed adapter', () => {
  test('renders native Universal Switch inside Host with controlled value and accessibility props', () => {
    const onValueChange = mock(() => {});

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ToggleSwitch
          value={true}
          onValueChange={onValueChange}
          accessibilityLabel="Enable notifications"
          accessibilityHint="Toggles notification delivery"
          testID="notif-switch"
        />
      );
    });

    const root = renderer!.root;
    const host = root.findByType('ExpoHost');
    expect(host).toBeDefined();
    expect(host.props.matchContents).toBe(true);
    expect(host.props.colorScheme).toBe('dark');
    expect(host.props.seedColor).toBe('#3b82f6');
    expect(host.props.accessibilityLabel).toBe('Enable notifications');
    expect(host.props.accessibilityHint).toBe('Toggles notification delivery');

    const switchComp = root.findByType('ExpoSwitch');
    expect(switchComp).toBeDefined();
    expect(switchComp.props.value).toBe(true);
    expect(switchComp.props.disabled).toBe(false);
    expect(switchComp.props.testID).toBe('notif-switch');
  });

  test('falls back to accessibilityLabel for testID when testID is omitted', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ToggleSwitch
          value={false}
          onValueChange={() => {}}
          accessibilityLabel="Haptic Feedback"
        />
      );
    });

    const switchComp = renderer!.root.findByType('ExpoSwitch');
    expect(switchComp.props.testID).toBe('Haptic Feedback');
  });

  test('forwards toggled boolean to onValueChange and triggers haptics when enabled', () => {
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
        />
      );
    });

    const switchComp = renderer!.root.findByType('ExpoSwitch');
    act(() => {
      switchComp.props.onValueChange(true);
    });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(true);
    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);
  });

  test('does not fire haptics when hapticsEnabled is false', () => {
    mockHapticsEnabled = false;
    mockSelectionAsync.mockClear();
    const onValueChange = mock(() => {});

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ToggleSwitch
          value={true}
          onValueChange={onValueChange}
          accessibilityLabel="Silent Toggle"
        />
      );
    });

    const switchComp = renderer!.root.findByType('ExpoSwitch');
    act(() => {
      switchComp.props.onValueChange(false);
    });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(false);
    expect(mockSelectionAsync).toHaveBeenCalledTimes(0);
  });

  test('does not fire haptics when value is unchanged', () => {
    mockHapticsEnabled = true;
    mockSelectionAsync.mockClear();
    const onValueChange = mock(() => {});

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ToggleSwitch
          value={true}
          onValueChange={onValueChange}
          accessibilityLabel="Unchanged Toggle"
        />
      );
    });

    const switchComp = renderer!.root.findByType('ExpoSwitch');
    act(() => {
      switchComp.props.onValueChange(true);
    });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(true);
    expect(mockSelectionAsync).toHaveBeenCalledTimes(0);
  });

  test('disabled switch prevents onValueChange and haptics', () => {
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
        />
      );
    });

    const switchComp = renderer!.root.findByType('ExpoSwitch');
    expect(switchComp.props.disabled).toBe(true);

    act(() => {
      switchComp.props.onValueChange(true);
    });

    expect(onValueChange).toHaveBeenCalledTimes(0);
    expect(mockSelectionAsync).toHaveBeenCalledTimes(0);
  });
});
