import type { MotionTier, NativeMotionCapabilities } from './types';

export function staticCeilingFromCapabilities(
  capabilities: NativeMotionCapabilities | null,
): { ceiling: MotionTier; reason: 'initial' | 'unknown-capabilities' | 'low-ram-ceiling' | 'native-unavailable' } {
  if (!capabilities) {
    return { ceiling: 'standard', reason: 'native-unavailable' };
  }
  if (!capabilities.nativeTelemetryAvailable && capabilities.lowRamDevice == null) {
    return { ceiling: 'standard', reason: 'unknown-capabilities' };
  }
  if (capabilities.lowRamDevice === true) {
    return { ceiling: 'reduced', reason: 'low-ram-ceiling' };
  }
  return { ceiling: 'full', reason: 'initial' };
}

export function conservativeCapabilities(platform: NativeMotionCapabilities['platform'] = 'unknown'): NativeMotionCapabilities {
  return {
    platform,
    androidApiLevel: null,
    maximumRefreshRateHz: null,
    lowRamDevice: null,
    supportsNativeBlur: false,
    nativeTelemetryAvailable: false,
  };
}
