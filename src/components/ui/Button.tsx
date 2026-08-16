import React from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
} from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { GlassSurface } from "./GlassSurface";
import { Typography } from "./Typography";
import {
  ControlTokens,
  getMinimumTouchTarget,
  Motion,
  Spacing,
} from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "glass" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  pill?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  pill = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const theme = useAetherTheme();
  const { colors } = theme;
  const buttonTokens = theme.components.button;
  const isDisabled = disabled || loading;

  const getContainerStyle = () => {
    switch (variant) {
      case "primary":
        return {
          backgroundColor: buttonTokens.primaryBackground,
          borderColor: buttonTokens.primaryBackground,
        };
      case "secondary":
        return {
          backgroundColor: buttonTokens.secondaryBackground,
          borderColor: buttonTokens.secondaryBorder,
        };
      case "glass":
        return {
          backgroundColor: "transparent",
          borderColor: buttonTokens.secondaryBorder,
        };
      case "destructive":
        return {
          backgroundColor: buttonTokens.destructiveBackground,
          borderColor: buttonTokens.destructiveBorder,
        };
      case "ghost":
      default:
        return {
          backgroundColor: "transparent",
          borderColor: "transparent",
        };
    }
  };

  const getTextColor = () => {
    if (isDisabled) return colors.textDisabled;
    if (variant === "primary") return buttonTokens.primaryForeground;
    if (variant === "secondary") return buttonTokens.secondaryForeground;
    if (variant === "destructive") return buttonTokens.destructiveForeground;
    if (variant === "ghost") return buttonTokens.ghostForeground;
    return buttonTokens.secondaryForeground;
  };

  const getSizeStyle = () => {
    const baseRadius = pill ? theme.shape.pill : theme.shape.control;
    switch (size) {
      case "sm":
        return {
          minHeight: getMinimumTouchTarget(Platform.OS),
          paddingVertical: Spacing.xs,
          paddingHorizontal: Spacing.md,
          borderRadius: baseRadius,
        };
      case "lg":
        return {
          minHeight: getMinimumTouchTarget(Platform.OS),
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.xl,
          borderRadius: baseRadius,
        };
      case "md":
      default:
        return {
          minHeight: getMinimumTouchTarget(Platform.OS),
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          borderRadius: baseRadius,
        };
    }
  };

  const sizeStyle = getSizeStyle();

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      android_ripple={{
        color: colors.accent,
        foreground: true,
      }}
      interactionRadius={sizeStyle.borderRadius}
      scaleTo={Motion.buttonPressScale}
      style={[
        styles.base,
        sizeStyle,
        getContainerStyle(),
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {variant === "glass" ? (
        <GlassSurface
          pointerEvents="none"
          borderRadius={sizeStyle.borderRadius}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {icon && <View style={styles.iconMargin}>{icon}</View>}
          <Typography
            variant={size === "sm" ? "caption" : "bodyBold"}
            color={getTextColor()}
            style={{ fontWeight: "600" }}
          >
            {label}
          </Typography>
        </View>
      )}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  fullWidth: {
    width: "100%",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  iconMargin: {
    marginRight: Spacing.sm,
  },
  disabled: {
    opacity: ControlTokens.disabledOpacity,
  },
});
