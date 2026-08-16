import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { Typography } from "@/components/ui/Typography";
import { getMinimumTouchTarget, Radius, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";

export interface SettingsRowProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = React.memo(
  ({
    icon,
    title,
    description,
    trailing,
    onPress,
    disabled = false,
    accessibilityLabel,
    accessibilityHint,
  }) => {
    const { colors } = useAetherTheme();

    const content = (
      <View style={styles.container}>
        <View style={styles.leftGroup}>
          {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
          <View style={styles.textContainer}>
            <Typography
              variant="bodyBold"
              color={disabled ? colors.textDisabled : colors.textPrimary}
              style={styles.title}
            >
              {title}
            </Typography>
            {description ? (
              <Typography
                variant="caption"
                color={disabled ? colors.textDisabled : colors.textSecondary}
                style={styles.description}
              >
                {description}
              </Typography>
            ) : null}
          </View>
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    );

    if (onPress) {
      return (
        <AnimatedPressable
          onPress={onPress}
          disabled={disabled}
          scaleTo={0.98}
          interactionRadius={Radius.md}
          android_ripple={{ color: colors.ripple, foreground: true }}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? title}
          accessibilityHint={accessibilityHint}
          style={styles.pressable}
        >
          {content}
        </AnimatedPressable>
      );
    }

    return content;
  },
);

SettingsRow.displayName = "SettingsRow";

const styles = StyleSheet.create({
  pressable: {
    borderRadius: Radius.md,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: getMinimumTouchTarget(Platform.OS),
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontWeight: "600",
  },
  description: {
    marginTop: 2,
    lineHeight: 18,
  },
  trailing: {
    marginLeft: Spacing.sm,
  },
});
