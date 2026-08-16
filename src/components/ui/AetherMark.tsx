import React from "react";
import { StyleSheet, View } from "react-native";
import { useIsDark } from "@/theme/useResolvedTheme";
import { Colors } from "@/theme/tokens";

interface AetherMarkProps {
  size?: number;
  muted?: boolean;
}

/** Crisp, minimal monochrome AETHER mark with zero decorative shadow or glow. */
export const AetherMark: React.FC<AetherMarkProps> = ({
  size = 32,
  muted = false,
}) => {
  const isDark = useIsDark();
  const ringColor = muted
    ? isDark
      ? Colors.tertiaryTextDark
      : Colors.tertiaryTextLight
    : isDark
      ? Colors.white
      : Colors.black;

  const coreColor = muted
    ? isDark
      ? Colors.secondaryTextDark
      : Colors.secondaryTextLight
    : isDark
      ? Colors.white
      : Colors.black;

  return (
    <View
      accessible={false}
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: ringColor,
          backgroundColor: isDark ? Colors.black : Colors.white,
        },
      ]}
    >
      <View
        style={[
          styles.innerRing,
          {
            width: size * 0.55,
            height: size * 0.55,
            borderRadius: size,
            borderColor: ringColor,
          },
        ]}
      />
      <View
        style={[
          styles.core,
          {
            width: size * 0.22,
            height: size * 0.22,
            borderRadius: size,
            backgroundColor: coreColor,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  mark: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  innerRing: {
    borderWidth: 1.2,
    opacity: 0.8,
  },
  core: {
    position: "absolute",
    right: "20%",
    bottom: "20%",
  },
});
