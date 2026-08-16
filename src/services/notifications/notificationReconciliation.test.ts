import { describe, expect, test } from "bun:test";
import { createBunSqliteDatabase } from "@/db/bunSqliteAdapter";
import { applyPragmas, runMigrations } from "@/db/migrator";
import { createRepositories } from "@/db/repositories";
import { NotificationError } from "./errors";
import {
  LocalNotificationProjection,
  type LocalNotificationAdapter,
} from "./localNotificationProjection";
import { NotificationReconciliationService } from "./notificationReconciliation";

async function ready() {
  const db = createBunSqliteDatabase();
  await applyPragmas(db);
  await runMigrations(db);
  const repos = createRepositories(db);
  return { db, repos };
}

describe("notification reconciliation", () => {
  test("incremental mode processes dirty reminders without scanning clean rows", async () => {
    const { db, repos } = await ready();
    const task = await repos.tasks.create({ title: "Incremental" });
    const dirty = await repos.reminders.create({
      taskId: task.id,
      scheduledDate: "2030-01-02",
      scheduledTime: "09:00",
    });
    const clean = await repos.reminders.create({
      taskId: task.id,
      scheduledDate: "2030-01-03",
      scheduledTime: "09:00",
    });
    await repos.reminders.setProjection(clean.id, "native-clean", null);
    const scheduled: string[] = [];
    const adapter: LocalNotificationAdapter = {
      list: async () => [],
      schedule: async ({ reminderId }) => {
        scheduled.push(reminderId);
        return `native-${reminderId}`;
      },
      cancel: async () => undefined,
    };
    const projection = new LocalNotificationProjection(
      repos.reminders,
      repos.tasks,
      adapter,
    );
    const service = new NotificationReconciliationService(
      repos.reminders,
      repos.tasks,
      projection,
      adapter,
      repos.appMeta,
    );

    const result = await service.reconcile({
      mode: "incremental",
      reason: "test",
    });

    expect(result.inspected).toBe(1);
    expect(result.dirtyProcessed).toBe(1);
    expect(result.scheduled).toBe(1);
    expect(scheduled).toEqual([dirty.id]);
    await db.closeAsync?.();
  });

  test("full mode removes orphan and duplicate native schedules", async () => {
    const { db, repos } = await ready();
    const task = await repos.tasks.create({ title: "Full repair" });
    const reminder = await repos.reminders.create({
      taskId: task.id,
      scheduledDate: "2030-01-02",
      scheduledTime: "09:00",
    });
    await repos.reminders.setProjection(reminder.id, "native-1", null);
    let native = [
      { identifier: "native-1", reminderId: reminder.id },
      { identifier: "native-duplicate", reminderId: reminder.id },
      { identifier: "native-orphan", reminderId: "missing" },
    ];
    const cancelled: string[] = [];
    const adapter: LocalNotificationAdapter = {
      list: async () => native,
      schedule: async () => {
        throw new Error("valid schedule must not be recreated");
      },
      cancel: async (identifier) => {
        cancelled.push(identifier);
        native = native.filter((item) => item.identifier !== identifier);
      },
    };
    const projection = new LocalNotificationProjection(
      repos.reminders,
      repos.tasks,
      adapter,
    );
    const service = new NotificationReconciliationService(
      repos.reminders,
      repos.tasks,
      projection,
      adapter,
      repos.appMeta,
    );

    const result = await service.reconcile({
      mode: "full",
      reason: "cold-start",
    });

    expect(result.orphanCancelled).toBe(1);
    expect(result.duplicateCancelled).toBe(1);
    expect(result.cancelled).toBe(2);
    expect(result.failed).toBe(0);
    expect(cancelled.sort()).toEqual(["native-duplicate", "native-orphan"]);
    await db.closeAsync?.();
  });

  test("continues after blocked native scheduling failure", async () => {
    const { db, repos } = await ready();
    const task = await repos.tasks.create({ title: "Partial repair" });
    const first = await repos.reminders.create({
      taskId: task.id,
      scheduledDate: "2030-01-02",
      scheduledTime: "09:00",
    });
    const second = await repos.reminders.create({
      taskId: task.id,
      scheduledDate: "2030-01-03",
      scheduledTime: "09:00",
    });
    const adapter: LocalNotificationAdapter = {
      list: async () => [],
      schedule: async ({ reminderId }) => {
        if (reminderId === first.id) {
          throw new NotificationError(
            "PERMISSION_DENIED",
            "Notifications are disabled.",
          );
        }
        return `native-${reminderId}`;
      },
      cancel: async () => undefined,
    };
    const projection = new LocalNotificationProjection(
      repos.reminders,
      repos.tasks,
      adapter,
    );
    const service = new NotificationReconciliationService(
      repos.reminders,
      repos.tasks,
      projection,
      adapter,
      repos.appMeta,
    );

    const result = await service.reconcile({
      mode: "incremental",
      reason: "test",
    });

    expect(result.scheduled).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.blocked).toBe(1);
    expect(result.failures[0]?.error.code).toBe("PERMISSION_DENIED");
    expect((await repos.reminders.getById(first.id))?.projectionState).toBe(
      "blocked",
    );
    expect((await repos.reminders.getById(second.id))?.projectionState).toBe(
      "scheduled",
    );
    await db.closeAsync?.();
  });
});
