import type { MotionAccessibilityState } from "../core/types";

export function applyAccessibilityToBudget(
  accessibility: MotionAccessibilityState,
  allowLiveBlur: boolean,
  allowNativeGlass: boolean,
): { allowLiveBlur: boolean; allowNativeGlass: boolean } {
  if (accessibility.reduceTransparency || accessibility.reduceMotion) {
    return { allowLiveBlur: false, allowNativeGlass: false };
  }
  return { allowLiveBlur, allowNativeGlass };
}
