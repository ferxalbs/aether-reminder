import React, { useEffect } from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { AnimatedPressable } from './AnimatedPressable';
import { Colors, Radius } from '@/theme/tokens';
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
    const inactiveColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
    const backgroundColor = interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]);
    return { backgroundColor };
  });

  const animatedThumbStyle = useAnimatedStyle(() => {
    const activeThumbColor = isDark ? Colors.black : Colors.white;
    const inactiveThumbColor = isDark ? Colors.zinc400 : Colors.zinc600;
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      [inactiveThumbColor, activeThumbColor]
    );

    // Track width 52, thumb width 24 -> max translateX = 52 - 24 - 8 = 20px
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
      scaleTo={0.96}
      style={[disabled && styles.disabled, style]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <Animated.View
        style={[
          styles.track,
          {
            borderColor: isDark ? Colors.glassBorderDark : Colors.glassBorderLight,
          },
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
    width: 52,
    height: 32,
    borderRadius: Radius.pill,
    padding: 3,
    justifyContent: 'center',
    borderWidth: 1,
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  disabled: {
    opacity: 0.45,
  },
});
