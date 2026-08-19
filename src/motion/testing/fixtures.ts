import type {
  MotionAccessibilityState,
  NativeMotionCapabilities,
  NativeMotionSnapshot,
} from "../core/types";

export function snapshotFixture(
  overrides: Omit<Partial<NativeMotionSnapshot>, "frames"> & {
    frames?: Partial<NativeMotionSnapshot["frames"]>;
  } = {},
): NativeMotionSnapshot {
  const { frames, ...rest } = overrides;
  return {
    platform: "android",
    currentRefreshRateHz: 120,
    maximumRefreshRateHz: 120,
    lowPowerMode: false,
    lowMemory: false,
    memoryPressureActive: false,
    lowRamDevice: false,
    thermalState: "nominal",
    warmUpActive: false,
    timestampMs: 1_000,
    ...rest,
    frames: {
      sampleWindowMs: 750,
      frameCount: 90,
      jankCount: 1,
      jankRatio: 1 / 90,
      averageFrameDurationMs: 8.3,
      frameOverrunP95Ms: -0.4,
      cadenceIntervalMs: null,
      callbackDelayP95Ms: null,
      ...frames,
    },
  };
}

export function capabilitiesFixture(
  overrides: Partial<NativeMotionCapabilities> = {},
): NativeMotionCapabilities {
  return {
    platform: "android",
    androidApiLevel: 36,
    maximumRefreshRateHz: 120,
    lowRamDevice: false,
    supportsNativeBlur: true,
    nativeTelemetryAvailable: true,
    ...overrides,
  };
}

export function accessibilityFixture(
  overrides: Partial<MotionAccessibilityState> = {},
): MotionAccessibilityState {
  return {
    reduceMotion: false,
    reduceTransparency: false,
    prefersCrossFade: false,
    ...overrides,
  };
}
