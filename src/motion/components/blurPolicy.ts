import { applyAccessibilityToBudget } from "../accessibility/motionEffects";
import type { MotionAccessibilityState, MotionProfile } from "../core/types";

type MotionPlatformName = "ios" | "android" | "web" | "windows" | "macos";

export type AdaptiveBlurMode = "native" | "none";
export type AdaptiveGlassMode = "ios-glass" | "native-blur" | "translucent";

export interface AdaptiveBlurDecision {
  mode: AdaptiveBlurMode;
  blurMethod: "dimezisBlurView" | undefined;
  reason:
    | "ios-blur"
    | "android-native-blur"
    | "android-api-unknown"
    | "tier-disabled"
    | "accessibility"
    | "runtime-degraded";
}

export interface AdaptiveGlassDecision {
  mode: AdaptiveGlassMode;
  reason: string;
}

export function resolveAdaptiveBlurPolicy(input: {
  profile: MotionProfile;
  accessibility: MotionAccessibilityState;
  platform: MotionPlatformName;
  androidApiLevel: number | null;
}): AdaptiveBlurDecision {
  const effects = applyAccessibilityToBudget(
    input.accessibility,
    input.profile.budget.allowLiveBlur,
    input.profile.budget.allowNativeGlass,
  );
  if (!effects.allowLiveBlur) {
    return {
      mode: "none",
      blurMethod: undefined,
      reason:
        input.accessibility.reduceMotion ||
        input.accessibility.reduceTransparency
          ? "accessibility"
          : input.profile.tier === "reduced" || input.profile.tier === "minimal"
            ? "runtime-degraded"
            : "tier-disabled",
    };
  }
  if (input.platform === "android") {
    // API 31 is the product minimum. Keep only a conservative unknown-capability
    // fallback; supported Android devices always take the native blur path.
    if (input.androidApiLevel == null) {
      return {
        mode: "none",
        blurMethod: undefined,
        reason: "android-api-unknown",
      };
    }
    return {
      mode: "native",
      blurMethod: "dimezisBlurView",
      reason: "android-native-blur",
    };
  }
  if (input.platform === "ios") {
    return { mode: "native", blurMethod: undefined, reason: "ios-blur" };
  }
  return { mode: "none", blurMethod: undefined, reason: "tier-disabled" };
}

export function resolveAdaptiveGlassPolicy(input: {
  profile: MotionProfile;
  accessibility: MotionAccessibilityState;
  platform: MotionPlatformName;
  androidApiLevel: number | null;
  iosGlassAvailable: boolean;
}): AdaptiveGlassDecision {
  const effects = applyAccessibilityToBudget(
    input.accessibility,
    input.profile.budget.allowLiveBlur,
    input.profile.budget.allowNativeGlass,
  );
  if (
    input.platform === "ios" &&
    input.iosGlassAvailable &&
    effects.allowNativeGlass
  ) {
    return { mode: "ios-glass", reason: "ios-glass-available" };
  }
  const blur = resolveAdaptiveBlurPolicy(input);
  if (blur.mode === "native") {
    return { mode: "native-blur", reason: blur.reason };
  }
  return { mode: "translucent", reason: blur.reason };
}
