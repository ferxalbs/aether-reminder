import React from "react";
import { Platform, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { LucideIcon } from "lucide-react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { Hairline, Radius, TouchTargets } from "@/theme/tokens";
import { useSemanticColors } from "@/theme/useSemanticColors";

export interface AetherToolbarButtonProps {
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  hasBackground?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const AetherToolbarButton: React.FC<AetherToolbarButtonProps> = ({
  icon: Icon,
  onPress,
  accessibilityLabel,
  disabled = false,
  hasBackground = false,
  style,
}) => {
  const colors = useSemanticColors();
  const touchSize =
    Platform.OS === "android" ? TouchTargets.android : TouchTargets.ios;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={
        hasBackground ? { color: colors.ripple, foreground: true } : undefined
      }
      interactionRadius={hasBackground ? Radius.pill : undefined}
      style={({ pressed }) => [
        styles.button,
        { width: touchSize, height: touchSize },
        hasBackground && {
          backgroundColor: colors.surfaceRaised,
          borderRadius: Radius.pill,
          borderWidth: Hairline.width,
          borderColor: colors.borderDefault,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon size={20} color={colors.textPrimary} strokeWidth={1.9} />
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
