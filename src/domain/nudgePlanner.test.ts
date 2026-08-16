import { describe, expect, test } from "bun:test";
import type { Reminder, Task } from "./entities";
import { DEFAULT_NUDGE_PLANNER_SETTINGS, NudgePlanner } from "./nudgePlanner";
import {
  NUDGE_MINIMUM_SAMPLES,
  applyNudgeEvent,
  createEmptyNudgeProfile,
  type NudgeEvent,
  type NudgePlannerSettings,
} from "./nudges";

const now = new Date("2030-01-02T08:00:00.000Z");

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Private task title is not part of events",
    notes: null,
    completed: false,
    priority: "medium",
    projectId: null,
    dueDate: "2030-01-02",
    dueTime: "09:00",
    dueTimezone: null,
    dueSemantics: "floating",
    source: "manual",
    creationOrigin: "manual",
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
    completedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function plannerSettings(
  overrides: Partial<NudgePlannerSettings> = {},
): NudgePlannerSettings {
  return {
    ...DEFAULT_NUDGE_PLANNER_SETTINGS,
    enabled: true,
    deviceTimezone: "UTC",
    ...overrides,
  };
}

function state(
  overrides: Partial<Parameters<typeof NudgePlanner.plan>[1]> = {},
) {
  return {
    primaryReminder: null,
    adaptiveNudges: [],
    adaptiveNudgesToday: 0,
    globalAdaptiveNudgesToday: 0,
    lastAdaptiveNudgeAt: null,
    lastExplicitDeferralAt: null,
    ...overrides,
  };
}

function event(overrides: Partial<NudgeEvent> = {}): NudgeEvent {
  return {
    id: "event-1",
    eventType: "notification_action_snooze",
    taskId: "task-1",
    nudgeId: null,
    occurredAt: "2030-01-01T12:00:00.000Z",
    localWeekday: 2,
    timeBucket: "afternoon",
    source: "notification_action",
    numericValue: 12,
    policyVersion: "adaptive-v1",
    dedupeKey: null,
    ...overrides,
  };
}

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "nudge-1",
    taskId: "task-1",
    scheduledDate: "2030-01-02",
    scheduledTime: "09:20",
    timezone: null,
    semantics: "floating",
    enabled: true,
    nativeNotificationId: null,
    projectionState: "pending",
    projectionDirty: true,
    projectionRevision: 0,
    projectionAttemptCount: 0,
    projectionLastAttemptAt: null,
    projectionLastSuccessAt: null,
    projectionErrorCode: null,
    projectionError: null,
    timingPrecision: "flexible",
    kind: "adaptive_followup",
    reason: "baseline_followup",
    generationSource: "adaptive_nudge_engine",
    policyVersion: "adaptive-v1",
    idempotencyKey: "adaptive-slot",
    cancelledAt: null,
    consumedAt: null,
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("NudgePlanner", () => {
  test("does not plan while Adaptive Nudges are disabled", () => {
    const result = NudgePlanner.plan(
      task(),
      state(),
      createEmptyNudgeProfile(),
      plannerSettings({ enabled: false }),
      now,
    );
    expect(result.reason).toBe("adaptive_nudges_disabled");
  });

  test("uses a conservative baseline with insufficient evidence", () => {
    const result = NudgePlanner.plan(
      task(),
      state(),
      createEmptyNudgeProfile(),
      plannerSettings(),
      now,
    );
    expect(result.status).toBe("proposed");
    expect(result.reason).toBe("insufficient_learning_data");
    expect(result.proposal?.scheduledTime).toBe("09:20");
    expect(result.proposal?.presentationPolicy).toBe("gentle");
  });

  test("does not personalize before the minimum sample threshold", () => {
    let profile = createEmptyNudgeProfile();
    for (let index = 0; index < NUDGE_MINIMUM_SAMPLES - 1; index += 1) {
      profile = applyNudgeEvent(
        profile,
        event({ id: `event-${index}`, numericValue: 60 }),
      );
    }
    const result = NudgePlanner.plan(
      task(),
      state(),
      profile,
      plannerSettings(),
      now,
    );
    expect(profile.confidence).toBe("insufficient");
    expect(result.proposal?.scheduledTime).toBe("09:20");
  });

  test("learns an explicit snooze delay and clamps outliers", () => {
    let profile = createEmptyNudgeProfile();
    for (let index = 0; index < NUDGE_MINIMUM_SAMPLES; index += 1) {
      profile = applyNudgeEvent(
        profile,
        event({ id: `event-${index}`, numericValue: index === 0 ? 9999 : 12 }),
      );
    }
    expect(profile.snoozeAverageMinutes).toBeLessThanOrEqual(240);
    const result = NudgePlanner.plan(
      task(),
      state(),
      profile,
      plannerSettings(),
      now,
    );
    expect(result.reason).toBe("learned_snooze_delay");
    expect(result.proposal?.scheduledTime).toBe("09:25");
  });

  test("uses a preferred time bucket only after confident evidence", () => {
    let profile = createEmptyNudgeProfile();
    for (let index = 0; index < 10; index += 1) {
      profile = applyNudgeEvent(
        profile,
        event({
          id: `event-${index}`,
          eventType: "task_completed",
          nudgeId: "nudge-1",
          source: "adaptive_nudge",
          timeBucket: "evening",
          numericValue: 5,
        }),
      );
    }
    const result = NudgePlanner.plan(
      task(),
      state(),
      profile,
      plannerSettings(),
      now,
    );
    expect(profile.confidence).toBe("confident");
    expect(result.reason).toBe("preferred_time_window");
    expect(result.proposal?.scheduledTime).toBe("18:00");
  });

  test("suppresses completed, deleted, and duplicate tasks", () => {
    expect(
      NudgePlanner.plan(
        task({ completed: true }),
        state(),
        createEmptyNudgeProfile(),
        plannerSettings(),
        now,
      ).reason,
    ).toBe("suppressed_task_complete");
    expect(
      NudgePlanner.plan(
        task({ deletedAt: "2030-01-01T00:00:00.000Z" }),
        state(),
        createEmptyNudgeProfile(),
        plannerSettings(),
        now,
      ).reason,
    ).toBe("suppressed_task_deleted");
    expect(
      NudgePlanner.plan(
        task(),
        state({ adaptiveNudges: [reminder()] }),
        createEmptyNudgeProfile(),
        plannerSettings(),
        now,
      ).reason,
    ).toBe("duplicate_pending_nudge");
  });

  test("returns a non-error budget suppression and enforces cooldowns", () => {
    const profile = createEmptyNudgeProfile();
    expect(
      NudgePlanner.plan(
        task(),
        state({ adaptiveNudgesToday: 1 }),
        profile,
        plannerSettings(),
        now,
      ).status,
    ).toBe("suppressed_by_budget");
    expect(
      NudgePlanner.plan(
        task(),
        state({ globalAdaptiveNudgesToday: 3 }),
        profile,
        plannerSettings(),
        now,
      ).reason,
    ).toBe("suppressed_daily_budget");
    expect(
      NudgePlanner.plan(
        task(),
        state({ lastAdaptiveNudgeAt: "2030-01-02T07:00:00.000Z" }),
        profile,
        plannerSettings(),
        now,
      ).reason,
    ).toBe("cooldown");
    expect(
      NudgePlanner.plan(
        task(),
        state({ lastExplicitDeferralAt: "2030-01-02T07:00:00.000Z" }),
        profile,
        plannerSettings(),
        now,
      ).reason,
    ).toBe("explicit_deferral_cooldown");
  });

  test("hands meaningfully overdue tasks to Smart Recovery", () => {
    const result = NudgePlanner.plan(
      task({ dueTime: "08:00" }),
      state(),
      createEmptyNudgeProfile(),
      plannerSettings(),
      new Date("2030-01-02T08:31:00.000Z"),
    );
    expect(result.reason).toBe("delegated_to_smart_recovery");
  });

  test("preserves fixed versus floating temporal semantics", () => {
    const fixed = NudgePlanner.plan(
      task({ dueSemantics: "fixed", dueTimezone: "America/New_York" }),
      state(),
      createEmptyNudgeProfile(),
      plannerSettings({ deviceTimezone: "America/Los_Angeles" }),
      new Date("2030-01-02T13:00:00.000Z"),
    );
    const floating = NudgePlanner.plan(
      task(),
      state(),
      createEmptyNudgeProfile(),
      plannerSettings({ deviceTimezone: "America/Los_Angeles" }),
      new Date("2030-01-02T13:00:00.000Z"),
    );
    expect(fixed.proposal?.timezone).toBe("America/New_York");
    expect(floating.proposal?.timezone).toBeNull();
    expect(fixed.proposal?.scheduledTime).toBe("09:20");
    expect(floating.proposal?.scheduledTime).toBe("09:20");
  });

  test("keeps fixed plans stable while floating plans follow a timezone change", () => {
    const fixedTask = task({
      dueSemantics: "fixed",
      dueTimezone: "America/New_York",
    });
    const fixedLosAngeles = NudgePlanner.plan(
      fixedTask,
      state(),
      createEmptyNudgeProfile(),
      plannerSettings({ deviceTimezone: "America/Los_Angeles" }),
      new Date("2030-01-02T13:00:00.000Z"),
    );
    const fixedTokyo = NudgePlanner.plan(
      fixedTask,
      state(),
      createEmptyNudgeProfile(),
      plannerSettings({ deviceTimezone: "Asia/Tokyo" }),
      new Date("2030-01-02T13:00:00.000Z"),
    );
    const floatingTokyo = NudgePlanner.plan(
      task(),
      state(),
      createEmptyNudgeProfile(),
      plannerSettings({ deviceTimezone: "Asia/Tokyo" }),
      new Date("2030-01-02T13:00:00.000Z"),
    );
    expect(fixedLosAngeles.proposal?.scheduledDate).toBe(
      fixedTokyo.proposal?.scheduledDate,
    );
    expect(fixedLosAngeles.proposal?.scheduledTime).toBe(
      fixedTokyo.proposal?.scheduledTime,
    );
    expect(floatingTokyo.reason).toBe("delegated_to_smart_recovery");
  });

  test("uses local calendar semantics across midnight", () => {
    const result = NudgePlanner.plan(
      task({ dueDate: "2030-01-02", dueTime: "00:10" }),
      state(),
      createEmptyNudgeProfile(),
      plannerSettings({ deviceTimezone: "America/Los_Angeles" }),
      new Date("2030-01-02T07:55:00.000Z"),
    );
    expect(result.proposal?.scheduledDate).toBe("2030-01-02");
    expect(result.proposal?.scheduledTime).toBe("00:30");
  });

  test("date-only tasks get a flexible engine-owned opportunity without changing task time", () => {
    const result = NudgePlanner.plan(
      task({ dueTime: null }),
      state(),
      createEmptyNudgeProfile(),
      plannerSettings(),
      new Date("2030-01-02T08:00:00.000Z"),
    );
    expect(result.status).toBe("proposed");
    expect(result.proposal?.scheduledTime).toBe("18:00");
    expect(task({ dueTime: null }).dueTime).toBeNull();
  });
});
