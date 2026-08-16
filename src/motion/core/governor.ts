import { conservativeCapabilities } from "./capabilities";
import {
  createGovernorState,
  profileFromState,
  reduceMotionState,
  type GovernorState,
} from "./policy";
import type {
  MotionAccessibilityState,
  MotionProfile,
  NativeMotionCapabilities,
  NativeMotionSnapshot,
} from "./types";

export class MotionGovernor {
  private state: GovernorState;
  private androidApiLevel: number | null = null;
  private accessibility: MotionAccessibilityState = {
    reduceMotion: false,
    reduceTransparency: false,
    prefersCrossFade: false,
  };

  constructor(
    capabilities: NativeMotionCapabilities | null = conservativeCapabilities(),
  ) {
    this.state = createGovernorState(capabilities);
    this.androidApiLevel = capabilities?.androidApiLevel ?? null;
  }

  hydrate(capabilities: NativeMotionCapabilities | null): MotionProfile {
    this.androidApiLevel =
      capabilities?.androidApiLevel ?? this.androidApiLevel;
    this.state = reduceMotionState(this.state, {
      type: "hydrate",
      capabilities,
    });
    return this.profile();
  }

  setAccessibility(accessibility: MotionAccessibilityState): MotionProfile {
    this.accessibility = accessibility;
    this.state = reduceMotionState(this.state, {
      type: "accessibility",
      accessibility,
    });
    return this.profile();
  }

  resume(): MotionProfile {
    this.state = reduceMotionState(this.state, {
      type: "resume",
      accessibility: this.accessibility,
    });
    return this.profile();
  }

  applySnapshot(snapshot: NativeMotionSnapshot): MotionProfile {
    this.state = reduceMotionState(this.state, {
      type: "snapshot",
      snapshot,
      accessibility: this.accessibility,
    });
    return this.profile();
  }

  profile(): MotionProfile {
    return profileFromState(this.state, {
      ...this.accessibility,
      androidApiLevel: this.androidApiLevel,
    });
  }

  inspect(): GovernorState {
    return this.state;
  }
}
