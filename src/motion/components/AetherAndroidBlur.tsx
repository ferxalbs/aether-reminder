import type { RefObject } from "react";
import type { BlurViewProps } from "expo-blur";
import type { View, ViewProps } from "react-native";
import type { AndroidBlurScale } from "./blurScaleDiagnostic";

export interface AetherAndroidBlurProps extends ViewProps {
  intensity?: number;
  tint?: BlurViewProps["tint"];
  blurTarget?: RefObject<View | null>;
  scaleFactor: AndroidBlurScale;
}

// This component is only rendered by the Android-specific AdaptiveBlur file.
// Keeping a no-op base avoids loading an Android-only native view on Apple.
export function AetherAndroidBlur(_props: AetherAndroidBlurProps): null {
  return null;
}
