export type MotionPlatform = 'android' | 'ios';

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

export interface NativeMotionFrameWindow {
  sampleWindowMs: number;
  frameCount: number;
  jankCount: number;
  jankRatio: number | null;
  averageFrameDurationMs: number | null;
  frameOverrunP95Ms: number | null;
}

export interface NativeMotionSnapshot {
  platform: MotionPlatform;
  currentRefreshRateHz: number | null;
  maximumRefreshRateHz: number | null;
  lowPowerMode: boolean;
  lowMemory: boolean | null;
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
  nativeTelemetryAvailable: true;
}

/** Aggregate snapshots are emitted at this interval. Not a frame callback. */
export const MOTION_SNAPSHOT_INTERVAL_MS = 750;
