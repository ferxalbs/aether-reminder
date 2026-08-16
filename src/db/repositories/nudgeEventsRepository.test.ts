import { describe, expect, test } from "bun:test";
import { createBunSqliteDatabase } from "@/db/bunSqliteAdapter";
import { applyPragmas, runMigrations } from "@/db/migrator";
import { createRepositories } from "./index";
import type { NudgeEvent } from "@/domain/nudges";

function event(overrides: Partial<NudgeEvent> = {}): NudgeEvent {
  return {
    id: "event-1",
    eventType: "notification_action_snooze",
    taskId: "task-1",
    nudgeId: null,
    occurredAt: "2030-01-01T12:00:00.000Z",
    localWeekday: 2,
    timeBucket: "afternoon",
    source: "adaptive_nudge_action",
    numericValue: 15,
    policyVersion: "adaptive-v1",
    dedupeKey: "native-1:AETHER_SNOOZE_10M",
    ...overrides,
  };
}

describe("NudgeEventsRepository", () => {
  test("deduplicates explicit responses and updates only local aggregates", async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const repos = createRepositories(db);
    await repos.tasks.create({ id: "task-1", title: "Local task" });
    await repos.reminders.create({
      id: "nudge-1",
      taskId: "task-1",
      scheduledDate: "2030-01-01",
      scheduledTime: "12:00",
      kind: "adaptive_followup",
      reason: "baseline_followup",
      generationSource: "adaptive_nudge_engine",
      policyVersion: "adaptive-v1",
      idempotencyKey: "nudge-event-test-slot",
    });

    expect(await repos.nudgeEvents.append(event())).toBe(true);
    expect(await repos.nudgeEvents.append(event({ id: "event-replay" }))).toBe(
      false,
    );
    const profile = await repos.nudgeEvents.getProfile();
    expect(profile.sampleCount).toBe(1);
    expect(profile.snoozeSamples).toBe(1);
    expect(profile.snoozeAverageMinutes).toBe(15);
    expect((await repos.nudgeEvents.count()).total).toBe(1);

    await repos.nudgeEvents.reset();
    expect((await repos.nudgeEvents.getProfile()).sampleCount).toBe(0);
    expect((await repos.nudgeEvents.count()).total).toBe(0);

    expect(
      await repos.nudgeEvents.append(
        event({
          id: "completion-event",
          eventType: "notification_action_complete",
          nudgeId: "nudge-1",
          source: "adaptive_nudge",
          numericValue: 30,
          secondaryNumericValue: 5,
          dedupeKey: "native-2:AETHER_COMPLETE",
        }),
      ),
    ).toBe(true);
    const completionProfile = await repos.nudgeEvents.getProfile();
    expect(completionProfile.completionDelayAverageMinutes).toBe(30);
    expect(completionProfile.adaptiveCompletionDelayAverageMinutes).toBe(5);
    expect(completionProfile.timingCompletions.afternoon).toBe(1);
    await db.closeAsync?.();
  });
});
