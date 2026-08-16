import React, { type RefObject } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Colors, Hairline } from "@/theme/tokens";
import { useIsDark } from "@/theme/useResolvedTheme";

interface AssistantMaterialProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  blurTarget?: RefObject<View | null>;
}

/** Crisp, minimal monochrome material surface for floating toolbars and panels. */
export const AssistantMaterial: React.FC<AssistantMaterialProps> = ({
  children,
  style,
  borderRadius = 24,
}) => {
  const isDark = useIsDark();

  return (
    <View
      style={[
        styles.clip,
        styles.fallback,
        {
          borderRadius,
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
          backgroundColor: isDark
            ? "rgba(20, 20, 24, 0.96)"
            : "rgba(248, 248, 250, 0.96)",
        },
        style,
      ]}
    >
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  fallback: {
    borderWidth: Hairline.width,
  },
  content: {
    flex: 1,
  },
});
