import type { SqlDatabase } from "@/db/types";
import {
  SyncOutboxRepository,
  type SyncScope,
} from "@/db/repositories/syncOutboxRepository";
import type { AetherSyncChange } from "@/services/cloud/syncTypes";
import {
  SYNC_RECURRENCE_ENTITY_PREFIX,
  fromSyncCapturePayload,
  fromSyncPreferencesPayload,
  fromSyncRecurrencePayload,
  fromSyncReminderPayload,
  fromSyncTaskPayload,
  recurrenceRuleIdFromSyncEntityId,
  SyncPayloadError,
  type SyncCapturePayload,
  type SyncRecurrencePayload,
  type SyncReminderPayload,
  type SyncTaskPayload,
} from "./mappers";
import type { PersistedSettings } from "@/stores/settingsPersistence";

export const DEFAULT_SYNC_PREFERENCES: PersistedSettings = {
  theme: "system",
  materialColorsEnabled: false,
  hapticsEnabled: true,
  autoSummarize: true,
  adaptiveNudgesEnabled: false,
};

export type SyncReconcileResult = {
  appliedChanges: number;
  skippedChanges: number;
  conflictCount: number;
  preference: PersistedSettings | null;
  preferencesDeleted: boolean;
};

export class SyncReconciler {
  constructor(
    private readonly db: SqlDatabase,
    private readonly sync: SyncOutboxRepository,
  ) {}

  /**
   * Apply a complete server page and advance its cursor in one SQLite
   * transaction. Any mapper or foreign-key failure aborts both operations.
   */
  async applyPage(
    scope: SyncScope,
    changes: readonly AetherSyncChange[],
    nextCursor: string | null,
  ): Promise<SyncReconcileResult> {
    const result: SyncReconcileResult = {
      appliedChanges: 0,
      skippedChanges: 0,
      conflictCount: 0,
      preference: null,
      preferencesDeleted: false,
    };
    await this.db.withTransactionAsync(async () => {
      for (const change of changes) {
        const state = await this.sync.getScopedEntityStateInTransaction(
          scope,
          change.collection,
          change.entityId,
        );
        if (state && change.version <= state.version) {
          result.skippedChanges += 1;
          continue;
        }

        const otherAccountState =
          await this.sync.getOtherAccountEntityStateInTransaction(
            scope,
            change.collection,
            change.entityId,
          );
        if (state?.ownershipBlocked || otherAccountState) {
          // Domain rows remain device-global in this phase. Never let a
          // same-ID entity from another account overwrite or delete an
          // existing local row. Keep the remote version accounted for so the
          // cursor can advance without replaying the collision forever.
          await this.sync.upsertEntityStateInTransaction({
            accountId: scope.accountId,
            collection: change.collection,
            entityId: change.entityId,
            version: change.version,
            tombstone: change.tombstone,
            ownershipBlocked: true,
          });
          result.skippedChanges += 1;
          continue;
        }

        if (
          await this.sync.hasOpenMutationInTransaction(
            scope,
            change.collection,
            change.entityId,
          )
        ) {
          await this.sync.recordRemoteConflictInTransaction({
            scope,
            collection: change.collection,
            entityId: change.entityId,
            version: change.version,
            payload: change.payload,
            tombstone: change.tombstone,
          });
          result.conflictCount += 1;
          continue;
        }

        if (change.tombstone) {
          await this.applyTombstone(scope, change.collection, change.entityId);
          if (change.collection === "preferences") {
            result.preferencesDeleted = true;
            result.preference = null;
          }
        } else {
          const preference = await this.applyUpsert(
            scope,
            change.collection,
            change.entityId,
            change.payload,
          );
          if (preference) result.preference = preference;
        }
        await this.sync.upsertEntityStateInTransaction({
          accountId: scope.accountId,
          collection: change.collection,
          entityId: change.entityId,
          version: change.version,
          tombstone: change.tombstone,
        });
        result.appliedChanges += 1;
      }
      await this.sync.saveCursorInTransaction(scope, nextCursor);
    });
    return result;
  }

  private async applyUpsert(
    scope: SyncScope,
    collection: AetherSyncChange["collection"],
    entityId: string,
    payload: unknown,
  ): Promise<PersistedSettings | null> {
    switch (collection) {
      case "tasks":
        await this.applyTask(fromSyncTaskPayload(payload, entityId));
        return null;
      case "reminders":
        if (entityId.startsWith(SYNC_RECURRENCE_ENTITY_PREFIX)) {
          if (!recurrenceRuleIdFromSyncEntityId(entityId)) {
            throw new SyncPayloadError("Invalid recurrence entity id.");
          }
          await this.applyRecurrence(
            fromSyncRecurrencePayload(payload, entityId),
          );
        } else {
          await this.applyReminder(fromSyncReminderPayload(payload, entityId));
        }
        return null;
      case "captures":
        await this.applyCapture(fromSyncCapturePayload(payload, entityId));
        return null;
      case "preferences": {
        if (entityId !== "settings") {
          throw new SyncPayloadError("Unsupported preferences entity id.");
        }
        const preferences = fromSyncPreferencesPayload(payload);
        await this.sync.writePreferencesInTransaction(
          preferences,
          undefined,
          scope,
        );
        return preferences;
      }
    }
  }

  private async applyTombstone(
    scope: SyncScope,
    collection: AetherSyncChange["collection"],
    entityId: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    switch (collection) {
      case "tasks": {
        await this.db.runAsync(
          `UPDATE tasks SET deleted_at = COALESCE(deleted_at, ?), updated_at = ?
           WHERE id = ?`,
          [now, now, entityId],
        );
        await this.db.runAsync(
          `UPDATE reminders
           SET projection_dirty = 1, projection_state = 'stale',
               projection_revision = projection_revision + 1, updated_at = ?
           WHERE task_id = ?`,
          [now, entityId],
        );
        return;
      }
      case "reminders":
        {
          if (entityId.startsWith(SYNC_RECURRENCE_ENTITY_PREFIX)) {
            const recurrenceId = recurrenceRuleIdFromSyncEntityId(entityId);
            if (!recurrenceId) {
              throw new SyncPayloadError("Invalid recurrence entity id.");
            }
            await this.db.runAsync(
              "DELETE FROM recurrence_rules WHERE id = ?",
              [recurrenceId],
            );
            return;
          }
          await this.db.runAsync(
            `UPDATE reminders SET
               enabled = 0, cancelled_at = COALESCE(cancelled_at, ?),
               projection_dirty = 1, projection_state = 'stale',
               projection_revision = projection_revision + 1, updated_at = ?
             WHERE id = ? AND kind = 'primary'`,
            [now, now, entityId],
          );
        }
        return;
      case "captures": {
        const capture = await this.db.getFirstAsync<{ task_id: string }>(
          "SELECT task_id FROM capture_commits WHERE capture_id = ?",
          [entityId],
        );
        await this.db.runAsync(
          "DELETE FROM capture_commits WHERE capture_id = ?",
          [entityId],
        );
        if (capture) {
          await this.db.runAsync(
            "DELETE FROM task_capture_sources WHERE task_id = ?",
            [capture.task_id],
          );
        }
        return;
      }
      case "preferences":
        if (entityId !== "settings") {
          throw new SyncPayloadError("Unsupported preferences entity id.");
        }
        await this.db.runAsync(
          `DELETE FROM sync_preferences
           WHERE account_id = ? AND device_id = ? AND id = 'settings'`,
          [scope.accountId, scope.deviceId],
        );
        return;
    }
  }

  private async applyTask(payload: SyncTaskPayload): Promise<void> {
    const existing = await this.db.getFirstAsync<{ project_id: string | null }>(
      "SELECT project_id FROM tasks WHERE id = ?",
      [payload.id],
    );
    const project = payload.projectId
      ? await this.db.getFirstAsync<{ id: string }>(
          "SELECT id FROM projects WHERE id = ?",
          [payload.projectId],
        )
      : null;
    // Projects are local-only in Sync v1. Preserve an existing local
    // association when the referenced project is not present on this device;
    // an explicit null still clears the association.
    const projectId =
      payload.projectId === null
        ? null
        : (project?.id ?? existing?.project_id ?? null);
    const updated = await this.db.runAsync(
      `UPDATE tasks SET
         title = ?, notes = ?, completed = ?, priority = ?, project_id = ?,
         due_date = ?, due_time = ?, due_timezone = ?, due_semantics = ?,
         source = ?, creation_origin = ?, created_at = ?, updated_at = ?,
         completed_at = ?, deleted_at = NULL
       WHERE id = ?`,
      [
        payload.title,
        payload.notes,
        payload.completed ? 1 : 0,
        payload.priority,
        projectId,
        payload.dueDate,
        payload.dueTime,
        payload.dueTimezone,
        payload.dueSemantics,
        payload.source,
        payload.creationOrigin,
        payload.createdAt,
        payload.updatedAt,
        payload.completedAt,
        payload.id,
      ],
    );
    if (updated.changes === 0) {
      await this.db.runAsync(
        `INSERT INTO tasks (
          id, title, notes, completed, priority, project_id,
          due_date, due_time, due_timezone, due_semantics, source,
          creation_origin, created_at, updated_at, completed_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          payload.id,
          payload.title,
          payload.notes,
          payload.completed ? 1 : 0,
          payload.priority,
          projectId,
          payload.dueDate,
          payload.dueTime,
          payload.dueTimezone,
          payload.dueSemantics,
          payload.source,
          payload.creationOrigin,
          payload.createdAt,
          payload.updatedAt,
          payload.completedAt,
        ],
      );
    }
    await this.db.runAsync(
      `UPDATE reminders
       SET projection_dirty = 1, projection_state = 'stale',
           projection_revision = projection_revision + 1, updated_at = ?
       WHERE task_id = ?`,
      [new Date().toISOString(), payload.id],
    );
  }

  private async applyReminder(payload: SyncReminderPayload): Promise<void> {
    const task = await this.db.getFirstAsync<{ id: string }>(
      "SELECT id FROM tasks WHERE id = ?",
      [payload.taskId],
    );
    if (!task)
      throw new SyncPayloadError("Reminder references a missing task.");

    const updated = await this.db.runAsync(
      `UPDATE reminders SET
         task_id = ?, scheduled_date = ?, scheduled_time = ?, timezone = ?,
         semantics = ?, enabled = ?, timing_precision = ?, kind = 'primary',
         reason = ?, generation_source = ?, policy_version = ?,
         idempotency_key = ?, cancelled_at = NULL, consumed_at = NULL,
         projection_dirty = 1, projection_state = 'stale',
         projection_revision = projection_revision + 1, updated_at = ?
       WHERE id = ?`,
      [
        payload.taskId,
        payload.scheduledDate,
        payload.scheduledTime,
        payload.timezone,
        payload.semantics,
        payload.enabled ? 1 : 0,
        payload.timingPrecision,
        payload.reason,
        payload.generationSource,
        payload.policyVersion,
        payload.idempotencyKey,
        payload.updatedAt,
        payload.id,
      ],
    );
    if (updated.changes !== 0) return;
    await this.db.runAsync(
      `INSERT INTO reminders (
        id, task_id, scheduled_date, scheduled_time, timezone, semantics, enabled,
        timing_precision, kind, reason, generation_source, policy_version,
        idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.id,
        payload.taskId,
        payload.scheduledDate,
        payload.scheduledTime,
        payload.timezone,
        payload.semantics,
        payload.enabled ? 1 : 0,
        payload.timingPrecision,
        "primary",
        payload.reason,
        payload.generationSource,
        payload.policyVersion,
        payload.idempotencyKey,
        payload.createdAt,
        payload.updatedAt,
      ],
    );
  }

  private async applyRecurrence(payload: SyncRecurrencePayload): Promise<void> {
    const task = await this.db.getFirstAsync<{ id: string }>(
      "SELECT id FROM tasks WHERE id = ?",
      [payload.taskId],
    );
    if (!task)
      throw new SyncPayloadError("Recurrence references a missing task.");
    if (payload.lastCompletedTaskId) {
      const completedTask = await this.db.getFirstAsync<{ id: string }>(
        "SELECT id FROM tasks WHERE id = ?",
        [payload.lastCompletedTaskId],
      );
      if (!completedTask) {
        throw new SyncPayloadError(
          "Recurrence references a missing completed task.",
        );
      }
    }

    await this.db.runAsync(
      `INSERT INTO recurrence_rules (
        id, task_id, last_completed_task_id, frequency, interval,
        weekdays_json, month_days_json, start_date, end_date, max_occurrences,
        occurrence_count, mode, timezone, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        last_completed_task_id = excluded.last_completed_task_id,
        frequency = excluded.frequency,
        interval = excluded.interval,
        weekdays_json = excluded.weekdays_json,
        month_days_json = excluded.month_days_json,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        max_occurrences = excluded.max_occurrences,
        occurrence_count = excluded.occurrence_count,
        mode = excluded.mode,
        timezone = excluded.timezone,
        active = excluded.active,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at`,
      [
        payload.id,
        payload.taskId,
        payload.lastCompletedTaskId,
        payload.frequency,
        payload.interval,
        payload.weekdays ? JSON.stringify(payload.weekdays) : null,
        payload.monthDays ? JSON.stringify(payload.monthDays) : null,
        payload.startDate,
        payload.endDate,
        payload.maxOccurrences,
        payload.occurrenceCount,
        payload.mode,
        payload.timezone,
        payload.active ? 1 : 0,
        payload.createdAt,
        payload.updatedAt,
      ],
    );
  }

  private async applyCapture(payload: SyncCapturePayload): Promise<void> {
    const task = await this.db.getFirstAsync<{ id: string }>(
      "SELECT id FROM tasks WHERE id = ?",
      [payload.taskId],
    );
    if (!task) throw new SyncPayloadError("Capture references a missing task.");

    await this.db.runAsync(
      `INSERT INTO capture_commits
       (capture_id, task_id, ingress, committed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(capture_id) DO UPDATE SET
         task_id = excluded.task_id,
         ingress = excluded.ingress,
         committed_at = excluded.committed_at`,
      [payload.captureId, payload.taskId, payload.ingress, payload.committedAt],
    );
    const sourceIds = payload.sources.map((source) => source.id);
    if (sourceIds.length === 0) {
      await this.db.runAsync(
        "DELETE FROM task_capture_sources WHERE task_id = ?",
        [payload.taskId],
      );
    } else {
      await this.db.runAsync(
        `DELETE FROM task_capture_sources
         WHERE task_id = ? AND id NOT IN (${sourceIds.map(() => "?").join(", ")})`,
        [payload.taskId, ...sourceIds],
      );
    }
    for (const [position, source] of payload.sources.entries()) {
      const existingSource = await this.db.getFirstAsync<{
        task_id: string;
        kind: "url" | "image";
      }>("SELECT task_id, kind FROM task_capture_sources WHERE id = ?", [
        source.id,
      ]);
      if (
        existingSource &&
        (existingSource.task_id !== payload.taskId ||
          existingSource.kind !== source.kind)
      ) {
        throw new SyncPayloadError(
          `Capture source ${source.id} conflicts with local ownership.`,
        );
      }
      if (source.kind === "url") {
        await this.db.runAsync(
          `INSERT INTO task_capture_sources (
            id, task_id, position, kind, url, asset_ref, mime_type,
            size_bytes, display_name, created_at
          ) VALUES (?, ?, ?, 'url', ?, NULL, NULL, NULL, NULL, ?)
          ON CONFLICT(id) DO UPDATE SET
            task_id = excluded.task_id,
            position = excluded.position,
            kind = excluded.kind,
            url = excluded.url,
            asset_ref = excluded.asset_ref,
            mime_type = excluded.mime_type,
            size_bytes = excluded.size_bytes,
            display_name = excluded.display_name,
            created_at = excluded.created_at`,
          [source.id, payload.taskId, position, source.url, source.createdAt],
        );
      } else {
        if (existingSource) {
          // Asset references are host-private. Preserve an existing local
          // image reference while refreshing portable metadata and position.
          await this.db.runAsync(
            `UPDATE task_capture_sources SET
               position = ?, url = NULL, mime_type = ?, size_bytes = ?,
               display_name = ?, created_at = ?
             WHERE id = ?`,
            [
              position,
              source.mimeType,
              source.sizeBytes,
              source.displayName,
              source.createdAt,
              source.id,
            ],
          );
          continue;
        }
        // The local schema requires a device asset reference. Do not invent a
        // fake path for a remote image that this device cannot materialize.
        continue;
      }
    }
  }
}
