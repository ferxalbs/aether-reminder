import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import ExpoDateTimePicker from '@expo/ui/community/datetime-picker';
import { CalendarDays, Clock3 } from 'lucide-react-native';
import { Colors, ControlTokens, getMinimumTouchTarget, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from './Typography';
import { AnimatedPressable } from './AnimatedPressable';

export type NativeDateTimeMode = 'date' | 'time';

export interface NativeDateTimeControlProps {
  label: string;
  mode: NativeDateTimeMode;
  value: Date;
  onChange: (value: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  accessibilityLabel?: string;
  testID?: string;
}

function formatValue(value: Date, mode: NativeDateTimeMode): string {
  try {
    return mode === 'date'
      ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value)
      : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(value);
  } catch {
    return mode === 'date'
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
      : `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
}

/**
 * Expo UI's community DateTimePicker is backed by SwiftUI on iOS and Material 3
 * Compose on Android. Android dialogs mount only while open; iOS uses the compact
 * native control inline.
 */
export function NativeDateTimeControl({
  label,
  mode,
  value,
  onChange,
  minimumDate,
  maximumDate,
  accessibilityLabel,
  testID,
}: NativeDateTimeControlProps): React.ReactElement {
  const isDark = useIsDark();
  const [dialogOpen, setDialogOpen] = useState(false);
  const formatted = useMemo(() => formatValue(value, mode), [mode, value]);
  const accentColor = isDark ? Colors.brandCyan : Colors.brandBlue;
  const secondary = isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight;
  const Icon = mode === 'date' ? CalendarDays : Clock3;

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.container} testID={testID}>
        <Typography variant="caption" color={isDark ? Colors.zinc300 : Colors.zinc700} accessible={false}>
          {label}
        </Typography>
        <View
          style={[
            styles.iosControl,
            {
              borderColor: isDark ? Colors.glassBorderDark : Colors.glassBorderLight,
              backgroundColor: isDark ? Colors.surfaceRaisedDark : '#EEF2F8',
            },
          ]}
        >
          <Icon size={16} color={secondary} />
          <ExpoDateTimePicker
            value={value}
            mode={mode}
            display="compact"
            accentColor={accentColor}
            themeVariant={isDark ? 'dark' : 'light'}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onValueChange={(_event, selectedDate) => onChange(selectedDate)}
            style={styles.iosPicker}
            testID={testID ? `${testID}-native` : undefined}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID={testID}>
      <Typography variant="caption" color={isDark ? Colors.zinc300 : Colors.zinc700} accessible={false}>
        {label}
      </Typography>
      <AnimatedPressable
        onPress={() => setDialogOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `Pick ${label.toLowerCase()}`}
        accessibilityValue={{ text: formatted }}
        style={[
          styles.androidTrigger,
          {
            minHeight: getMinimumTouchTarget(Platform.OS),
            borderColor: isDark ? Colors.glassBorderDark : Colors.glassBorderLight,
            backgroundColor: isDark ? Colors.surfaceRaisedDark : '#EEF2F8',
          },
        ]}
      >
        <Icon size={18} color={secondary} />
        <Typography variant="body" style={styles.triggerLabel}>
          {formatted}
        </Typography>
      </AnimatedPressable>
      {dialogOpen ? (
        <ExpoDateTimePicker
          value={value}
          mode={mode}
          presentation="dialog"
          display={mode === 'date' ? 'calendar' : 'clock'}
          is24Hour
          accentColor={accentColor}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          positiveButton={{ label: 'Done' }}
          onValueChange={(_event, selectedDate) => {
            setDialogOpen(false);
            onChange(selectedDate);
          }}
          onDismiss={() => setDialogOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 150,
    gap: ControlTokens.fieldLabelGap,
  },
  iosControl: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.xs,
    borderWidth: ControlTokens.borderWidth,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  iosPicker: {
    flexGrow: 0,
  },
  androidTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: ControlTokens.fieldPaddingHorizontal,
    borderWidth: ControlTokens.borderWidth,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  triggerLabel: {
    flex: 1,
  },
});
