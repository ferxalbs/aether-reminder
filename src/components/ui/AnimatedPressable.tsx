/* eslint-disable react-hooks/immutability */
import React from "react";
import {
  GestureResponderEvent,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSettingsStore } from "@/stores/settings.store";
import { impactAsync } from "@/lib/haptics";
import { reportNonFatalError } from "@/lib/nonFatalError";
import { getMinimumTouchTarget } from "@/theme/tokens";
import { useMotionPreset } from "@/motion";

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

export interface AnimatedPressableProps extends PressableProps {
  scaleTo?: number;
  hapticStyle?: Haptics.ImpactFeedbackStyle | null;
  minimumTouchTarget?: boolean;
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
  minimumTouchTarget = true,
  ...rest
}) => {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const pressPreset = useMotionPreset("surface.press");
  const releasePreset = useMotionPreset("surface.release");

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    if (disabled) return;
    // Reduced Motion keeps the control visually stable; the regular path uses
    // the shared critically damped spring for instant platform feedback.
    scale.value =
      reduceMotion || pressPreset.mode === "none"
        ? 1
        : withSpring(scaleTo, {
            damping: pressPreset.damping,
            stiffness: pressPreset.stiffness,
            mass: pressPreset.mass,
            reduceMotion: ReduceMotion.Never,
          });
    const hapticsEnabled = useSettingsStore.getState().hapticsEnabled;
    if (hapticsEnabled && hapticStyle) {
      impactAsync(hapticStyle).catch((error: unknown) => {
        reportNonFatalError("haptics", error);
      });
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (disabled) return;
    scale.value =
      reduceMotion || releasePreset.mode === "none"
        ? 1
        : withSpring(1, {
            damping: releasePreset.damping,
            stiffness: releasePreset.stiffness,
            mass: releasePreset.mass,
            reduceMotion: ReduceMotion.Never,
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
      style={[
        animatedStyle,
        minimumTouchTarget && {
          minWidth: getMinimumTouchTarget(Platform.OS),
          minHeight: getMinimumTouchTarget(Platform.OS),
        },
        style,
      ]}
    >
      {children}
    </AnimatedPressableBase>
  );
};
