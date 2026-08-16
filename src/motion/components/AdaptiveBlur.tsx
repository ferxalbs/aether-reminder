import React, { type RefObject } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView, type BlurViewProps } from "expo-blur";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { useMotionProfile } from "../runtime/useMotionProfile";
import { resolveAdaptiveBlurPolicy } from "./blurPolicy";

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
  const useNative =
    decision.mode === "native" &&
    (Platform.OS !== "android" || Boolean(blurTarget));

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
        <BlurView
          intensity={intensity}
          tint={resolvedTint}
          blurTarget={blurTarget}
          blurMethod={decision.blurMethod}
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
