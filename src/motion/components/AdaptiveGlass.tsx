import React, { type RefObject } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { Colors } from "@/theme/tokens";
import { useIsDark } from "@/theme/useResolvedTheme";
import { useMotionProfile } from "../runtime/useMotionProfile";
import { AdaptiveBlur } from "./AdaptiveBlur";
import { resolveAdaptiveGlassPolicy } from "./blurPolicy";

export interface AdaptiveGlassProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  blurTarget?: RefObject<View | null>;
  testID?: string;
}

function iosGlassAvailable(): boolean {
  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

export function AdaptiveGlass({
  children,
  style,
  intensity = 45,
  blurTarget,
  testID,
}: AdaptiveGlassProps) {
  const isDark = useIsDark();
  const profile = useMotionProfile();
  const decision = resolveAdaptiveGlassPolicy({
    profile,
    accessibility: {
      reduceMotion: profile.reduceMotion,
      reduceTransparency: profile.reduceTransparency,
      prefersCrossFade: profile.prefersCrossFade,
    },
    platform: Platform.OS,
    androidApiLevel: profile.androidApiLevel,
    iosGlassAvailable: Platform.OS === "ios" && iosGlassAvailable(),
  });

  if (decision.mode === "ios-glass") {
    return (
      <View testID={testID} style={[styles.fill, style]}>
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          colorScheme={isDark ? "dark" : "light"}
        />
        {children}
      </View>
    );
  }

  if (decision.mode === "translucent") {
    return (
      <View
        testID={testID}
        style={[
          styles.fill,
          {
            backgroundColor: isDark
              ? Colors.glassDarkFallback
              : Colors.glassLightFallback,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <AdaptiveBlur
      testID={testID}
      style={style}
      intensity={intensity}
      blurTarget={blurTarget}
    >
      {children}
    </AdaptiveBlur>
  );
}

const styles = StyleSheet.create({
  fill: {
    overflow: "hidden",
  },
});
