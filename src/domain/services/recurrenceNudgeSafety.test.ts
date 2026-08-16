import { describe, expect, test } from "bun:test";
import { createBunSqliteDatabase } from "@/db/bunSqliteAdapter";
import { applyPragmas, runMigrations } from "@/db/migrator";
import { createRepositories } from "@/db/repositories";
import { createDomainServices } from "./index";

describe("recurrence and adaptive nudge safety", () => {
  test("engine-generated nudges are not copied into the next occurrence", async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const repos = createRepositories(db);
    const services = createDomainServices(db);
    const created = await services.recurrence.createRecurringTask({
      task: {
        id: "recurrence-source",
        title: "Recurring task",
        dueDate: "2030-01-01",
        dueTime: "09:00",
      },
      recurrence: {
        id: "recurrence-nudge-rule",
        frequency: "daily",
        interval: 1,
        startDate: "2030-01-01",
      },
    });
    await repos.reminders.create({
      id: "primary-source",
      taskId: created.task.id,
      scheduledDate: "2030-01-01",
      scheduledTime: "09:00",
    });
    await repos.reminders.create({
      id: "adaptive-source",
      taskId: created.task.id,
      scheduledDate: "2030-01-01",
      scheduledTime: "09:20",
      kind: "adaptive_followup",
      reason: "baseline_followup",
      generationSource: "adaptive_nudge_engine",
      policyVersion: "adaptive-v1",
      idempotencyKey: "adaptive-source-slot",
    });
    const completed = await services.tasks.completeTask(created.task.id);
    const advanced = await services.recurrence.advanceAfterCompletion(
      completed.value,
    );
    expect(advanced).not.toBeNull();
    const nextReminders = await repos.reminders.listForTask(
      advanced!.nextTask.id,
    );
    expect(nextReminders).toHaveLength(1);
    expect(nextReminders[0]?.kind).toBe("primary");
    await db.closeAsync?.();
  });
});
