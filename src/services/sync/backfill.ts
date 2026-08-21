import {
  mapReminderRow,
  mapTaskRow,
  type ReminderRow,
  type TaskRow,
} from "@/db/mappers";
import { CaptureCommitsRepository } from "@/db/repositories/captureCommitsRepository";
import { RecurrenceRulesRepository } from "@/db/repositories/recurrenceRulesRepository";
import { SyncOutboxRepository } from "@/db/repositories/syncOutboxRepository";
import type { SqlDatabase } from "@/db/types";
import {
  toSyncCapturePayload,
  toSyncRecurrenceEntityId,
  toSyncRecurrencePayload,
  toSyncReminderPayload,
  toSyncTaskPayload,
} from "./mappers";

const CURRENT_BACKFILL_VERSION = 1;

export type SyncBackfillResult = {
  status: "applied" | "skipped";
  mutationCount: number;
};

/**
 * Convert pre-Sync local rows into durable protocol intents exactly once.
 * The marker and every intent share one SQLite transaction, so a crash cannot
 * leave a partially backfilled database marked complete.
 */
export async function backfillLocalSyncState(
  db: SqlDatabase,
): Promise<SyncBackfillResult> {
  const marker = await db.getFirstAsync<{ backfill_version: number }>(
    "SELECT backfill_version FROM sync_runtime WHERE id = 1",
  );
  if ((marker?.backfill_version ?? 0) >= CURRENT_BACKFILL_VERSION) {
    return { status: "skipped", mutationCount: 0 };
  }

  const sync = new SyncOutboxRepository(db);
  let mutationCount = 0;
  await db.withTransactionAsync(async () => {
    const tasks = await db.getAllAsync<TaskRow>(
      "SELECT * FROM tasks ORDER BY updated_at ASC, id ASC",
    );
    for (const row of tasks) {
      const task = mapTaskRow(row);
      await sync.enqueueMutationInTransaction({
        collection: "tasks",
        entityId: task.id,
        operation: task.deletedAt ? "delete" : "upsert",
        payload: task.deletedAt ? null : toSyncTaskPayload(task),
        clientModifiedAt: task.updatedAt,
      });
      mutationCount += 1;
    }

    const reminders = await db.getAllAsync<ReminderRow>(
      "SELECT * FROM reminders ORDER BY updated_at ASC, id ASC",
    );
    for (const row of reminders) {
      const reminder = mapReminderRow(row);
      const payload = toSyncReminderPayload(reminder);
      if (!payload) continue;
      await sync.enqueueMutationInTransaction({
        collection: "reminders",
        entityId: reminder.id,
        operation: "upsert",
        payload,
        clientModifiedAt: reminder.updatedAt,
      });
      mutationCount += 1;
    }

    const recurrenceRules = await new RecurrenceRulesRepository(db).listAll();
    for (const rule of recurrenceRules) {
      await sync.enqueueMutationInTransaction({
        collection: "reminders",
        entityId: toSyncRecurrenceEntityId(rule.id),
        operation: "upsert",
        payload: toSyncRecurrencePayload(rule),
        clientModifiedAt: rule.updatedAt,
      });
      mutationCount += 1;
    }

    const captures = new CaptureCommitsRepository(db);
    for (const capture of await captures.listAll()) {
      await sync.enqueueMutationInTransaction({
        collection: "captures",
        entityId: capture.captureId,
        operation: "upsert",
        payload: toSyncCapturePayload({
          ...capture,
          sources: await captures.listSources(capture.taskId),
        }),
        clientModifiedAt: capture.committedAt,
      });
      mutationCount += 1;
    }

    await db.runAsync(
      `UPDATE sync_runtime SET backfill_version = ?, updated_at = ? WHERE id = 1`,
      [CURRENT_BACKFILL_VERSION, new Date().toISOString()],
    );
  });

  return { status: "applied", mutationCount };
}
