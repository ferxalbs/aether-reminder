export { MotionProvider } from './runtime/MotionProvider';
export { useMotionProfile } from './runtime/useMotionProfile';
export { useMotionPreset } from './runtime/useMotionPreset';
export { useMotionDiagnostics, getMotionDiagnosticsSnapshot } from './runtime/useMotionDiagnostics';
export { AdaptiveBlur } from './components/AdaptiveBlur';
export { AdaptiveGlass } from './components/AdaptiveGlass';
export { AdaptiveAnimatedSurface } from './components/AdaptiveAnimatedSurface';
export { resolveAdaptiveBlurPolicy, resolveAdaptiveGlassPolicy } from './components/blurPolicy';
export { resolveMotionPreset, MOTION_PRESET_IDS } from './presets';
export { MotionGovernor } from './core/governor';
export { reduceMotionState, createGovernorState, profileFromState } from './core/policy';
export { frameBudgetMs, MOTION_SNAPSHOT_INTERVAL_MS } from './core/thresholds';
export type {
  MotionBudget,
  MotionDiagnostics,
  MotionPresetId,
  MotionProfile,
  MotionTier,
  NativeMotionSnapshot,
  ResolvedMotionPreset,
  ThermalState,
} from './core/types';
