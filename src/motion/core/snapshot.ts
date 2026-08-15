import type { NativeMotionSnapshot, ThermalState } from './types';

const THERMAL_STATES = new Set<ThermalState>([
  'unknown',
  'nominal',
  'fair',
  'light',
  'moderate',
  'serious',
  'severe',
  'critical',
  'emergency',
  'shutdown',
]);

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asPositiveNumber(value: unknown): number | null {
  const parsed = asFiniteNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function asNonNegativeNumber(value: unknown): number | null {
  const parsed = asFiniteNumber(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asThermal(value: unknown): ThermalState {
  return typeof value === 'string' && THERMAL_STATES.has(value as ThermalState)
    ? (value as ThermalState)
    : 'unknown';
}

export function parseNativeSnapshot(raw: unknown): NativeMotionSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.platform !== 'android' && value.platform !== 'ios') return null;
  const framesRaw = value.frames;
  if (!framesRaw || typeof framesRaw !== 'object') return null;
  const frames = framesRaw as Record<string, unknown>;
  const frameCount = asFiniteNumber(frames.frameCount);
  const jankCount = asFiniteNumber(frames.jankCount);
  if (frameCount == null || jankCount == null || frameCount < 0 || jankCount < 0) return null;

  const jankRatio = asFiniteNumber(frames.jankRatio);
  const memoryPressureActive = asBoolean(value.memoryPressureActive) ?? asBoolean(value.lowMemory);
  return {
    platform: value.platform,
    currentRefreshRateHz: asPositiveNumber(value.currentRefreshRateHz),
    maximumRefreshRateHz: asPositiveNumber(value.maximumRefreshRateHz),
    lowPowerMode: asBoolean(value.lowPowerMode) ?? false,
    lowMemory: memoryPressureActive,
    memoryPressureActive,
    lowRamDevice: asBoolean(value.lowRamDevice),
    thermalState: asThermal(value.thermalState),
    warmUpActive: asBoolean(value.warmUpActive) ?? false,
    timestampMs: asFiniteNumber(value.timestampMs) ?? Date.now(),
    frames: {
      sampleWindowMs: asNonNegativeNumber(frames.sampleWindowMs) ?? 0,
      frameCount: Math.round(frameCount),
      jankCount: Math.round(jankCount),
      jankRatio: jankRatio != null && jankRatio >= 0 ? jankRatio : null,
      averageFrameDurationMs: asFiniteNumber(frames.averageFrameDurationMs),
      frameOverrunP95Ms: asFiniteNumber(frames.frameOverrunP95Ms),
      cadenceIntervalMs: asNonNegativeNumber(frames.cadenceIntervalMs),
      callbackDelayP95Ms: asFiniteNumber(frames.callbackDelayP95Ms),
    },
  };
}

export function parseNativeCapabilities(raw: unknown): {
  platform: 'android' | 'ios' | 'unknown';
  androidApiLevel: number | null;
  maximumRefreshRateHz: number | null;
  lowRamDevice: boolean | null;
  supportsNativeBlur: boolean;
  nativeTelemetryAvailable: boolean;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const platform = value.platform === 'android' || value.platform === 'ios' ? value.platform : 'unknown';
  return {
    platform,
    androidApiLevel: asFiniteNumber(value.androidApiLevel),
    maximumRefreshRateHz: asPositiveNumber(value.maximumRefreshRateHz),
    lowRamDevice: asBoolean(value.lowRamDevice),
    supportsNativeBlur: asBoolean(value.supportsNativeBlur) ?? false,
    nativeTelemetryAvailable: asBoolean(value.nativeTelemetryAvailable) ?? true,
  };
}
