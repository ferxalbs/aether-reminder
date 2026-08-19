import React, { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { subscribeMotionAccessibility } from "../accessibility/motionAccessibility";
import { conservativeCapabilities } from "../core/capabilities";
import { MotionGovernor } from "../core/governor";
import {
  isNativeMotionAvailable,
  readNativeCapabilities,
  subscribeNativeSnapshots,
} from "../core/nativeBridge";
import { profilesEqual } from "../core/policy";
import { frameBudgetMs } from "../core/thresholds";
import type {
  MotionAccessibilityState,
  MotionProfile,
  NativeMotionCapabilities,
} from "../core/types";
import { publishMotionDiagnostics } from "./diagnosticsStore";
import {
  MotionProfileContext,
  defaultMotionDiagnostics,
} from "./motionContext";

interface MotionProviderProps {
  children: React.ReactNode;
}

function platformCapabilities() {
  return conservativeCapabilities(
    Platform.OS === "ios"
      ? "ios"
      : Platform.OS === "android"
        ? "android"
        : "unknown",
  );
}

function createMotionRuntime(): {
  governor: MotionGovernor;
  capabilities: NativeMotionCapabilities;
} {
  const initialCapabilities =
    readNativeCapabilities() ?? platformCapabilities();
  return {
    governor: new MotionGovernor(initialCapabilities),
    capabilities: initialCapabilities,
  };
}

function blurEnabledFor(
  profile: MotionProfile,
  androidApiLevel: number | null,
): boolean {
  if (!profile.budget.allowLiveBlur) return false;
  if (Platform.OS === "android" && androidApiLevel == null) {
    return false;
  }
  return true;
}

export function MotionProvider({ children }: MotionProviderProps) {
  const [{ governor, capabilities }] = useState(createMotionRuntime);
  const [profile, setProfile] = useState<MotionProfile>(governor.profile());

  useEffect(() => {
    let profileCurrent = governor.profile();
    const accessibilityRef: MotionAccessibilityState = {
      reduceMotion: false,
      reduceTransparency: false,
      prefersCrossFade: false,
    };

    const publish = (
      next: MotionProfile,
      extras?: Partial<typeof defaultMotionDiagnostics>,
    ) => {
      const inspect = governor.inspect();
      publishMotionDiagnostics({
        ...defaultMotionDiagnostics,
        ...extras,
        profile: next,
        lastDowngradeReason: inspect.lastDowngradeReason,
        lastUpgradeReason: inspect.lastUpgradeReason,
        blurEnabled:
          blurEnabledFor(next, capabilities.androidApiLevel) &&
          !accessibilityRef.reduceTransparency,
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
        lowMemory: snapshot.memoryPressureActive ?? snapshot.lowMemory,
        memoryPressureActive:
          snapshot.memoryPressureActive ?? snapshot.lowMemory,
        lowRamDevice: snapshot.lowRamDevice,
        jankRatio: snapshot.frames.jankRatio,
        averageFrameDurationMs: snapshot.frames.averageFrameDurationMs,
        frameOverrunP95Ms: snapshot.frames.frameOverrunP95Ms,
        frameBudgetMs: frameBudgetMs(snapshot.currentRefreshRateHz),
        cadenceIntervalMs: snapshot.frames.cadenceIntervalMs,
        callbackDelayP95Ms: snapshot.frames.callbackDelayP95Ms,
        sampleCount: snapshot.frames.frameCount,
        warmUpActive: snapshot.warmUpActive,
        timestampMs: snapshot.timestampMs,
      });
    });

    const stopAccessibility = subscribeMotionAccessibility((accessibility) => {
      Object.assign(accessibilityRef, accessibility);
      publish(governor.setAccessibility(accessibility));
    });

    const appState = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      publish(governor.resume());
    });

    return () => {
      stopSnapshots();
      stopAccessibility();
      appState.remove();
    };
  }, [capabilities.androidApiLevel, governor]);

  return (
    <MotionProfileContext.Provider value={profile}>
      {children}
    </MotionProfileContext.Provider>
  );
}
