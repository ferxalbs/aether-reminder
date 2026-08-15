import React, { useEffect } from 'react';
import { Platform, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { AnimatedPressable } from './AnimatedPressable';
import { Colors, getMinimumTouchTarget, Motion } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { useSemanticColors } from '@/theme/useSemanticColors';
import { selectionAsync } from '@/lib/haptics';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { useSettingsStore } from '@/stores/settings.store';

export interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  value,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  style,
}) => {
  const isDark = useIsDark();
  const colors = useSemanticColors();
  const progress = useSharedValue(value ? 1 : 0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const target = value ? 1 : 0;
    progress.value = reduceMotion
      ? target
      : withSpring(target, {
          ...Motion.toggleSpring,
          reduceMotion: ReduceMotion.Never,
        });
  }, [reduceMotion, value, progress]);

  const handlePress = () => {
    if (disabled) return;
    if (useSettingsStore.getState().hapticsEnabled) {
      selectionAsync().catch((error: unknown) => {
        reportNonFatalError('haptics', error);
      });
    }
    onValueChange(!value);
  };

  const animatedTrackStyle = useAnimatedStyle(() => {
    const activeColor = colors.accent;
    const inactiveColor = isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight;
    const backgroundColor = interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]);
    const borderColor = isDark ? Colors.borderDark : Colors.borderLight;
    return { backgroundColor, borderColor };
  });

  const animatedThumbStyle = useAnimatedStyle(() => {
    const activeThumbColor = colors.onAccent;
    const inactiveThumbColor = isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight;
    const backgroundColor = interpolateColor(progress.value, [0, 1], [inactiveThumbColor, activeThumbColor]);
    const translateX = progress.value * 20;

    return {
      backgroundColor,
      transform: [{ translateX }],
    };
  });

  return (
    <AnimatedPressable
      hapticStyle={null}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled }}
      android_ripple={{ color: colors.accent }}
      scaleTo={Motion.pressScale}
      style={[
        styles.touchTarget,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.track,
          Platform.OS === 'android' && styles.androidTrack,
          animatedTrackStyle,
        ]}
      >
        <Animated.View style={[styles.thumb, animatedThumbStyle]} />
      </Animated.View>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  touchTarget: {
    minWidth: getMinimumTouchTarget(Platform.OS),
    minHeight: getMinimumTouchTarget(Platform.OS),
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    width: 51,
    height: 31,
    borderRadius: 15.5,
    padding: 2,
    justifyContent: 'center',
    borderWidth: 1,
  },
  androidTrack: {
    width: 52,
    height: 32,
    borderRadius: 16,
  },
  thumb: {
    width: 25,
    height: 25,
    borderRadius: 12.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
});
