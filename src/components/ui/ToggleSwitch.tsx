import React, { useEffect } from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { AnimatedPressable } from './AnimatedPressable';
import { Colors } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { selectionAsync } from '@/lib/haptics';
import { useSettingsStore } from '@/stores/settings.store';

export interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  value,
  onValueChange,
  disabled = false,
  style,
}) => {
  const isDark = useIsDark();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, {
      damping: 20,
      stiffness: 200,
      mass: 1,
      overshootClamping: true,
    });
  }, [value, progress]);

  const handlePress = () => {
    if (disabled) return;
    if (useSettingsStore.getState().hapticsEnabled) {
      selectionAsync().catch(() => {});
    }
    onValueChange(!value);
  };

  const animatedTrackStyle = useAnimatedStyle(() => {
    const activeColor = isDark ? Colors.systemGreenDark : Colors.systemGreenLight;
    const inactiveColor = isDark ? '#39393D' : '#E9E9EA';
    const backgroundColor = interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]);
    return { backgroundColor };
  });

  const animatedThumbStyle = useAnimatedStyle(() => {
    // iOS toggle thumb is almost always white (or very light) with a shadow
    const thumbColor = '#FFFFFF';

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
      scaleTo={0.96}
      style={[disabled && styles.disabled, style]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <Animated.View
        style={[
          styles.track,
          animatedTrackStyle,
        ]}
      >
        <Animated.View style={[styles.thumb, animatedThumbStyle]} />
      </Animated.View>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  track: {
    width: 51,
    height: 31,
    borderRadius: 15.5,
    padding: 2,
    justifyContent: 'center',
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
