/* eslint-disable react-hooks/immutability */
import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/settings.store';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

export interface AnimatedPressableProps extends PressableProps {
  scaleTo?: number;
  hapticStyle?: Haptics.ImpactFeedbackStyle;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export const AnimatedPressable: React.FC<AnimatedPressableProps> = ({
  scaleTo = 0.96,
  hapticStyle = Haptics.ImpactFeedbackStyle.Light,
  style,
  onPressIn,
  onPressOut,
  onPress,
  children,
  disabled,
  ...rest
}) => {
  const scale = useSharedValue(1);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: any) => {
    if (disabled) return;
    scale.value = withSpring(scaleTo, {
      damping: 18,
      stiffness: 300,
      mass: 0.5,
    });
    if (hapticsEnabled && hapticStyle) {
      Haptics.impactAsync(hapticStyle).catch(() => {});
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    if (disabled) return;
    scale.value = withSpring(1, {
      damping: 18,
      stiffness: 300,
      mass: 0.5,
    });
    onPressOut?.(e);
  };

  return (
    <AnimatedPressableBase
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={[animatedStyle, style]}
    >
      {children}
    </AnimatedPressableBase>
  );
};
