import type { MotionTier, ThermalState } from "./types";

/** Aggregate native snapshots are emitted at this interval. Not per-frame. */
export const MOTION_SNAPSHOT_INTERVAL_MS = 750;

/** Ignore frame health after foreground/resume. Startup frames are not steady-state. */
export const MOTION_WARMUP_MS = 2500;

/** One janky window is 750 ms. Two consecutive windows are required to step down. */
export const MOTION_DOWNGRADE_WINDOWS = 2;

/**
 * Recovery requires sustained healthy windows.
 * 27 * 750 ms = 20.25 seconds, slower than any downgrade path.
 */
export const MOTION_RECOVERY_WINDOWS = 27;

export const MOTION_JANK_FULL_TO_STANDARD = 0.08;
export const MOTION_JANK_STANDARD_TO_REDUCED = 0.18;
export const MOTION_JANK_REDUCED_TO_MINIMAL = 0.35;

/**
 * iOS AETHER policy: a memory warning lowers the motion ceiling for this long.
 * Not an Apple guarantee. Must stay in sync with MemoryPressurePolicy.cooldownMs.
 */
export const MOTION_MEMORY_PRESSURE_COOLDOWN_MS = 180_000;

export const DEFAULT_REFRESH_RATE_HZ = 60;

export const ANDROID_NATIVE_BLUR_API = 31;

export function frameBudgetMs(
  refreshRateHz: number | null | undefined,
): number {
  if (
    refreshRateHz == null ||
    !Number.isFinite(refreshRateHz) ||
    refreshRateHz <= 0
  ) {
    return 1000 / DEFAULT_REFRESH_RATE_HZ;
  }
  return 1000 / refreshRateHz;
}

export function budgetForTier(tier: MotionTier): {
  maxSecondaryAnimations: number;
  allowContinuousDecorativeMotion: boolean;
  allowLiveBlur: boolean;
  allowNativeGlass: boolean;
  allowParallax: boolean;
  allowComplexOrb: boolean;
  allowHighRefreshOrnament: boolean;
} {
  switch (tier) {
    case "full":
      return {
        maxSecondaryAnimations: 4,
        allowContinuousDecorativeMotion: true,
        allowLiveBlur: true,
        allowNativeGlass: true,
        allowParallax: true,
        allowComplexOrb: true,
        allowHighRefreshOrnament: true,
      };
    case "standard":
      return {
        maxSecondaryAnimations: 2,
        allowContinuousDecorativeMotion: false,
        allowLiveBlur: true,
        allowNativeGlass: true,
        allowParallax: false,
        allowComplexOrb: true,
        allowHighRefreshOrnament: false,
      };
    case "reduced":
      return {
        maxSecondaryAnimations: 1,
        allowContinuousDecorativeMotion: false,
        allowLiveBlur: false,
        allowNativeGlass: false,
        allowParallax: false,
        allowComplexOrb: false,
        allowHighRefreshOrnament: false,
      };
    case "minimal":
      return {
        maxSecondaryAnimations: 0,
        allowContinuousDecorativeMotion: false,
        allowLiveBlur: false,
        allowNativeGlass: false,
        allowParallax: false,
        allowComplexOrb: false,
        allowHighRefreshOrnament: false,
      };
  }
}

export function thermalCeiling(state: ThermalState): MotionTier {
  switch (state) {
    case "severe":
    case "critical":
    case "emergency":
    case "shutdown":
      return "minimal";
    case "serious":
      return "reduced";
    case "moderate":
    case "light":
    case "fair":
      return "standard";
    case "nominal":
    case "unknown":
      return "full";
  }
}

export function thermalReason(
  state: ThermalState,
):
  | "thermal-moderate"
  | "thermal-serious"
  | "thermal-severe"
  | "thermal-critical"
  | null {
  if (state === "critical" || state === "emergency" || state === "shutdown") {
    return "thermal-critical";
  }
  if (state === "severe") return "thermal-severe";
  if (state === "serious") return "thermal-serious";
  if (state === "moderate") return "thermal-moderate";
  return null;
}
