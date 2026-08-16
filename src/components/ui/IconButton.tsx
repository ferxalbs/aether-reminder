import React from "react";
import { Platform, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { GlassSurface } from "./GlassSurface";
import { getMinimumTouchTarget, Motion } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";
import * as Haptics from "expo-haptics";

export interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  variant?: "solid" | "glass" | "ghost";
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hapticStyle?: Haptics.ImpactFeedbackStyle | null;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  variant = "glass",
  size = 44,
  disabled = false,
  style,
  hapticStyle = Haptics.ImpactFeedbackStyle.Light,
}) => {
  const theme = useAetherTheme();
  const { colors } = theme;
  const buttonTokens = theme.components.button;
  const touchTarget = Math.max(size, getMinimumTouchTarget(Platform.OS));

  const getContainerStyle = () => {
    switch (variant) {
      case "solid":
        return {
          backgroundColor: buttonTokens.secondaryBackground,
          borderColor: buttonTokens.secondaryBorder,
          borderWidth: 1,
        };
      case "glass":
        return {
          backgroundColor: "transparent",
          borderColor: buttonTokens.secondaryBorder,
          borderWidth: 1,
        };
      case "ghost":
      default:
        return {
          backgroundColor: "transparent",
          borderColor: "transparent",
          borderWidth: 0,
        };
    }
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      android_ripple={{
        color: colors.ripple,
        foreground: true,
      }}
      interactionRadius={theme.shape.compact}
      hapticStyle={hapticStyle}
      scaleTo={Motion.iconPressScale}
      style={[
        styles.base,
        {
          width: touchTarget,
          height: touchTarget,
          borderRadius: theme.shape.compact,
        },
        getContainerStyle(),
        disabled && styles.disabled,
        style,
      ]}
    >
      {variant === "glass" ? (
        <GlassSurface
          pointerEvents="none"
          borderRadius={theme.shape.compact}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {icon}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.4,
  },
});
