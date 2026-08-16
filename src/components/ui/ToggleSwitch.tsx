import React, { useCallback, useMemo } from "react";
import { Platform, StyleProp, ViewStyle } from "react-native";
import { Host, Switch as UniversalSwitch } from "@expo/ui";
import {
  Switch as ComposeSwitch,
  type SwitchColors,
} from "@expo/ui/jetpack-compose";
import { testID as composeTestID } from "@expo/ui/jetpack-compose/modifiers";
import { Toggle as SwiftUIToggle } from "@expo/ui/swift-ui";
import {
  disabled as swiftUIDisabled,
  labelsHidden,
  tint,
  type ModifierConfig as SwiftUIModifierConfig,
} from "@expo/ui/swift-ui/modifiers";
import { useSemanticColors } from "@/theme/useSemanticColors";
import { useResolvedTheme } from "@/theme/useResolvedTheme";
import { useSettingsStore } from "@/stores/settings.store";
import { selectionAsync } from "@/lib/haptics";
import { reportNonFatalError } from "@/lib/nonFatalError";

export interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  value,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  style,
  testID,
}) => {
  const colors = useSemanticColors();
  const mode = useResolvedTheme();

  const handleValueChange = useCallback(
    (nextValue: boolean) => {
      if (disabled) return;
      if (nextValue !== value && useSettingsStore.getState().hapticsEnabled) {
        selectionAsync().catch((error: unknown) => {
          reportNonFatalError("haptics", error);
        });
      }
      onValueChange(nextValue);
    },
    [disabled, value, onValueChange],
  );

  const composeColors: SwitchColors = useMemo(() => {
    return {
      checkedTrackColor: colors.accent,
      checkedThumbColor: colors.onAccent,
      checkedBorderColor: colors.accent,
      uncheckedTrackColor: colors.surfaceRaised,
      uncheckedThumbColor: colors.textSecondary,
      uncheckedBorderColor: colors.borderDefault,
      disabledCheckedTrackColor: colors.surfacePressed,
      disabledCheckedThumbColor: colors.textDisabled,
      disabledCheckedBorderColor: colors.borderSubtle,
      disabledUncheckedTrackColor: colors.surfacePressed,
      disabledUncheckedThumbColor: colors.textDisabled,
      disabledUncheckedBorderColor: colors.borderSubtle,
    };
  }, [colors]);

  const swiftUIModifiers: SwiftUIModifierConfig[] = useMemo(() => {
    const mods: SwiftUIModifierConfig[] = [tint(colors.accent), labelsHidden()];
    if (disabled) {
      mods.push(swiftUIDisabled(true));
    }
    return mods;
  }, [colors.accent, disabled]);

  const identifier = testID ?? accessibilityLabel;

  return (
    <Host
      matchContents
      colorScheme={mode}
      style={style}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      {Platform.OS === "android" ? (
        <ComposeSwitch
          value={value}
          onCheckedChange={disabled ? undefined : handleValueChange}
          enabled={!disabled}
          colors={composeColors}
          modifiers={identifier ? [composeTestID(identifier)] : undefined}
        />
      ) : Platform.OS === "ios" ? (
        <SwiftUIToggle
          isOn={value}
          onIsOnChange={disabled ? undefined : handleValueChange}
          label={accessibilityLabel}
          modifiers={swiftUIModifiers}
          testID={identifier}
        />
      ) : (
        <UniversalSwitch
          value={value}
          onValueChange={handleValueChange}
          disabled={disabled}
          testID={identifier}
        />
      )}
    </Host>
  );
};
