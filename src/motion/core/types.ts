export type MotionTier = 'full' | 'standard' | 'reduced' | 'minimal';

export type MotionPlatform = 'android' | 'ios' | 'unknown';

export type ThermalState =
  | 'unknown'
  | 'nominal'
  | 'fair'
  | 'light'
  | 'moderate'
  | 'serious'
  | 'severe'
  | 'critical'
  | 'emergency'
  | 'shutdown';

export type MotionChangeReason =
  | 'initial'
  | 'unknown-capabilities'
  | 'low-ram-ceiling'
  | 'reduce-motion'
  | 'reduce-transparency'
  | 'low-power'
  | 'thermal-moderate'
  | 'thermal-serious'
  | 'thermal-severe'
  | 'thermal-critical'
  | 'low-memory'
  | 'jank-full-to-standard'
  | 'jank-standard-to-reduced'
  | 'jank-reduced-to-minimal'
  | 'recovery-upgrade'
  | 'warmup'
  | 'native-unavailable'
  | 'malformed-snapshot';

export interface NativeMotionFrameWindow {
  sampleWindowMs: number;
  frameCount: number;
  jankCount: number;
  /** Android JankStats ratio. Null on iOS — CADisplayLink is not JankStats. */
  jankRatio: number | null;
  averageFrameDurationMs: number | null;
  /** Android frame overrun P95. Null on iOS. */
  frameOverrunP95Ms: number | null;
  /** iOS scheduled display interval in ms. Optional on Android. */
  cadenceIntervalMs: number | null;
  /** iOS callback delay P95 vs the OS-scheduled target. Optional on Android. */
  callbackDelayP95Ms: number | null;
}

export interface NativeMotionSnapshot {
  platform: 'android' | 'ios';
  /** Observed/scheduled cadence. Not the panel maximum. */
  currentRefreshRateHz: number | null;
  /** Maximum supported refresh rate. A capability, not the current rate. */
  maximumRefreshRateHz: number | null;
  lowPowerMode: boolean;
  /**
   * Android: current ActivityManager.MemoryInfo.lowMemory.
   * iOS: backward-compatible alias of memoryPressureActive.
   */
  lowMemory: boolean | null;
  /** Current AETHER memory-pressure policy input. */
  memoryPressureActive: boolean | null;
  lowRamDevice: boolean | null;
  thermalState: ThermalState;
  frames: NativeMotionFrameWindow;
  warmUpActive: boolean;
  timestampMs: number;
}

export interface NativeMotionCapabilities {
  platform: MotionPlatform;
  androidApiLevel: number | null;
  maximumRefreshRateHz: number | null;
  lowRamDevice: boolean | null;
  supportsNativeBlur: boolean;
  nativeTelemetryAvailable: boolean;
}

export interface MotionAccessibilityState {
  reduceMotion: boolean;
  reduceTransparency: boolean;
  prefersCrossFade: boolean;
}

export interface MotionBudget {
  maxSecondaryAnimations: number;
  allowContinuousDecorativeMotion: boolean;
  allowLiveBlur: boolean;
  allowNativeGlass: boolean;
  allowParallax: boolean;
  allowComplexOrb: boolean;
  allowHighRefreshOrnament: boolean;
}

export interface MotionProfile {
  tier: MotionTier;
  staticCeiling: MotionTier;
  effectiveCeiling: MotionTier;
  budget: MotionBudget;
  lastChangeReason: MotionChangeReason;
  reduceMotion: boolean;
  reduceTransparency: boolean;
  prefersCrossFade: boolean;
  androidApiLevel: number | null;
}

export interface MotionDiagnostics {
  profile: MotionProfile;
  refreshRateHz: number | null;
  maximumRefreshRateHz: number | null;
  thermalState: ThermalState;
  lowPowerMode: boolean;
  lowMemory: boolean | null;
  memoryPressureActive: boolean | null;
  lowRamDevice: boolean | null;
  jankRatio: number | null;
  cadenceIntervalMs: number | null;
  callbackDelayP95Ms: number | null;
  sampleCount: number;
  lastDowngradeReason: MotionChangeReason | null;
  lastUpgradeReason: MotionChangeReason | null;
  blurEnabled: boolean;
  nativeTelemetryAvailable: boolean;
  warmUpActive: boolean;
  timestampMs: number;
}

export type MotionPresetId =
  | 'task.enter'
  | 'task.complete'
  | 'task.dismiss'
  | 'task.reorder'
  | 'navigation.push'
  | 'navigation.tab'
  | 'navigation.modal'
  | 'surface.press'
  | 'surface.release'
  | 'orb.idle'
  | 'orb.listen'
  | 'orb.think'
  | 'orb.success'
  | 'orb.error'
  | 'capture.enter'
  | 'capture.commit'
  | 'sheet.present'
  | 'sheet.dismiss';

export type MotionPresetMode = 'spring' | 'timing' | 'none';

export interface ResolvedMotionPreset {
  id: MotionPresetId;
  tier: MotionTier;
  mode: MotionPresetMode;
  durationMs: number;
  damping: number;
  stiffness: number;
  mass: number;
  scale: number;
  translateY: number;
  opacityFrom: number;
  haptic: boolean;
  secondaryMotion: boolean;
  continuous: boolean;
}

export const MOTION_TIER_RANK: Record<MotionTier, number> = {
  minimal: 0,
  reduced: 1,
  standard: 2,
  full: 3,
};

export function clampMotionTier(tier: MotionTier, ceiling: MotionTier): MotionTier {
  return MOTION_TIER_RANK[tier] <= MOTION_TIER_RANK[ceiling] ? tier : ceiling;
}

export function minMotionTier(a: MotionTier, b: MotionTier): MotionTier {
  return MOTION_TIER_RANK[a] <= MOTION_TIER_RANK[b] ? a : b;
}

export function nextHigherTier(tier: MotionTier): MotionTier {
  if (tier === 'minimal') return 'reduced';
  if (tier === 'reduced') return 'standard';
  if (tier === 'standard') return 'full';
  return 'full';
}

export function nextLowerTier(tier: MotionTier): MotionTier {
  if (tier === 'full') return 'standard';
  if (tier === 'standard') return 'reduced';
  if (tier === 'reduced') return 'minimal';
  return 'minimal';
}
