import React from "react";
import { StyleSheet, View } from "react-native";
import { Typography } from "@/components/ui/Typography";
import { Spacing } from "@/theme/tokens";
import { useSemanticColors } from "@/theme/useSemanticColors";

export interface SettingsHeaderRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}

export const SettingsHeaderRow: React.FC<SettingsHeaderRowProps> = React.memo(
  ({ icon, title, subtitle, trailing }) => {
    const colors = useSemanticColors();

    return (
      <View style={styles.container}>
        <View style={styles.leftGroup}>
          <View style={styles.iconContainer}>{icon}</View>
          <View style={styles.textContainer}>
            <Typography variant="title" style={styles.title}>
              {title}
            </Typography>
            {subtitle ? (
              <Typography
                variant="caption"
                color={colors.textSecondary}
                style={styles.subtitle}
              >
                {subtitle}
              </Typography>
            ) : null}
          </View>
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    );
  },
);

SettingsHeaderRow.displayName = "SettingsHeaderRow";

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 2,
  },
  trailing: {
    marginLeft: Spacing.sm,
  },
});
