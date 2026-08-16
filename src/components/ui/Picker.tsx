import React, { useCallback } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Host, Picker as UniversalPicker } from '@expo/ui';
import { Colors, ControlTokens, getMinimumTouchTarget } from '@/theme/tokens';
import { useSettingsStore } from '@/stores/settings.store';
import { selectionAsync } from '@/lib/haptics';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { useIsDark } from '@/theme/useResolvedTheme';
import { useSemanticColors } from '@/theme/useSemanticColors';
import { Typography } from './Typography';

export interface PickerOption<Value extends string | number = string> {
  value: Value;
  label: string;
}

export interface PickerProps<Value extends string | number = string> {
  label: string;
  options: readonly PickerOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Picker<Value extends string | number>({
  label,
  options,
  value,
  onValueChange,
  helperText,
  error,
  disabled = false,
  accessibilityLabel,
  containerStyle,
  testID,
}: PickerProps<Value>): React.ReactElement {
  const isDark = useIsDark();
  const colors = useSemanticColors();
  const isDisabled = disabled || options.length === 0;

  const handleValueChange = useCallback(
    (nextValue: string | number) => {
      if (isDisabled) return;
      const matched = options.find((opt) => opt.value === nextValue);
      if (!matched) return;

      const typedValue = matched.value;
      if (typedValue !== value && useSettingsStore.getState().hapticsEnabled) {
        selectionAsync().catch((err: unknown) => {
          reportNonFatalError('haptics', err);
        });
      }
      onValueChange(typedValue);
    },
    [isDisabled, options, value, onValueChange]
  );

  return (
    <View style={[styles.container, containerStyle]}>
      <Typography
        variant="caption"
        color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
        accessible={false}
      >
        {label}
      </Typography>

      <Host
        matchContents
        colorScheme={isDark ? 'dark' : 'light'}
        seedColor={colors.accent}
        style={styles.host}
      >
        <UniversalPicker
          selectedValue={value}
          onValueChange={handleValueChange}
          enabled={!isDisabled}
          appearance="menu"
          testID={testID ?? accessibilityLabel ?? label}
        >
          {options.map((option) => (
            <UniversalPicker.Item
              key={String(option.value)}
              label={option.label}
              value={option.value}
            />
          ))}
        </UniversalPicker>
      </Host>

      {error ? (
        <Typography
          variant="caption"
          color={isDark ? Colors.white : Colors.black}
          style={styles.message}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Typography>
      ) : helperText ? (
        <Typography
          variant="caption"
          color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight}
          style={styles.message}
        >
          {helperText}
        </Typography>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: ControlTokens.fieldLabelGap,
  },
  host: {
    minHeight: getMinimumTouchTarget(Platform.OS),
    justifyContent: 'center',
  },
  message: {
    marginTop: ControlTokens.fieldMessageGap,
  },
});
