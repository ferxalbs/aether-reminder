import { createContext } from "react";
import { budgetForTier } from "../core/thresholds";
import type { MotionDiagnostics, MotionProfile } from "../core/types";

export const defaultMotionProfile: MotionProfile = {
  tier: "standard",
  staticCeiling: "standard",
  effectiveCeiling: "standard",
  budget: budgetForTier("standard"),
  lastChangeReason: "native-unavailable",
  reduceMotion: false,
  reduceTransparency: false,
  prefersCrossFade: false,
  androidApiLevel: null,
};

export const defaultMotionDiagnostics: MotionDiagnostics = {
  profile: defaultMotionProfile,
  refreshRateHz: null,
  maximumRefreshRateHz: null,
  thermalState: "unknown",
  lowPowerMode: false,
  lowMemory: null,
  memoryPressureActive: null,
  lowRamDevice: null,
  jankRatio: null,
  cadenceIntervalMs: null,
  callbackDelayP95Ms: null,
  sampleCount: 0,
  lastDowngradeReason: null,
  lastUpgradeReason: null,
  blurEnabled: false,
  nativeTelemetryAvailable: false,
  warmUpActive: false,
  timestampMs: 0,
};

export const MotionProfileContext =
  createContext<MotionProfile>(defaultMotionProfile);
export const MotionDiagnosticsContext = createContext<MotionDiagnostics>(
  defaultMotionDiagnostics,
);
