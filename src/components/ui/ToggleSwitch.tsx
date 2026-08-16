import React, { useCallback } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Host, Switch as UniversalSwitch } from '@expo/ui';
import { useSettingsStore } from '@/stores/settings.store';
import { selectionAsync } from '@/lib/haptics';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { useIsDark } from '@/theme/useResolvedTheme';
import { useSemanticColors } from '@/theme/useSemanticColors';

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
  const isDark = useIsDark();
  const colors = useSemanticColors();

  const handleValueChange = useCallback(
    (nextValue: boolean) => {
      if (disabled) return;
      if (nextValue !== value && useSettingsStore.getState().hapticsEnabled) {
        selectionAsync().catch((error: unknown) => {
          reportNonFatalError('haptics', error);
        });
      }
      onValueChange(nextValue);
    },
    [disabled, value, onValueChange]
  );

  return (
    <Host
      matchContents
      colorScheme={isDark ? 'dark' : 'light'}
      seedColor={colors.accent}
      style={style}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <UniversalSwitch
        value={value}
        onValueChange={handleValueChange}
        disabled={disabled}
        testID={testID ?? accessibilityLabel}
      />
    </Host>
  );
};
