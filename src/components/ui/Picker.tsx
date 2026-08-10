import React, { useState } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { Colors, ControlTokens, getMinimumTouchTarget, Radius } from '@/theme/tokens';
import { useSettingsStore } from '@/stores/settings.store';
import { selectionAsync } from '@/lib/haptics';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { useIsDark } from '@/theme/useResolvedTheme';
import { AnimatedPressable } from './AnimatedPressable';
import { GlassSurface } from './GlassSurface';
import { Typography } from './Typography';

export interface PickerOption<Value extends string | number = string> {
  value: Value;
  label: string;
  disabled?: boolean;
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
  accessibilityHint?: string;
  containerStyle?: StyleProp<ViewStyle>;
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
  accessibilityHint,
  containerStyle,
}: PickerProps<Value>): React.ReactElement {
  const isDark = useIsDark();
  const [open, setOpen] = useState(false);
  const isIOS = Platform.OS === 'ios';
  const isDisabled = disabled || options.length === 0;
  const isSegmented = isIOS && options.length > 0 && options.length <= 4;
  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? String(value);
  const controlBorderColor = error
    ? isDark
      ? Colors.destructiveTextDark
      : Colors.destructiveTextLight
    : isDark
      ? Colors.glassBorderDark
      : Colors.glassBorderLight;
  const controlBackgroundColor = isDark ? Colors.surfaceRaisedDark : '#EEF2F8';
  const selectedBackgroundColor = isDark ? Colors.white : Colors.black;
  const selectedTextColor = isDark ? Colors.brandInk : Colors.white;

  const selectValue = (nextValue: Value) => {
    if (isDisabled) return;
    const nextOption = options.find((option) => option.value === nextValue);
    if (!nextOption || nextOption.disabled) return;

    if (nextValue !== value && useSettingsStore.getState().hapticsEnabled) {
      selectionAsync().catch((error: unknown) => {
        reportNonFatalError('haptics', error);
      });
    }
    onValueChange(nextValue);
    setOpen(false);
  };

  const optionAccessibilityLabel = (option: PickerOption<Value>) =>
    `${label}: ${option.label}`;

  const renderOption = (option: PickerOption<Value>, segmented: boolean) => {
    const isSelected = option.value === value;
    const optionDisabled = isDisabled || option.disabled === true;

    return (
      <AnimatedPressable
        key={String(option.value)}
        onPress={() => selectValue(option.value)}
        disabled={optionDisabled}
        accessibilityRole="radio"
        accessibilityLabel={optionAccessibilityLabel(option)}
        accessibilityState={{ checked: isSelected, selected: isSelected, disabled: optionDisabled }}
        accessibilityHint={optionDisabled ? undefined : `Selects ${option.label}`}
        style={[
          segmented ? styles.segment : styles.menuOption,
          {
            minHeight: getMinimumTouchTarget(Platform.OS),
            backgroundColor: isSelected
              ? selectedBackgroundColor
              : 'transparent',
            borderRadius: segmented ? Radius.pill : Radius.md,
          },
          optionDisabled && styles.disabled,
        ]}
      >
        <Typography
          variant="caption"
          color={isSelected ? selectedTextColor : isDark ? Colors.zinc300 : Colors.zinc700}
          style={styles.optionLabel}
        >
          {option.label}
        </Typography>
      </AnimatedPressable>
    );
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <Typography variant="caption" color={isDark ? Colors.zinc300 : Colors.zinc700} accessible={false}>
        {label}
      </Typography>
      {isSegmented ? (
        <View
          style={[
            styles.segmentedContainer,
            {
              borderColor: controlBorderColor,
              borderRadius: Radius.pill,
              backgroundColor: controlBackgroundColor,
            },
            isDisabled && styles.disabled,
          ]}
        >
          <GlassSurface
            pointerEvents="none"
            borderRadius={Radius.pill}
            borderWidth={0}
            style={StyleSheet.absoluteFill}
          />
          {options.map((option) => renderOption(option, true))}
        </View>
      ) : (
        <>
          <AnimatedPressable
            onPress={() => setOpen((current) => !current)}
            disabled={isDisabled}
            accessibilityRole="combobox"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityHint={accessibilityHint ?? 'Opens options'}
            accessibilityState={{ disabled: isDisabled, expanded: open }}
            accessibilityValue={{ text: selectedLabel }}
            style={[
              styles.trigger,
              {
                minHeight: getMinimumTouchTarget(Platform.OS),
                borderColor: controlBorderColor,
                borderRadius: Radius.lg,
                backgroundColor: controlBackgroundColor,
              },
              Platform.OS === 'android' && styles.androidSurface,
              isDisabled && styles.disabled,
            ]}
          >
            <Typography variant="body" color={isDark ? Colors.white : Colors.zinc950} style={styles.triggerLabel}>
              {selectedLabel}
            </Typography>
            <ChevronDown
              size={ControlTokens.pickerChevronSize}
              color={isDark ? Colors.zinc300 : Colors.zinc600}
            />
          </AnimatedPressable>
          {open ? (
            <View
              style={[
                styles.menu,
                {
                  borderColor: controlBorderColor,
                  backgroundColor: controlBackgroundColor,
                },
                Platform.OS === 'android' && styles.androidSurface,
              ]}
            >
              {options.map((option) => renderOption(option, false))}
            </View>
          ) : null}
        </>
      )}
      {error ? (
        <Typography
          variant="caption"
          color={isDark ? Colors.destructiveTextDark : Colors.destructiveTextLight}
          style={styles.message}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Typography>
      ) : helperText ? (
        <Typography variant="caption" color={Colors.zinc500} style={styles.message}>
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
  segmentedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: ControlTokens.fieldLabelGap,
    borderWidth: ControlTokens.borderWidth,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ControlTokens.pickerOptionPaddingHorizontal,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ControlTokens.fieldPaddingHorizontal,
    borderWidth: ControlTokens.borderWidth,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  androidSurface: {
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
  },
  triggerLabel: {
    flex: 1,
  },
  menu: {
    borderWidth: ControlTokens.borderWidth,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  menuOption: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: ControlTokens.pickerOptionPaddingHorizontal,
    paddingVertical: ControlTokens.pickerOptionPaddingVertical,
  },
  optionLabel: {
    flex: 1,
  },
  message: {
    marginTop: ControlTokens.fieldMessageGap,
  },
  disabled: {
    opacity: ControlTokens.disabledOpacity,
  },
});
