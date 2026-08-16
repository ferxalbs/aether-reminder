import React from "react";
import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { GlassSurface } from "./GlassSurface";
import { Hairline, Motion, Radius, Spacing } from "@/theme/tokens";
import { useSemanticColors } from "@/theme/useSemanticColors";

interface CardBaseProps {
  children: React.ReactNode;
  variant?: "elevated" | "glass" | "outline";
  style?: StyleProp<ViewStyle>;
  padding?: number;
  borderRadius?: number;
  accessibilityHint?: string;
}

export type CardProps = CardBaseProps &
  (
    | { onPress?: undefined; accessibilityLabel?: string }
    | { onPress: () => void; accessibilityLabel: string }
  );

export const Card: React.FC<CardProps> = ({
  children,
  onPress,
  variant = "elevated",
  style,
  padding = Spacing.lg,
  borderRadius = Radius.xl,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const colors = useSemanticColors();

  const getVariantStyle = () => {
    switch (variant) {
      case "elevated":
        return {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.borderDefault,
          borderWidth: Hairline.width,
        };
      case "glass":
        return {
          backgroundColor: "transparent",
          borderColor: colors.borderDefault,
          borderWidth: Hairline.width,
        };
      case "outline":
      default:
        return {
          backgroundColor: "transparent",
          borderColor: colors.borderDefault,
          borderWidth: Hairline.width,
        };
    }
  };

  const containerStyles = [getVariantStyle(), { borderRadius, padding }, style];
  const content = (
    <>
      {variant === "glass" ? (
        <GlassSurface
          pointerEvents="none"
          borderRadius={borderRadius}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        android_ripple={{
          color: colors.ripple,
          foreground: true,
        }}
        interactionRadius={borderRadius}
        scaleTo={Motion.cardPressScale}
        style={containerStyles}
      >
        {content}
      </AnimatedPressable>
    );
  }

  return <View style={containerStyles}>{content}</View>;
};
