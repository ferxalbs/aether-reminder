import { describe, expect, test } from "bun:test";
import { budgetForTier } from "../core/thresholds";
import type { MotionProfile } from "../core/types";
import {
  resolveAdaptiveBlurPolicy,
  resolveAdaptiveGlassPolicy,
} from "./blurPolicy";

function profile(
  tier: MotionProfile["tier"],
  extras: Partial<MotionProfile> = {},
): MotionProfile {
  return {
    tier,
    staticCeiling: "full",
    effectiveCeiling: tier,
    budget: budgetForTier(tier),
    lastChangeReason: "initial",
    reduceMotion: false,
    reduceTransparency: false,
    prefersCrossFade: false,
    androidApiLevel: 36,
    ...extras,
  };
}

const a11y = {
  reduceMotion: false,
  reduceTransparency: false,
  prefersCrossFade: false,
};

describe("AdaptiveBlur policy", () => {
  test("API 31+ uses the supported native blur path", () => {
    const decision = resolveAdaptiveBlurPolicy({
      profile: profile("full", { androidApiLevel: 31 }),
      accessibility: a11y,
      platform: "android",
      androidApiLevel: 31,
    });
    expect(decision.mode).toBe("native");
    expect(decision.reason).toBe("android-native-blur");
  });

  test("API 31+ and permitted tier allow SDK 31 blur", () => {
    const decision = resolveAdaptiveBlurPolicy({
      profile: profile("standard"),
      accessibility: a11y,
      platform: "android",
      androidApiLevel: 31,
    });
    expect(decision.mode).toBe("native");
    expect(decision.blurMethod).toBe("dimezisBlurView");
  });

  test("unknown Android capability stays conservatively disabled", () => {
    const decision = resolveAdaptiveBlurPolicy({
      profile: profile("standard", { androidApiLevel: null }),
      accessibility: a11y,
      platform: "android",
      androidApiLevel: null,
    });
    expect(decision.mode).toBe("none");
    expect(decision.reason).toBe("android-api-unknown");
  });

  test("reduced and minimal disable blur", () => {
    for (const tier of ["reduced", "minimal"] as const) {
      const decision = resolveAdaptiveBlurPolicy({
        profile: profile(tier),
        accessibility: a11y,
        platform: "android",
        androidApiLevel: 36,
      });
      expect(decision.mode).toBe("none");
    }
  });

  test("runtime degradation disables blur without changing identity fields", () => {
    const decision = resolveAdaptiveBlurPolicy({
      profile: profile("reduced"),
      accessibility: a11y,
      platform: "android",
      androidApiLevel: 36,
    });
    expect(decision.mode).toBe("none");
    expect(decision.reason).toBe("runtime-degraded");
  });

  test("reduce transparency disables blur", () => {
    const decision = resolveAdaptiveBlurPolicy({
      profile: profile("full"),
      accessibility: { ...a11y, reduceTransparency: true },
      platform: "ios",
      androidApiLevel: null,
    });
    expect(decision.mode).toBe("none");
    expect(decision.reason).toBe("accessibility");
  });
});

describe("AdaptiveGlass policy", () => {
  test("uses iOS glass only when the API is available and permitted", () => {
    const allowed = resolveAdaptiveGlassPolicy({
      profile: profile("full"),
      accessibility: a11y,
      platform: "ios",
      androidApiLevel: null,
      iosGlassAvailable: true,
    });
    expect(allowed.mode).toBe("ios-glass");

    const unavailable = resolveAdaptiveGlassPolicy({
      profile: profile("full"),
      accessibility: a11y,
      platform: "ios",
      androidApiLevel: null,
      iosGlassAvailable: false,
    });
    expect(unavailable.mode).toBe("native-blur");
  });

  test("reduce transparency never selects glass", () => {
    const decision = resolveAdaptiveGlassPolicy({
      profile: profile("full"),
      accessibility: { ...a11y, reduceTransparency: true },
      platform: "ios",
      androidApiLevel: null,
      iosGlassAvailable: true,
    });
    expect(decision.mode).toBe("translucent");
  });
});
