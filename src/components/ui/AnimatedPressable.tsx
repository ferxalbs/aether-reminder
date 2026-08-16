/* eslint-disable react-hooks/immutability */
import React from "react";
import {
  GestureResponderEvent,
  Insets,
  Platform,
  Pressable,
  PressableProps,
  PressableStateCallbackType,
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

export interface AnimatedPressableProps extends Omit<
  PressableProps,
  "children" | "style"
> {
  scaleTo?: number;
  hapticStyle?: Haptics.ImpactFeedbackStyle | null;
  minimumTouchTarget?: boolean;
  /**
   * Radius of the AETHER visual surface that owns press/ripple feedback.
   *
   * This is deliberately separate from the minimum touch target. The
   * Pressable remains the hit target, while this opt-in clip keeps feedback
   * inside a rounded visual surface. Callers without a shaped surface retain
   * their existing behavior.
   */
  interactionRadius?: number;
  style?: PressableProps["style"];
  children: React.ReactNode;
}

/** Style applied only when a caller explicitly declares a feedback shape. */
export function getFeedbackClipStyle(interactionRadius?: number): ViewStyle {
  if (interactionRadius === undefined || !Number.isFinite(interactionRadius)) {
    return {};
  }

  return {
    borderRadius: interactionRadius,
    overflow: "hidden",
  };
}

/**
 * Expand a visual control's hit rect without expanding its visual surface.
 * Use this for compact controls whose visual bounds are intentionally below
 * the platform minimum (for example, a 20dp checkbox or 36dp send action).
 */
export function getMinimumTouchTargetHitSlop(
  visualWidth: number,
  visualHeight: number,
  platform: string,
): Insets {
  const minimum = getMinimumTouchTarget(platform);
  const horizontal = Math.max(0, (minimum - visualWidth) / 2);
  const vertical = Math.max(0, (minimum - visualHeight) / 2);

  return {
    top: vertical,
    bottom: vertical,
    left: horizontal,
    right: horizontal,
  };
}

export function getBoundedRippleConfig(
  ripple: PressableProps["android_ripple"],
  interactionRadius?: number,
): PressableProps["android_ripple"] {
  if (!ripple || interactionRadius === undefined) return ripple;
  return { ...ripple, borderless: false };
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
  interactionRadius,
  android_ripple,
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

  const minimumTouchTargetStyle = minimumTouchTarget
    ? {
        minWidth: getMinimumTouchTarget(Platform.OS),
        minHeight: getMinimumTouchTarget(Platform.OS),
      }
    : undefined;
  const feedbackClipStyle = getFeedbackClipStyle(interactionRadius);
  const composedStyle =
    typeof style === "function"
      ? (state: PressableStateCallbackType) => [
          animatedStyle,
          minimumTouchTargetStyle,
          style(state),
          feedbackClipStyle,
        ]
      : [animatedStyle, minimumTouchTargetStyle, style, feedbackClipStyle];

  return (
    <AnimatedPressableBase
      {...rest}
      android_ripple={getBoundedRippleConfig(android_ripple, interactionRadius)}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={composedStyle}
    >
      {children}
    </AnimatedPressableBase>
  );
};
