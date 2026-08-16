import React from "react";
import { StyleSheet, View } from "react-native";
import { Typography } from "@/components/ui/Typography";
import { Spacing } from "@/theme/tokens";
import { useSemanticColors } from "@/theme/useSemanticColors";

export interface SettingsSectionHeaderProps {
  title: string;
}

export const SettingsSectionHeader: React.FC<SettingsSectionHeaderProps> =
  React.memo(({ title }) => {
    const colors = useSemanticColors();

    return (
      <View style={styles.container} accessibilityRole="header">
        <Typography
          variant="tiny"
          color={colors.textSecondary}
          style={styles.headerText}
        >
          {title.toUpperCase()}
        </Typography>
      </View>
    );
  });

SettingsSectionHeader.displayName = "SettingsSectionHeader";

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.xs,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  headerText: {
    letterSpacing: 1.3,
    fontWeight: "700",
  },
});
