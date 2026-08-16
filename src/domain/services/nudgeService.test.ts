import { describe, expect, test } from "bun:test";
import { createBunSqliteDatabase } from "@/db/bunSqliteAdapter";
import { applyPragmas, runMigrations } from "@/db/migrator";
import { createRepositories } from "@/db/repositories";
import { createDomainServices } from "./index";
import { NUDGE_POLICY_VERSION } from "@/domain/nudges";

describe("NudgeService", () => {
  test("persists one idempotent nudge and preserves desired state when native projection fails", async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const repos = createRepositories(db);
    const services = createDomainServices(db);
    await services.nudges.setEnabled(true);
    const task = await repos.tasks.create({
      id: "nudge-task",
      title: "Private title",
      dueDate: "2030-01-02",
      dueTime: "09:00",
      dueSemantics: "floating",
    });
    const now = new Date("2030-01-02T08:00:00.000Z");

    const first = await services.nudges.replanTask(task.id, now);
    const second = await services.nudges.replanTask(task.id, now);
    const nudges = await repos.reminders.listAdaptiveNudgesForTask(task.id);
    expect(first.status).toBe("proposed");
    expect(second.reason).toBe("duplicate_pending_nudge");
    expect(nudges).toHaveLength(1);
    expect(nudges[0]?.policyVersion).toBe(NUDGE_POLICY_VERSION);
    expect(nudges[0]?.enabled).toBe(true);
    expect(nudges[0]?.projectionDirty).toBe(true);
    expect(nudges[0]?.projectionError).toBeTruthy();

    const completed = await repos.tasks.complete(task.id);
    await services.nudges.recordTaskCompleted(completed, "manual");
    const completedNudge = (
      await repos.reminders.listAdaptiveNudgesForTask(task.id)
    )[0];
    expect(completedNudge?.enabled).toBe(false);
    expect(completedNudge?.consumedAt).toBeTruthy();
    await db.closeAsync?.();
  });

  test("reset clears behavioral history without touching ordinary reminders", async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const repos = createRepositories(db);
    const services = createDomainServices(db);
    const task = await repos.tasks.create({
      id: "reset-task",
      title: "Keep task",
    });
    const primary = await repos.reminders.create({
      id: "ordinary-reminder",
      taskId: task.id,
      scheduledDate: "2030-01-02",
      scheduledTime: "09:00",
    });
    await services.nudges.setEnabled(true);
    await services.nudges.recordNotificationAction({
      reminder: { ...primary, kind: "adaptive_followup" },
      action: "snooze",
      responseKey: "reset-response",
      now: new Date("2030-01-01T12:00:00.000Z"),
      target: {
        scheduledDate: "2030-01-01",
        scheduledTime: "12:15",
        timezone: null,
        semantics: "floating",
      },
    });
    expect((await repos.nudgeEvents.count()).total).toBe(1);
    await services.nudges.resetLearning();
    expect((await repos.nudgeEvents.count()).total).toBe(0);
    expect(await repos.tasks.getById(task.id)).not.toBeNull();
    expect((await repos.reminders.getById(primary.id))?.kind).toBe("primary");
    await db.closeAsync?.();
  });

  test("rescheduling a task cancels its old nudge before replanning the new schedule", async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const repos = createRepositories(db);
    const services = createDomainServices(db);
    await services.nudges.setEnabled(true);
    const task = await repos.tasks.create({
      id: "reschedule-nudge-task",
      title: "Reschedule task",
      dueDate: "2030-01-02",
      dueTime: "09:00",
    });
    await services.nudges.replanTask(
      task.id,
      new Date("2030-01-02T08:00:00.000Z"),
    );
    const before = (
      await repos.reminders.listAdaptiveNudgesForTask(task.id)
    )[0];
    expect(before?.enabled).toBe(true);

    const updated = await repos.tasks.update(task.id, {
      dueDate: "2030-01-03",
      dueTime: "09:00",
    });
    await services.nudges.recordTaskRescheduled(updated);
    await services.nudges.replanTask(
      task.id,
      new Date("2030-01-02T08:00:00.000Z"),
    );
    const after = await repos.reminders.listAdaptiveNudgesForTask(task.id);
    expect(after.find((item) => item.id === before?.id)?.enabled).toBe(false);
    expect(
      after.some((item) => item.enabled && item.scheduledDate === "2030-01-03"),
    ).toBe(true);
    await db.closeAsync?.();
  });
});
