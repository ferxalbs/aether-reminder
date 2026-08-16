import React from "react";
import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { GlassSurface } from "./GlassSurface";
import { Colors, Hairline, Motion, Radius, Spacing } from "@/theme/tokens";
import { useIsDark } from "@/theme/useResolvedTheme";

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
  const isDark = useIsDark();

  const getVariantStyle = () => {
    switch (variant) {
      case "elevated":
        return {
          backgroundColor: isDark
            ? Colors.surfaceRaisedDark
            : Colors.surfaceRaisedLight,
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
          borderWidth: Hairline.width,
        };
      case "glass":
        return {
          backgroundColor: "transparent",
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
          borderWidth: Hairline.width,
        };
      case "outline":
      default:
        return {
          backgroundColor: "transparent",
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
          borderWidth: Hairline.width,
        };
    }
  };

  const containerStyles = [
    styles.base,
    getVariantStyle(),
    { borderRadius, padding },
    style,
  ];
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
          color: isDark ? Colors.rippleDark : Colors.rippleLight,
        }}
        scaleTo={Motion.cardPressScale}
        style={containerStyles}
      >
        {content}
      </AnimatedPressable>
    );
  }

  return <View style={containerStyles}>{content}</View>;
};

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
});
