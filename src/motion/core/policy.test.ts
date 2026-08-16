import { describe, expect, test } from "bun:test";
import {
  createGovernorState,
  profileFromState,
  profilesEqual,
  reduceMotionState,
} from "./policy";
import { frameBudgetMs } from "./thresholds";
import {
  accessibilityFixture,
  capabilitiesFixture,
  snapshotFixture,
} from "../testing/fixtures";
import {
  applySnapshots,
  jankSnapshots,
  MOTION_DOWNGRADE_WINDOWS,
  MOTION_RECOVERY_WINDOWS,
} from "../testing/policyScenarios";

const a11y = accessibilityFixture();

describe("frame budget", () => {
  test("derives 1000 / refreshRate for arbitrary rates", () => {
    expect(frameBudgetMs(60)).toBeCloseTo(1000 / 60);
    expect(frameBudgetMs(90)).toBeCloseTo(1000 / 90);
    expect(frameBudgetMs(120)).toBeCloseTo(1000 / 120);
    expect(frameBudgetMs(144)).toBeCloseTo(1000 / 144);
    expect(frameBudgetMs(165)).toBeCloseTo(1000 / 165);
  });

  test("invalid refresh rates fall back to 60 Hz", () => {
    expect(frameBudgetMs(null)).toBeCloseTo(1000 / 60);
    expect(frameBudgetMs(0)).toBeCloseTo(1000 / 60);
    expect(frameBudgetMs(-30)).toBeCloseTo(1000 / 60);
    expect(frameBudgetMs(Number.NaN)).toBeCloseTo(1000 / 60);
  });
});

describe("initial tier", () => {
  test("capable nominal device starts at standard under a full ceiling", () => {
    const state = createGovernorState(capabilitiesFixture());
    expect(state.staticCeiling).toBe("full");
    expect(state.runtimeTier).toBe("standard");
  });

  test("low-RAM device ceilings at reduced", () => {
    const state = createGovernorState(
      capabilitiesFixture({ lowRamDevice: true }),
    );
    expect(state.staticCeiling).toBe("reduced");
    expect(state.runtimeTier).toBe("reduced");
  });

  test("unknown capabilities stay conservative", () => {
    const state = createGovernorState(null);
    expect(state.staticCeiling).toBe("standard");
    expect(state.runtimeTier).toBe("standard");
  });

  test("API below native blur does not force minimal", () => {
    const state = createGovernorState(
      capabilitiesFixture({ androidApiLevel: 30, supportsNativeBlur: false }),
    );
    expect(state.runtimeTier).not.toBe("minimal");
    expect(state.staticCeiling).toBe("full");
  });

  test("refresh rate does not select the tier by itself", () => {
    for (const rate of [60, 90, 120, 144]) {
      const state = createGovernorState(
        capabilitiesFixture({ maximumRefreshRateHz: rate }),
      );
      expect(state.staticCeiling).toBe("full");
    }
  });
});

describe("hysteresis", () => {
  test("one janky window does not permanently degrade", () => {
    let state = createGovernorState(capabilitiesFixture());
    state = { ...state, runtimeTier: "full" };
    state = applySnapshots(state, jankSnapshots(0.12, 1));
    expect(state.runtimeTier).toBe("full");
    expect(state.consecutiveBadWindows).toBe(1);
  });

  test("required consecutive windows degrade one step", () => {
    let state = createGovernorState(capabilitiesFixture());
    state = applySnapshots(state, [
      snapshotFixture({
        frames: { frameCount: 80, jankCount: 2, jankRatio: 0.02 },
      }),
    ]);
    state = { ...state, runtimeTier: "full" };
    state = applySnapshots(
      state,
      jankSnapshots(0.12, MOTION_DOWNGRADE_WINDOWS),
    );
    expect(state.runtimeTier).toBe("standard");
    expect(state.lastDowngradeReason).toBe("jank-full-to-standard");
  });

  test("tier cannot oscillate rapidly", () => {
    let state = createGovernorState(capabilitiesFixture());
    state = { ...state, runtimeTier: "full" };
    state = applySnapshots(
      state,
      jankSnapshots(0.12, MOTION_DOWNGRADE_WINDOWS),
    );
    expect(state.runtimeTier).toBe("standard");
    state = applySnapshots(state, jankSnapshots(0.01, 4));
    expect(state.runtimeTier).toBe("standard");
  });

  test("downgrade happens faster than upgrade", () => {
    expect(MOTION_DOWNGRADE_WINDOWS).toBeLessThan(MOTION_RECOVERY_WINDOWS);
  });

  test("recovery requires sustained stability", () => {
    let state = createGovernorState(capabilitiesFixture());
    state = applySnapshots(
      state,
      jankSnapshots(0.22, MOTION_DOWNGRADE_WINDOWS),
    );
    expect(state.runtimeTier).toBe("reduced");
    state = applySnapshots(
      state,
      jankSnapshots(0.01, MOTION_RECOVERY_WINDOWS - 1),
    );
    expect(state.runtimeTier).toBe("reduced");
    state = applySnapshots(state, jankSnapshots(0.01, 1));
    expect(state.runtimeTier).toBe("standard");
    expect(state.lastUpgradeReason).toBe("recovery-upgrade");
  });

  test("ceiling is respected during recovery", () => {
    let state = createGovernorState(
      capabilitiesFixture({ lowRamDevice: true }),
    );
    state = applySnapshots(
      state,
      jankSnapshots(0.01, MOTION_RECOVERY_WINDOWS, { lowRamDevice: true }),
    );
    expect(state.effectiveCeiling).toBe("reduced");
    expect(state.runtimeTier).toBe("reduced");
  });
});

describe("thermal", () => {
  test("maps every thermal enum to a ceiling", () => {
    const cases: [
      NonNullable<Parameters<typeof snapshotFixture>[0]>["thermalState"],
      string,
    ][] = [
      ["nominal", "full"],
      ["fair", "standard"],
      ["light", "standard"],
      ["moderate", "standard"],
      ["serious", "reduced"],
      ["severe", "minimal"],
      ["critical", "minimal"],
      ["emergency", "minimal"],
      ["shutdown", "minimal"],
      ["unknown", "full"],
    ];
    for (const [thermalState, expected] of cases) {
      let state = createGovernorState(capabilitiesFixture());
      state = { ...state, runtimeTier: "full" };
      state = reduceMotionState(state, {
        type: "snapshot",
        snapshot: snapshotFixture({ thermalState }),
        accessibility: a11y,
      });
      expect(state.runtimeTier).toBe(expected);
    }
  });

  test("critical thermal is immediate", () => {
    let state = createGovernorState(capabilitiesFixture());
    state = { ...state, runtimeTier: "full" };
    state = reduceMotionState(state, {
      type: "snapshot",
      snapshot: snapshotFixture({ thermalState: "critical" }),
      accessibility: a11y,
    });
    expect(state.runtimeTier).toBe("minimal");
    expect(state.lastDowngradeReason).toBe("thermal-critical");
  });
});

describe("power mode", () => {
  test("low power caps expensive effects at standard", () => {
    let state = createGovernorState(capabilitiesFixture());
    state = { ...state, runtimeTier: "full" };
    state = reduceMotionState(state, {
      type: "snapshot",
      snapshot: snapshotFixture({ lowPowerMode: true }),
      accessibility: a11y,
    });
    expect(state.effectiveCeiling).toBe("standard");
    expect(state.runtimeTier).toBe("standard");
  });

  test("disabling low power does not instantly skip recovery hysteresis", () => {
    let state = createGovernorState(capabilitiesFixture());
    state = applySnapshots(
      state,
      jankSnapshots(0.22, MOTION_DOWNGRADE_WINDOWS, { lowPowerMode: true }),
    );
    expect(state.runtimeTier).toBe("reduced");
    state = applySnapshots(
      state,
      jankSnapshots(0.22, 2, { lowPowerMode: false }),
    );
    expect(state.runtimeTier).toBe("reduced");
  });
});

describe("accessibility", () => {
  test("reduce motion overrides full", () => {
    let state = createGovernorState(capabilitiesFixture());
    state = { ...state, runtimeTier: "full" };
    state = reduceMotionState(state, {
      type: "accessibility",
      accessibility: accessibilityFixture({ reduceMotion: true }),
    });
    expect(state.runtimeTier).toBe("minimal");
  });

  test("reduce motion remains after performance improves", () => {
    let state = createGovernorState(capabilitiesFixture());
    const reduced = accessibilityFixture({ reduceMotion: true });
    state = reduceMotionState(state, {
      type: "accessibility",
      accessibility: reduced,
    });
    state = applySnapshots(
      state,
      jankSnapshots(0.0, MOTION_RECOVERY_WINDOWS),
      reduced,
    );
    expect(state.runtimeTier).toBe("minimal");
    expect(state.effectiveCeiling).toBe("minimal");
  });
});

describe("warmup and empty samples", () => {
  test("warmup frames do not degrade", () => {
    let state = createGovernorState(capabilitiesFixture());
    state = { ...state, runtimeTier: "full" };
    state = reduceMotionState(state, {
      type: "snapshot",
      snapshot: snapshotFixture({
        warmUpActive: true,
        frames: { frameCount: 40, jankCount: 40, jankRatio: 1 },
      }),
      accessibility: a11y,
    });
    expect(state.runtimeTier).toBe("full");
  });

  test("empty frame samples are ignored", () => {
    let state = createGovernorState(capabilitiesFixture());
    state = { ...state, runtimeTier: "full" };
    state = reduceMotionState(state, {
      type: "snapshot",
      snapshot: snapshotFixture({
        frames: { frameCount: 0, jankCount: 0, jankRatio: null },
      }),
      accessibility: a11y,
    });
    expect(state.runtimeTier).toBe("full");
  });
});

describe("iOS cadence is not jank", () => {
  test("120 Hz capability at a healthy 60 Hz cadence does not downgrade", () => {
    let state = createGovernorState(
      capabilitiesFixture({
        platform: "ios",
        maximumRefreshRateHz: 120,
      }),
    );
    state = { ...state, runtimeTier: "full" };
    state = applySnapshots(
      state,
      Array.from({ length: MOTION_DOWNGRADE_WINDOWS + 2 }, (_, index) =>
        snapshotFixture({
          platform: "ios",
          currentRefreshRateHz: 60,
          maximumRefreshRateHz: 120,
          thermalState: "nominal",
          lowPowerMode: false,
          memoryPressureActive: false,
          lowMemory: false,
          timestampMs: 2_000 + index * 750,
          frames: {
            frameCount: 45,
            jankCount: 0,
            jankRatio: null,
            cadenceIntervalMs: 1000 / 60,
            callbackDelayP95Ms: 0.4,
            frameOverrunP95Ms: null,
          },
        }),
      ),
    );
    expect(state.runtimeTier).toBe("full");
    expect(state.lastDowngradeReason).toBeNull();
    expect(state.effectiveCeiling).toBe("full");
  });

  test("null jankRatio never manufactures a jank downgrade", () => {
    let state = createGovernorState(
      capabilitiesFixture({ platform: "ios", maximumRefreshRateHz: 120 }),
    );
    state = { ...state, runtimeTier: "full" };
    state = applySnapshots(
      state,
      jankSnapshots(0.4, MOTION_DOWNGRADE_WINDOWS).map((snapshot) => ({
        ...snapshot,
        platform: "ios" as const,
        currentRefreshRateHz: 80,
        maximumRefreshRateHz: 120,
        frames: {
          ...snapshot.frames,
          jankCount: 0,
          jankRatio: null,
          frameOverrunP95Ms: null,
        },
      })),
    );
    expect(state.runtimeTier).toBe("full");
  });
});

describe("memory pressure", () => {
  test("active memory pressure reduces expensive effects without going minimal", () => {
    let state = createGovernorState(capabilitiesFixture());
    state = { ...state, runtimeTier: "full" };
    state = reduceMotionState(state, {
      type: "snapshot",
      snapshot: snapshotFixture({
        memoryPressureActive: true,
        lowMemory: true,
      }),
      accessibility: a11y,
    });
    expect(state.effectiveCeiling).toBe("reduced");
    expect(state.runtimeTier).toBe("reduced");
    const profile = profileFromState(state);
    expect(profile.budget.allowLiveBlur).toBe(false);
    expect(profile.budget.allowComplexOrb).toBe(false);
    expect(profile.budget.maxSecondaryAnimations).toBeGreaterThan(0);
  });

  test("memory pressure expiry recovers through hysteresis", () => {
    let state = createGovernorState(capabilitiesFixture());
    state = { ...state, runtimeTier: "full" };
    state = reduceMotionState(state, {
      type: "snapshot",
      snapshot: snapshotFixture({
        memoryPressureActive: true,
        lowMemory: true,
      }),
      accessibility: a11y,
    });
    expect(state.runtimeTier).toBe("reduced");
    state = applySnapshots(
      state,
      jankSnapshots(0.01, MOTION_RECOVERY_WINDOWS - 1, {
        memoryPressureActive: false,
        lowMemory: false,
      }),
    );
    expect(state.effectiveCeiling).toBe("full");
    expect(state.runtimeTier).toBe("reduced");
    state = applySnapshots(
      state,
      jankSnapshots(0.01, 1, {
        memoryPressureActive: false,
        lowMemory: false,
      }),
    );
    expect(state.runtimeTier).toBe("standard");
    expect(state.lastUpgradeReason).toBe("recovery-upgrade");
  });
});

describe("profile identity", () => {
  test("telemetry-only snapshot extras do not change the published profile", () => {
    const state = createGovernorState(capabilitiesFixture());
    const first = profileFromState(state);
    const second = profileFromState({
      ...state,
      lastSnapshot: snapshotFixture({
        currentRefreshRateHz: 60,
        timestampMs: 9_999,
        frames: { jankRatio: null, cadenceIntervalMs: 16.67 },
      }),
    });
    expect(profilesEqual(first, second)).toBe(true);
  });
});

describe("profile budget", () => {
  test("minimal disables live blur and complex orb", () => {
    const profile = profileFromState({
      ...createGovernorState(capabilitiesFixture()),
      runtimeTier: "minimal",
    });
    expect(profile.budget.allowLiveBlur).toBe(false);
    expect(profile.budget.allowComplexOrb).toBe(false);
    expect(profile.budget.maxSecondaryAnimations).toBe(0);
  });
});
