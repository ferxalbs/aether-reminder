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
  Colors,
  ControlTokens,
  getMinimumTouchTarget,
  Motion,
  Radius,
  Spacing,
} from "@/theme/tokens";
import { useIsDark } from "@/theme/useResolvedTheme";
import { useSemanticColors } from "@/theme/useSemanticColors";

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
  const isDark = useIsDark();
  const colors = useSemanticColors();
  const isDisabled = disabled || loading;

  const getContainerStyle = () => {
    switch (variant) {
      case "primary":
        return {
          backgroundColor: colors.accent,
          borderColor: colors.accent,
        };
      case "secondary":
        return {
          backgroundColor: colors.elevatedSurface,
          borderColor: colors.border,
        };
      case "glass":
        return {
          backgroundColor: "transparent",
          borderColor: colors.border,
        };
      case "destructive":
        return {
          backgroundColor: isDark
            ? Colors.destructiveBackgroundDark
            : Colors.destructiveBackgroundLight,
          borderColor: isDark
            ? Colors.destructiveBorderDark
            : Colors.destructiveBorderLight,
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
    if (isDisabled)
      return isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight;
    if (variant === "primary") return colors.onAccent;
    if (variant === "secondary") return colors.textPrimary;
    if (variant === "destructive") return isDark ? Colors.white : Colors.black;
    if (variant === "ghost")
      return isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight;
    return isDark ? Colors.white : Colors.black;
  };

  const getSizeStyle = () => {
    const baseRadius = pill
      ? Radius.pill
      : size === "sm"
        ? Radius.md
        : size === "lg"
          ? Radius.xl
          : Radius.lg;
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
      }}
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
    overflow: "hidden",
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
