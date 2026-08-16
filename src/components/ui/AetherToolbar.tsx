import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LayoutTokens } from "@/theme/tokens";

export interface AetherToolbarProps {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  center?: React.ReactNode;
}

export const AetherToolbar: React.FC<AetherToolbarProps> = ({
  leading,
  trailing,
  center,
}) => {
  const insets = useSafeAreaInsets();

  if (!leading && !trailing && !center) return null;

  return (
    <View
      style={[styles.container, { paddingTop: Math.max(8, insets.top + 4) }]}
      pointerEvents="box-none"
    >
      <View style={styles.leading} pointerEvents="box-none">
        {leading}
      </View>
      <View style={styles.center} pointerEvents="box-none">
        {center}
      </View>
      <View style={styles.trailing} pointerEvents="box-none">
        {trailing}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: LayoutTokens.screenHorizontal,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 90,
  },
  leading: {
    flexDirection: "row",
    alignItems: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
  },
});
