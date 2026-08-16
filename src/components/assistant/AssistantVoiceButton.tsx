import React, { useEffect } from "react";
import { AlertCircle, Mic, Square } from "lucide-react-native";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  AnimatedPressable,
  getMinimumTouchTargetHitSlop,
} from "@/components/ui/AnimatedPressable";
import { Colors, Radius } from "@/theme/tokens";
import { useMotionProfile, useMotionPreset } from "@/motion";
import { useIsDark } from "@/theme/useResolvedTheme";
import type { VoiceState } from "./VoiceController";
import { isVoiceFailureState } from "./VoiceController";

interface AssistantVoiceButtonProps {
  voiceState: VoiceState;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * A direct voice affordance for the assistant composer.
 *
 * This control keeps the primary action explicit, labeled by its
 * accessibility state, and only animates while the user presses it.
 */
export const AssistantVoiceButton: React.FC<AssistantVoiceButtonProps> = ({
  voiceState,
  disabled = false,
  onPress,
}) => {
  const isDark = useIsDark();
  const isError = isVoiceFailureState(voiceState);
  const isActive = [
    "checking_permission",
    "connecting",
    "listening",
    "committing",
    "finalizing",
    "parsing",
  ].includes(voiceState);
  const Icon = isError ? AlertCircle : isActive ? Square : Mic;
  const iconColor = isError
    ? isDark
      ? Colors.destructiveTextDark
      : Colors.destructiveTextLight
    : isDark
      ? Colors.white
      : Colors.black;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={
        isError
          ? "Retry voice input"
          : isActive
            ? "Voice input in progress"
            : "Start voice input"
      }
      accessibilityHint={
        isActive
          ? "Use the voice controls to cancel or send"
          : "Speak naturally to create a reminder"
      }
      accessibilityState={{ disabled, busy: isActive }}
      android_ripple={{
        color: isDark ? Colors.rippleDark : Colors.rippleLight,
        foreground: true,
      }}
      hitSlop={getMinimumTouchTargetHitSlop(42, 42, Platform.OS)}
      interactionRadius={Radius.pill}
      minimumTouchTarget={false}
      style={[
        styles.button,
        {
          backgroundColor: isError
            ? isDark
              ? Colors.destructiveBackgroundDark
              : Colors.destructiveBackgroundLight
            : isDark
              ? Colors.rippleDark
              : Colors.rippleLight,
          borderColor: isError
            ? isDark
              ? Colors.destructiveBorderDark
              : Colors.destructiveBorderLight
            : isDark
              ? Colors.borderDark
              : Colors.borderLight,
        },
        disabled && styles.disabled,
      ]}
    >
      {isActive ? (
        <View style={styles.waveform} accessibilityElementsHidden>
          <VoiceBar active delay={0} color={iconColor} />
          <VoiceBar active delay={100} color={iconColor} />
          <VoiceBar active delay={200} color={iconColor} />
        </View>
      ) : (
        <Icon size={18} color={iconColor} strokeWidth={2.2} />
      )}
    </AnimatedPressable>
  );
};

function VoiceBar({
  active,
  delay,
  color,
}: {
  active: boolean;
  delay: number;
  color: string;
}) {
  const reduceMotion = useReducedMotion();
  const profile = useMotionProfile();
  const listenPreset = useMotionPreset("orb.listen");
  const scale = useSharedValue(0.55);

  useEffect(() => {
    if (
      !active ||
      reduceMotion ||
      !listenPreset.continuous ||
      !profile.budget.allowContinuousDecorativeMotion
    ) {
      scale.value = listenPreset.scale > 1 ? 0.85 : 0.7;
      return;
    }
    scale.value = withRepeat(
      withTiming(1, { duration: 320 + delay }),
      -1,
      true,
    );
  }, [
    active,
    delay,
    listenPreset.continuous,
    listenPreset.scale,
    profile.budget.allowContinuousDecorativeMotion,
    reduceMotion,
    scale,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
  }));

  return (
    <Animated.View
      style={[styles.waveBar, { backgroundColor: color }, animatedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderCurve: "continuous",
    marginBottom: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  waveform: {
    width: 18,
    height: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  waveBar: {
    width: 3,
    height: 16,
    borderRadius: Radius.pill,
  },
});
