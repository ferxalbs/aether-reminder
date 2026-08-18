import React from "react";
import { Platform, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { LucideIcon } from "lucide-react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { Hairline, Motion, TouchTargets } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";

export interface AetherToolbarButtonProps {
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  hasBackground?: boolean;
  tone?: "primary" | "secondary";
  style?: StyleProp<ViewStyle>;
}

export const AetherToolbarButton: React.FC<AetherToolbarButtonProps> = ({
  icon: Icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  hasBackground = false,
  tone = "primary",
  style,
}) => {
  const theme = useAetherTheme();
  const { colors } = theme;
  const touchSize =
    Platform.OS === "android" ? TouchTargets.android : TouchTargets.ios;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: colors.ripple, foreground: true }}
      interactionRadius={theme.shape.pill}
      scaleTo={Motion.iconPressScale}
      style={[
        styles.button,
        {
          width: touchSize,
          height: touchSize,
          borderRadius: theme.shape.pill,
        },
        hasBackground && {
          backgroundColor: colors.surfaceRaised,
          borderWidth: Hairline.width,
          borderColor: colors.borderDefault,
        },
        disabled && { opacity: theme.control.disabledOpacity },
        style,
      ]}
    >
      <Icon
        size={theme.control.toolbarIconSize}
        color={tone === "secondary" ? colors.textSecondary : colors.textPrimary}
        strokeWidth={theme.control.toolbarIconStrokeWidth}
      />
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
});
