import { AccessibilityInfo, Platform } from "react-native";
import type { MotionAccessibilityState } from "../core/types";

export { applyAccessibilityToBudget } from "./motionEffects";

const empty: MotionAccessibilityState = {
  reduceMotion: false,
  reduceTransparency: false,
  prefersCrossFade: false,
};

async function readFlag(reader: () => Promise<boolean>): Promise<boolean> {
  try {
    return await reader();
  } catch {
    return false;
  }
}

export async function readMotionAccessibility(): Promise<MotionAccessibilityState> {
  const [reduceMotion, reduceTransparency, prefersCrossFade] =
    await Promise.all([
      readFlag(() => AccessibilityInfo.isReduceMotionEnabled()),
      Platform.OS === "ios"
        ? readFlag(() => AccessibilityInfo.isReduceTransparencyEnabled())
        : Promise.resolve(false),
      readFlag(() => AccessibilityInfo.prefersCrossFadeTransitions()),
    ]);
  return { reduceMotion, reduceTransparency, prefersCrossFade };
}

export function subscribeMotionAccessibility(
  listener: (state: MotionAccessibilityState) => void,
): () => void {
  let current = { ...empty };
  const emit = (partial: Partial<MotionAccessibilityState>) => {
    current = { ...current, ...partial };
    listener(current);
  };

  void readMotionAccessibility().then((state) => {
    current = state;
    listener(state);
  });

  const reduceMotion = AccessibilityInfo.addEventListener(
    "reduceMotionChanged",
    (value) => {
      emit({ reduceMotion: value });
    },
  );
  const reduceTransparency = AccessibilityInfo.addEventListener(
    "reduceTransparencyChanged",
    (value) => {
      emit({ reduceTransparency: value });
    },
  );

  return () => {
    reduceMotion.remove();
    reduceTransparency.remove();
  };
}
