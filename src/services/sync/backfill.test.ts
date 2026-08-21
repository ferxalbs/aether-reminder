import { describe, expect, test } from "bun:test";
import { createBunSqliteDatabase } from "@/db/bunSqliteAdapter";
import { applyPragmas, runMigrations } from "@/db/migrator";
import type { SqlDatabase } from "@/db/types";
import { backfillLocalSyncState } from "./backfill";
import { SyncOutboxRepository } from "@/db/repositories/syncOutboxRepository";

async function readyDb(): Promise<SqlDatabase> {
  const db = createBunSqliteDatabase();
  await applyPragmas(db);
  await runMigrations(db);
  return db;
}

describe("Sync v1 local backfill", () => {
  test("backfills existing task, reminder, recurrence, and capture rows once", async () => {
    const db = await readyDb();
    await db.runAsync(
      `INSERT INTO tasks (
        id, title, notes, completed, priority, project_id, due_date, due_time,
        due_timezone, due_semantics, source, creation_origin, created_at,
        updated_at, completed_at, deleted_at
      ) VALUES (?, ?, NULL, 0, 'medium', NULL, ?, NULL, NULL, 'floating',
        'manual', 'manual', ?, ?, NULL, NULL)`,
      [
        "backfill-task",
        "Existing task",
        "2030-01-01",
        "2030-01-01T00:00:00.000Z",
        "2030-01-02T00:00:00.000Z",
      ],
    );
    await db.runAsync(
      `INSERT INTO reminders (
        id, task_id, scheduled_date, scheduled_time, timezone, semantics,
        enabled, timing_precision, kind, generation_source, policy_version,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, 'floating', 1, 'normal', 'primary',
        'manual', 'baseline-v1', ?, ?)`,
      [
        "backfill-reminder",
        "backfill-task",
        "2030-01-01",
        "09:00",
        "2030-01-01T00:00:00.000Z",
        "2030-01-02T00:00:00.000Z",
      ],
    );
    await db.runAsync(
      `INSERT INTO recurrence_rules (
        id, task_id, frequency, interval, weekdays_json, start_date,
        occurrence_count, mode, active, created_at, updated_at
      ) VALUES (?, ?, 'daily', 1, NULL, ?, 1, 'fixed', 1, ?, ?)`,
      [
        "backfill-rule",
        "backfill-task",
        "2030-01-01",
        "2030-01-01T00:00:00.000Z",
        "2030-01-02T00:00:00.000Z",
      ],
    );
    await db.runAsync(
      `INSERT INTO capture_commits (capture_id, task_id, ingress, committed_at)
       VALUES (?, ?, 'share', ?)`,
      ["backfill-capture", "backfill-task", "2030-01-03T00:00:00.000Z"],
    );
    await db.runAsync(
      `INSERT INTO task_capture_sources (
        id, task_id, position, kind, url, created_at
      ) VALUES (?, ?, 0, 'url', ?, ?)`,
      [
        "backfill-source",
        "backfill-task",
        "https://example.com",
        "2030-01-03T00:00:00.000Z",
      ],
    );

    await expect(backfillLocalSyncState(db)).resolves.toEqual({
      status: "applied",
      mutationCount: 4,
    });
    await expect(backfillLocalSyncState(db)).resolves.toEqual({
      status: "skipped",
      mutationCount: 0,
    });

    const sync = new SyncOutboxRepository(db);
    expect(
      await db.getFirstAsync<{ c: number }>(
        "SELECT COUNT(*) AS c FROM sync_outbox",
      ),
    ).toEqual({ c: 4 });
    await sync.bindScope({ accountId: "account-a", deviceId: "device-a" });
    expect(
      (await sync.listPending({ accountId: "account-a", deviceId: "device-a" }))
        .length,
    ).toBe(4);
    await db.closeAsync?.();
  });
});
