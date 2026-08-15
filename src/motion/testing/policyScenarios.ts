import { MOTION_DOWNGRADE_WINDOWS, MOTION_RECOVERY_WINDOWS } from '../core/thresholds';
import { createGovernorState, reduceMotionState, type GovernorEvent, type GovernorState } from '../core/policy';
import type { MotionAccessibilityState, NativeMotionCapabilities, NativeMotionSnapshot } from '../core/types';
import { accessibilityFixture, capabilitiesFixture, snapshotFixture } from './fixtures';

export function runScenario(
  events: GovernorEvent[],
  capabilities: NativeMotionCapabilities | null = capabilitiesFixture(),
): GovernorState {
  return events.reduce(
    (state, event) => reduceMotionState(state, event),
    createGovernorState(capabilities),
  );
}

export function jankSnapshots(
  jankRatio: number,
  count: number,
  extras: Partial<NativeMotionSnapshot> = {},
): NativeMotionSnapshot[] {
  return Array.from({ length: count }, (_, index) =>
    snapshotFixture({
      ...extras,
      timestampMs: 2_000 + index * 750,
      frames: {
        frameCount: 80,
        jankCount: Math.round(80 * jankRatio),
        jankRatio,
      },
    }),
  );
}

export function applySnapshots(
  state: GovernorState,
  snapshots: NativeMotionSnapshot[],
  accessibility: MotionAccessibilityState = accessibilityFixture(),
): GovernorState {
  return snapshots.reduce(
    (current, snapshot) =>
      reduceMotionState(current, { type: 'snapshot', snapshot, accessibility }),
    state,
  );
}

export { MOTION_DOWNGRADE_WINDOWS, MOTION_RECOVERY_WINDOWS };
