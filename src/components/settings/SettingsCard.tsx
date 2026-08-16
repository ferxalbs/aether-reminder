import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Hairline, Radius, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";

export interface SettingsCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const SettingsCard: React.FC<SettingsCardProps> = React.memo(
  ({ children, style }) => {
    const { colors } = useAetherTheme();

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderDefault,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  },
);

SettingsCard.displayName = "SettingsCard";

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: Hairline.width,
    padding: Spacing.lg,
    overflow: "hidden",
  },
});
