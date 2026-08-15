import { staticCeilingFromCapabilities } from './capabilities';
import {
  MOTION_DOWNGRADE_WINDOWS,
  MOTION_JANK_FULL_TO_STANDARD,
  MOTION_JANK_REDUCED_TO_MINIMAL,
  MOTION_JANK_STANDARD_TO_REDUCED,
  MOTION_RECOVERY_WINDOWS,
  budgetForTier,
  thermalCeiling,
  thermalReason,
} from './thresholds';
import type {
  MotionAccessibilityState,
  MotionChangeReason,
  MotionProfile,
  MotionTier,
  NativeMotionCapabilities,
  NativeMotionSnapshot,
} from './types';
import { clampMotionTier, minMotionTier, nextHigherTier, nextLowerTier } from './types';

export interface GovernorState {
  staticCeiling: MotionTier;
  effectiveCeiling: MotionTier;
  runtimeTier: MotionTier;
  consecutiveBadWindows: number;
  consecutiveHealthyWindows: number;
  lastChangeReason: MotionChangeReason;
  lastDowngradeReason: MotionChangeReason | null;
  lastUpgradeReason: MotionChangeReason | null;
  lastSnapshot: NativeMotionSnapshot | null;
}

export type GovernorEvent =
  | { type: 'hydrate'; capabilities: NativeMotionCapabilities | null }
  | { type: 'accessibility'; accessibility: MotionAccessibilityState }
  | { type: 'snapshot'; snapshot: NativeMotionSnapshot; accessibility: MotionAccessibilityState }
  | { type: 'resume'; accessibility: MotionAccessibilityState };

export function createGovernorState(
  capabilities: NativeMotionCapabilities | null = null,
): GovernorState {
  const staticCeiling = staticCeilingFromCapabilities(capabilities);
  return {
    staticCeiling: staticCeiling.ceiling,
    effectiveCeiling: staticCeiling.ceiling,
    runtimeTier: staticCeiling.ceiling === 'full' ? 'standard' : staticCeiling.ceiling,
    consecutiveBadWindows: 0,
    consecutiveHealthyWindows: 0,
    lastChangeReason: staticCeiling.reason,
    lastDowngradeReason: null,
    lastUpgradeReason: null,
    lastSnapshot: null,
  };
}

export function reduceMotionState(
  state: GovernorState,
  event: GovernorEvent,
): GovernorState {
  if (event.type === 'hydrate') {
    const next = createGovernorState(event.capabilities);
    return applyCeiling(next, event.capabilities, emptyAccessibility(), state.lastSnapshot);
  }
  if (event.type === 'resume') {
    return applyCeiling(
      {
        ...state,
        consecutiveBadWindows: 0,
        consecutiveHealthyWindows: 0,
      },
      capabilitiesFromSnapshot(state.lastSnapshot),
      event.accessibility,
      state.lastSnapshot,
    );
  }
  if (event.type === 'accessibility') {
    return applyCeiling(
      state,
      capabilitiesFromSnapshot(state.lastSnapshot),
      event.accessibility,
      state.lastSnapshot,
    );
  }
  return applySnapshot(state, event.snapshot, event.accessibility);
}

function emptyAccessibility(): MotionAccessibilityState {
  return { reduceMotion: false, reduceTransparency: false, prefersCrossFade: false };
}

function capabilitiesFromSnapshot(
  snapshot: NativeMotionSnapshot | null,
): NativeMotionCapabilities | null {
  if (!snapshot) return null;
  return {
    platform: snapshot.platform,
    androidApiLevel: null,
    maximumRefreshRateHz: snapshot.maximumRefreshRateHz,
    lowRamDevice: snapshot.lowRamDevice,
    supportsNativeBlur: snapshot.platform === 'ios' || snapshot.platform === 'android',
    nativeTelemetryAvailable: true,
  };
}

function computeCeiling(
  staticCeiling: MotionTier,
  snapshot: NativeMotionSnapshot | null,
  accessibility: MotionAccessibilityState,
  capabilities: NativeMotionCapabilities | null,
): { ceiling: MotionTier; reason: MotionChangeReason } {
  let ceiling = staticCeiling;
  let reason: MotionChangeReason = 'initial';

  const lowRam = snapshot?.lowRamDevice ?? capabilities?.lowRamDevice;
  if (lowRam) {
    ceiling = minMotionTier(ceiling, 'reduced');
    reason = 'low-ram-ceiling';
  }
  if (snapshot?.lowPowerMode) {
    ceiling = minMotionTier(ceiling, 'standard');
    reason = 'low-power';
  }
  if (snapshot?.lowMemory) {
    ceiling = minMotionTier(ceiling, 'reduced');
    reason = 'low-memory';
  }
  if (snapshot) {
    const thermalCap = thermalCeiling(snapshot.thermalState);
    if (thermalCap !== 'full') {
      ceiling = minMotionTier(ceiling, thermalCap);
      reason = thermalReason(snapshot.thermalState) ?? reason;
    }
  }
  if (accessibility.reduceTransparency) {
    reason = reason === 'initial' ? 'reduce-transparency' : reason;
  }
  if (accessibility.reduceMotion) {
    return { ceiling: 'minimal', reason: 'reduce-motion' };
  }
  return { ceiling, reason };
}

function applyCeiling(
  state: GovernorState,
  capabilities: NativeMotionCapabilities | null,
  accessibility: MotionAccessibilityState,
  snapshot: NativeMotionSnapshot | null,
): GovernorState {
  const staticCeiling = staticCeilingFromCapabilities(capabilities);
  const ceiling = computeCeiling(staticCeiling.ceiling, snapshot, accessibility, capabilities);
  const runtimeTier = clampMotionTier(state.runtimeTier, ceiling.ceiling);
  const immediate = accessibility.reduceMotion
    || snapshot?.thermalState === 'critical'
    || snapshot?.thermalState === 'emergency'
    || snapshot?.thermalState === 'shutdown';
  const nextTier = immediate ? ceiling.ceiling : runtimeTier;
  return {
    ...state,
    staticCeiling: staticCeiling.ceiling,
    effectiveCeiling: ceiling.ceiling,
    runtimeTier: nextTier,
    lastChangeReason: nextTier !== state.runtimeTier ? ceiling.reason : state.lastChangeReason,
    lastDowngradeReason:
      rank(nextTier) < rank(state.runtimeTier) ? ceiling.reason : state.lastDowngradeReason,
    lastSnapshot: snapshot ?? state.lastSnapshot,
  };
}

function applySnapshot(
  state: GovernorState,
  snapshot: NativeMotionSnapshot,
  accessibility: MotionAccessibilityState,
): GovernorState {
  const capabilities: NativeMotionCapabilities = {
    platform: snapshot.platform,
    androidApiLevel: null,
    maximumRefreshRateHz: snapshot.maximumRefreshRateHz,
    lowRamDevice: snapshot.lowRamDevice,
    supportsNativeBlur: true,
    nativeTelemetryAvailable: true,
  };
  const staticCeiling = staticCeilingFromCapabilities(capabilities);
  const ceiling = computeCeiling(staticCeiling.ceiling, snapshot, accessibility, capabilities);
  let next: GovernorState = {
    ...state,
    staticCeiling: staticCeiling.ceiling,
    effectiveCeiling: ceiling.ceiling,
    lastSnapshot: snapshot,
  };

  const immediate = accessibility.reduceMotion
    || snapshot.thermalState === 'critical'
    || snapshot.thermalState === 'emergency'
    || snapshot.thermalState === 'shutdown';
  if (immediate) {
    return {
      ...next,
      runtimeTier: ceiling.ceiling,
      consecutiveBadWindows: 0,
      consecutiveHealthyWindows: 0,
      lastChangeReason: ceiling.reason,
      lastDowngradeReason: rank(ceiling.ceiling) < rank(state.runtimeTier)
        ? ceiling.reason
        : state.lastDowngradeReason,
    };
  }

  next.runtimeTier = clampMotionTier(next.runtimeTier, ceiling.ceiling);
  if (snapshot.warmUpActive || snapshot.frames.frameCount === 0) {
    return {
      ...next,
      lastChangeReason: snapshot.warmUpActive ? 'warmup' : next.lastChangeReason,
    };
  }

  const jank = snapshot.frames.jankRatio;
  const targetFromJank = jankTarget(jank);
  if (targetFromJank && rank(targetFromJank) < rank(next.runtimeTier)) {
    const bad = next.consecutiveBadWindows + 1;
    if (bad >= MOTION_DOWNGRADE_WINDOWS) {
      const stepped = clampMotionTier(nextLowerTier(next.runtimeTier), ceiling.ceiling);
      const reason = downgradeReason(next.runtimeTier, stepped);
      return {
        ...next,
        runtimeTier: stepped,
        consecutiveBadWindows: 0,
        consecutiveHealthyWindows: 0,
        lastChangeReason: reason,
        lastDowngradeReason: reason,
      };
    }
    return {
      ...next,
      consecutiveBadWindows: bad,
      consecutiveHealthyWindows: 0,
    };
  }

  const healthy = jank == null || jank < MOTION_JANK_FULL_TO_STANDARD;
  if (healthy && rank(next.runtimeTier) < rank(ceiling.ceiling)) {
    const stable = next.consecutiveHealthyWindows + 1;
    if (stable >= MOTION_RECOVERY_WINDOWS) {
      const stepped = clampMotionTier(nextHigherTier(next.runtimeTier), ceiling.ceiling);
      return {
        ...next,
        runtimeTier: stepped,
        consecutiveBadWindows: 0,
        consecutiveHealthyWindows: 0,
        lastChangeReason: 'recovery-upgrade',
        lastUpgradeReason: 'recovery-upgrade',
      };
    }
    return {
      ...next,
      consecutiveBadWindows: 0,
      consecutiveHealthyWindows: stable,
    };
  }

  return {
    ...next,
    consecutiveBadWindows: 0,
    consecutiveHealthyWindows: healthy ? next.consecutiveHealthyWindows : 0,
  };
}

function jankTarget(jankRatio: number | null): MotionTier | null {
  if (jankRatio == null) return null;
  if (jankRatio >= MOTION_JANK_REDUCED_TO_MINIMAL) return 'minimal';
  if (jankRatio >= MOTION_JANK_STANDARD_TO_REDUCED) return 'reduced';
  if (jankRatio >= MOTION_JANK_FULL_TO_STANDARD) return 'standard';
  return null;
}

function downgradeReason(from: MotionTier, to: MotionTier): MotionChangeReason {
  if (from === 'full' && to === 'standard') return 'jank-full-to-standard';
  if (from === 'standard' && to === 'reduced') return 'jank-standard-to-reduced';
  return 'jank-reduced-to-minimal';
}

function rank(tier: MotionTier): number {
  if (tier === 'minimal') return 0;
  if (tier === 'reduced') return 1;
  if (tier === 'standard') return 2;
  return 3;
}

export function profileFromState(
  state: GovernorState,
  extras: {
    reduceMotion?: boolean;
    reduceTransparency?: boolean;
    prefersCrossFade?: boolean;
    androidApiLevel?: number | null;
  } = {},
): MotionProfile {
  const budget = budgetForTier(state.runtimeTier);
  return {
    tier: state.runtimeTier,
    staticCeiling: state.staticCeiling,
    effectiveCeiling: state.effectiveCeiling,
    budget,
    lastChangeReason: state.lastChangeReason,
    reduceMotion: extras.reduceMotion ?? false,
    reduceTransparency: extras.reduceTransparency ?? false,
    prefersCrossFade: extras.prefersCrossFade ?? false,
    androidApiLevel: extras.androidApiLevel ?? null,
  };
}

export function profilesEqual(a: MotionProfile, b: MotionProfile): boolean {
  return (
    a.tier === b.tier
    && a.staticCeiling === b.staticCeiling
    && a.effectiveCeiling === b.effectiveCeiling
    && a.lastChangeReason === b.lastChangeReason
    && a.reduceMotion === b.reduceMotion
    && a.reduceTransparency === b.reduceTransparency
    && a.prefersCrossFade === b.prefersCrossFade
    && a.androidApiLevel === b.androidApiLevel
    && a.budget.allowLiveBlur === b.budget.allowLiveBlur
    && a.budget.allowNativeGlass === b.budget.allowNativeGlass
    && a.budget.allowComplexOrb === b.budget.allowComplexOrb
    && a.budget.allowContinuousDecorativeMotion === b.budget.allowContinuousDecorativeMotion
    && a.budget.allowParallax === b.budget.allowParallax
    && a.budget.maxSecondaryAnimations === b.budget.maxSecondaryAnimations
  );
}
