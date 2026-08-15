import React, { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { subscribeMotionAccessibility } from '../accessibility/motionAccessibility';
import { conservativeCapabilities } from '../core/capabilities';
import { MotionGovernor } from '../core/governor';
import {
  isNativeMotionAvailable,
  readNativeCapabilities,
  subscribeNativeSnapshots,
} from '../core/nativeBridge';
import { profilesEqual } from '../core/policy';
import { ANDROID_NATIVE_BLUR_API } from '../core/thresholds';
import type { MotionAccessibilityState, MotionProfile } from '../core/types';
import { publishMotionDiagnostics } from './diagnosticsStore';
import {
  MotionProfileContext,
  defaultMotionDiagnostics,
} from './motionContext';

interface MotionProviderProps {
  children: React.ReactNode;
}

function platformCapabilities() {
  return conservativeCapabilities(
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown',
  );
}

function createGovernor(): MotionGovernor {
  const capabilities = readNativeCapabilities() ?? platformCapabilities();
  const governor = new MotionGovernor(capabilities);
  if (readNativeCapabilities()) governor.hydrate(readNativeCapabilities());
  return governor;
}

function blurEnabledFor(profile: MotionProfile, androidApiLevel: number | null): boolean {
  if (!profile.budget.allowLiveBlur) return false;
  if (Platform.OS === 'android' && (androidApiLevel == null || androidApiLevel < ANDROID_NATIVE_BLUR_API)) {
    return false;
  }
  return true;
}

export function MotionProvider({ children }: MotionProviderProps) {
  const [governor] = useState(createGovernor);
  const capabilities = readNativeCapabilities();
  const [profile, setProfile] = useState<MotionProfile>(governor.profile());

  useEffect(() => {

    let profileCurrent = governor.profile();
    const accessibilityRef: MotionAccessibilityState = {
      reduceMotion: false,
      reduceTransparency: false,
      prefersCrossFade: false,
    };

    const publish = (next: MotionProfile, extras?: Partial<typeof defaultMotionDiagnostics>) => {
      const inspect = governor.inspect();
      publishMotionDiagnostics({
        ...defaultMotionDiagnostics,
        ...extras,
        profile: next,
        lastDowngradeReason: inspect.lastDowngradeReason,
        lastUpgradeReason: inspect.lastUpgradeReason,
        blurEnabled:
          blurEnabledFor(next, capabilities?.androidApiLevel ?? null)
          && !accessibilityRef.reduceTransparency,
        nativeTelemetryAvailable: isNativeMotionAvailable(),
      });
      if (!profilesEqual(profileCurrent, next)) {
        profileCurrent = next;
        setProfile(next);
      }
    };

    const stopSnapshots = subscribeNativeSnapshots((snapshot) => {
      publish(governor.applySnapshot(snapshot), {
        refreshRateHz: snapshot.currentRefreshRateHz,
        maximumRefreshRateHz: snapshot.maximumRefreshRateHz,
        thermalState: snapshot.thermalState,
        lowPowerMode: snapshot.lowPowerMode,
        lowMemory: snapshot.lowMemory,
        lowRamDevice: snapshot.lowRamDevice,
        jankRatio: snapshot.frames.jankRatio,
        sampleCount: snapshot.frames.frameCount,
        warmUpActive: snapshot.warmUpActive,
        timestampMs: snapshot.timestampMs,
      });
    });

    const stopAccessibility = subscribeMotionAccessibility((accessibility) => {
      Object.assign(accessibilityRef, accessibility);
      publish(governor.setAccessibility(accessibility));
    });

    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      publish(governor.resume());
    });

    return () => {
      stopSnapshots();
      stopAccessibility();
      appState.remove();
    };
  }, [capabilities?.androidApiLevel, governor]);

  return (
    <MotionProfileContext.Provider value={profile}>
      {children}
    </MotionProfileContext.Provider>
  );
}
