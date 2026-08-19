import React, { type RefObject } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import type { BlurViewProps } from "expo-blur";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { useMotionProfile } from "../runtime/useMotionProfile";
import { resolveAdaptiveBlurPolicy } from "./blurPolicy";
import { AetherAndroidBlur } from "./AetherAndroidBlur";
import { resolveAndroidBlurScale } from "./blurScaleDiagnostic";

export interface AdaptiveBlurProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: BlurViewProps["tint"];
  blurTarget?: RefObject<View | null>;
  testID?: string;
}

export function AdaptiveBlur({
  children,
  style,
  intensity = 45,
  tint,
  blurTarget,
  testID,
}: AdaptiveBlurProps) {
  const theme = useAetherTheme();
  const profile = useMotionProfile();
  const decision = resolveAdaptiveBlurPolicy({
    profile,
    accessibility: {
      reduceMotion: profile.reduceMotion,
      reduceTransparency: profile.reduceTransparency,
      prefersCrossFade: profile.prefersCrossFade,
    },
    platform: Platform.OS,
    androidApiLevel: profile.androidApiLevel,
  });

  const fallbackBg = theme.colors.glassChromeFallback;
  const glassBg = theme.colors.glassChrome;
  const resolvedTint = tint ?? theme.mode;
  const useNative = decision.mode === "native" && Boolean(blurTarget);

  return (
    <View
      testID={testID}
      style={[
        styles.fill,
        { backgroundColor: useNative ? glassBg : fallbackBg },
        style,
      ]}
    >
      {useNative ? (
        <AetherAndroidBlur
          intensity={intensity}
          tint={resolvedTint}
          blurTarget={blurTarget}
          scaleFactor={resolveAndroidBlurScale()}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    overflow: "hidden",
  },
});
