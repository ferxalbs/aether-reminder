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
    const activeColor = isDark ? Colors.systemGreenDark : Colors.systemGreenLight;
    const inactiveColor = isDark ? Colors.systemGray4Dark : Colors.systemGray4Light;
    const backgroundColor = interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]);
    return { backgroundColor };
  });

  const animatedThumbStyle = useAnimatedStyle(() => {
    // Both platform variants use a light thumb; the track and motion differ.
    const thumbColor = Colors.white;

    // Track width 51, thumb width 27, padding 2 -> max translateX = 51 - 27 - 4 = 20px
    const translateX = progress.value * 20;

    return {
      backgroundColor: thumbColor,
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
      android_ripple={{ color: isDark ? Colors.rippleDark : Colors.rippleLight }}
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
  },
  androidTrack: {
    width: 52,
    height: 32,
    borderRadius: 16,
  },
  thumb: {
    width: 27,
    height: 27,
    borderRadius: 13.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  disabled: {
    opacity: 0.45,
  },
});
