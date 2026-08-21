import { createId } from "@/lib/id";
import type {
  Reminder,
  ReminderKind,
  ReminderProjectionState,
  ReminderTimingPrecision,
  TemporalSemantics,
} from "@/domain/entities";
import { DatabaseError } from "../errors";
import { mapReminderRow, type ReminderRow } from "../mappers";
import type { SqlDatabase } from "../types";
import { SyncOutboxRepository } from "./syncOutboxRepository";
import { toSyncReminderPayload } from "@/services/sync/mappers";

export interface CreateReminderInput {
  id?: string;
  taskId: string;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  timezone?: string | null;
  semantics?: TemporalSemantics;
  enabled?: boolean;
  timingPrecision?: ReminderTimingPrecision;
  kind?: ReminderKind;
  reason?: string | null;
  generationSource?: string | null;
  policyVersion?: string | null;
  idempotencyKey?: string | null;
}

export interface ProjectionFailureInput {
  code: string;
  message: string;
  state?: Extract<ReminderProjectionState, "failed" | "blocked" | "missing">;
}

export interface ProjectionCounts {
  dirty: number;
  failed: number;
  stale: number;
  missing: number;
  blocked: number;
  scheduled: number;
  notRequired: number;
}

export class RemindersRepository {
  constructor(
    private readonly db: SqlDatabase,
    private readonly sync?: SyncOutboxRepository,
  ) {}

  async getById(id: string): Promise<Reminder | null> {
    const row = await this.db.getFirstAsync<ReminderRow>(
      `SELECT * FROM reminders WHERE id = ?`,
      [id],
    );
    return row ? mapReminderRow(row) : null;
  }

  async listForTask(
    taskId: string,
    options?: { kind?: ReminderKind },
  ): Promise<Reminder[]> {
    const kindClause = options?.kind ? " AND kind = ?" : "";
    const rows = await this.db.getAllAsync<ReminderRow>(
      `SELECT * FROM reminders WHERE task_id = ?${kindClause}
       ORDER BY scheduled_date ASC, scheduled_time ASC, id ASC`,
      options?.kind ? [taskId, options.kind] : [taskId],
    );
    return rows.map(mapReminderRow);
  }

  async listEnabled(): Promise<Reminder[]> {
    const rows = await this.db.getAllAsync<ReminderRow>(
      `SELECT * FROM reminders WHERE enabled = 1 ORDER BY scheduled_date ASC, scheduled_time ASC`,
    );
    return rows.map(mapReminderRow);
  }

  async listAll(limit?: number): Promise<Reminder[]> {
    const rows =
      limit === undefined
        ? await this.db.getAllAsync<ReminderRow>(
            `SELECT * FROM reminders ORDER BY scheduled_date ASC, scheduled_time ASC`,
          )
        : await this.db.getAllAsync<ReminderRow>(
            `SELECT * FROM reminders ORDER BY scheduled_date ASC, scheduled_time ASC LIMIT ?`,
            [limit],
          );
    return rows.map(mapReminderRow);
  }

  async listDirty(limit = 100): Promise<Reminder[]> {
    const rows = await this.db.getAllAsync<ReminderRow>(
      `SELECT * FROM reminders
       WHERE projection_dirty = 1
       ORDER BY updated_at ASC, id ASC
       LIMIT ?`,
      [Math.max(1, Math.floor(limit))],
    );
    return rows.map(mapReminderRow);
  }

  async create(input: CreateReminderInput): Promise<Reminder> {
    if (!input.taskId) {
      throw new DatabaseError("VALIDATION_FAILED", "Reminder requires taskId.");
    }
    const id = input.id ?? createId();
    const now = new Date().toISOString();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `INSERT INTO reminders (
          id, task_id, scheduled_date, scheduled_time, timezone, semantics, enabled,
          timing_precision, kind, reason, generation_source, policy_version,
          idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.taskId,
          input.scheduledDate ?? null,
          input.scheduledTime ?? null,
          input.timezone ?? null,
          input.semantics ?? "floating",
          input.enabled === false ? 0 : 1,
          input.timingPrecision ?? "normal",
          input.kind ?? "primary",
          input.reason ?? null,
          input.generationSource ??
            (input.kind === "adaptive_followup"
              ? "adaptive_nudge_engine"
              : "manual"),
          input.policyVersion ??
            (input.kind === "adaptive_followup"
              ? "adaptive-v1"
              : "baseline-v1"),
          input.idempotencyKey ?? null,
          now,
          now,
        ],
      );
      const created = await this.getById(id);
      if (!created) {
        throw new DatabaseError(
          "QUERY_FAILED",
          "Reminder insert verification failed.",
        );
      }
      await this.enqueueSyncUpsertInTransaction(created);
    });
    const reminder = await this.getById(id);
    if (!reminder)
      throw new DatabaseError(
        "QUERY_FAILED",
        "Reminder insert verification failed.",
      );
    return reminder;
  }

  async setEnabled(id: string, enabled: boolean): Promise<Reminder> {
    const now = new Date().toISOString();
    const nextState = enabled
      ? `CASE WHEN projection_state = 'scheduled' THEN 'stale' ELSE 'pending' END`
      : `'stale'`;
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE reminders
         SET enabled = ?,
             cancelled_at = CASE WHEN ? = 1 AND kind = 'primary' THEN NULL ELSE cancelled_at END,
             consumed_at = CASE WHEN ? = 1 AND kind = 'primary' THEN NULL ELSE consumed_at END,
             projection_dirty = 1, projection_state = ${nextState},
             projection_revision = projection_revision + 1, updated_at = ?
         WHERE id = ?`,
        [enabled ? 1 : 0, enabled ? 1 : 0, enabled ? 1 : 0, now, id],
      );
      const updated = await this.getById(id);
      if (!updated) throw new DatabaseError("NOT_FOUND", "Reminder not found.");
      await this.enqueueSyncUpsertInTransaction(updated);
    });
    const reminder = await this.getById(id);
    if (!reminder) throw new DatabaseError("NOT_FOUND", "Reminder not found.");
    return reminder;
  }

  async updateSchedule(
    id: string,
    input: {
      scheduledDate?: string | null;
      scheduledTime?: string | null;
      timezone?: string | null;
      semantics?: TemporalSemantics;
      timingPrecision?: ReminderTimingPrecision;
    },
  ): Promise<Reminder> {
    const existing = await this.getById(id);
    if (!existing) throw new DatabaseError("NOT_FOUND", "Reminder not found.");

    const now = new Date().toISOString();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE reminders SET
          scheduled_date = ?, scheduled_time = ?, timezone = ?, semantics = ?,
          timing_precision = ?, projection_dirty = 1, projection_state = 'stale',
          projection_revision = projection_revision + 1, updated_at = ?
         WHERE id = ?`,
        [
          input.scheduledDate !== undefined
            ? input.scheduledDate
            : existing.scheduledDate,
          input.scheduledTime !== undefined
            ? input.scheduledTime
            : existing.scheduledTime,
          input.timezone !== undefined ? input.timezone : existing.timezone,
          input.semantics ?? existing.semantics,
          input.timingPrecision ?? existing.timingPrecision,
          now,
          id,
        ],
      );
      const updated = await this.getById(id);
      if (!updated) {
        throw new DatabaseError(
          "QUERY_FAILED",
          "Reminder update verification failed.",
        );
      }
      await this.enqueueSyncUpsertInTransaction(updated);
    });
    const reminder = await this.getById(id);
    if (!reminder)
      throw new DatabaseError(
        "QUERY_FAILED",
        "Reminder update verification failed.",
      );
    return reminder;
  }

  async listAdaptiveNudgesForTask(taskId: string): Promise<Reminder[]> {
    return this.listForTask(taskId, { kind: "adaptive_followup" });
  }

  /** Delete a reminder definition and record a v1 tombstone atomically. */
  async delete(id: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const existing = await this.getById(id);
      if (!existing)
        throw new DatabaseError("NOT_FOUND", "Reminder not found.");
      // Keep the row long enough for the notification projection to cancel
      // any native schedule. The Sync tombstone, not a hard delete, is the
      // durable deletion intent.
      const now = new Date().toISOString();
      await this.db.runAsync(
        `UPDATE reminders SET
           enabled = 0, cancelled_at = COALESCE(cancelled_at, ?),
           projection_dirty = 1, projection_state = 'stale',
           projection_revision = projection_revision + 1, updated_at = ?
         WHERE id = ?`,
        [now, now, id],
      );
      if ((existing.kind ?? "primary") === "primary" && this.sync) {
        await this.sync.enqueueMutationInTransaction({
          collection: "reminders",
          entityId: id,
          operation: "delete",
          payload: null,
          clientModifiedAt: new Date().toISOString(),
        });
      }
    });
  }

  async listAdaptiveNudges(limit?: number): Promise<Reminder[]> {
    const rows =
      limit === undefined
        ? await this.db.getAllAsync<ReminderRow>(
            `SELECT * FROM reminders
         WHERE kind = 'adaptive_followup'
         ORDER BY scheduled_date ASC, scheduled_time ASC, id ASC`,
          )
        : await this.db.getAllAsync<ReminderRow>(
            `SELECT * FROM reminders
         WHERE kind = 'adaptive_followup'
         ORDER BY scheduled_date ASC, scheduled_time ASC, id ASC
         LIMIT ?`,
            [Math.max(1, Math.floor(limit))],
          );
    return rows.map(mapReminderRow);
  }

  /** Active, unconsumed adaptive intents used as a bounded attention signal. */
  async listActiveAdaptiveNudges(limit = 32): Promise<Reminder[]> {
    const rows = await this.db.getAllAsync<ReminderRow>(
      `SELECT * FROM reminders
       WHERE kind = 'adaptive_followup'
         AND enabled = 1
         AND cancelled_at IS NULL
         AND consumed_at IS NULL
       ORDER BY scheduled_date ASC, scheduled_time ASC, id ASC
       LIMIT ?`,
      [Math.max(1, Math.floor(limit))],
    );
    return rows.map(mapReminderRow);
  }

  /** Count generated intents, including cancelled/consumed rows, for pressure budgets. */
  async countAdaptiveNudgesForDate(
    localDate: string,
    taskId?: string,
  ): Promise<number> {
    const row = await this.db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c
       FROM reminders
       WHERE kind = 'adaptive_followup'
         AND scheduled_date = ?${taskId ? " AND task_id = ?" : ""}`,
      taskId ? [localDate, taskId] : [localDate],
    );
    return row?.c ?? 0;
  }

  /** Idempotent desired-state write for one adaptive policy slot. */
  async upsertAdaptiveNudge(
    input: CreateReminderInput & {
      kind: "adaptive_followup";
      idempotencyKey: string;
      reason: string;
      generationSource?: string | null;
      policyVersion?: string | null;
    },
  ): Promise<Reminder> {
    const existingRow = await this.db.getFirstAsync<ReminderRow>(
      `SELECT * FROM reminders WHERE idempotency_key = ?`,
      [input.idempotencyKey],
    );
    if (existingRow) {
      const existing = mapReminderRow(existingRow);
      const now = new Date().toISOString();
      await this.db.runAsync(
        `UPDATE reminders SET
           task_id = ?, scheduled_date = ?, scheduled_time = ?, timezone = ?, semantics = ?,
           enabled = 1, reason = ?, generation_source = ?, policy_version = ?,
           cancelled_at = NULL, consumed_at = NULL,
           projection_dirty = 1,
           projection_state = CASE WHEN projection_state = 'scheduled' THEN 'stale' ELSE projection_state END,
           projection_revision = projection_revision + 1,
           updated_at = ?
         WHERE id = ?`,
        [
          input.taskId,
          input.scheduledDate ?? null,
          input.scheduledTime ?? null,
          input.timezone ?? null,
          input.semantics ?? existing.semantics,
          input.reason,
          input.generationSource ?? "adaptive_nudge_engine",
          input.policyVersion ?? "adaptive-v1",
          now,
          existing.id,
        ],
      );
      const refreshed = await this.getById(existing.id);
      if (!refreshed)
        throw new DatabaseError(
          "QUERY_FAILED",
          "Adaptive nudge update verification failed.",
        );
      return refreshed;
    }

    return this.create({
      ...input,
      kind: "adaptive_followup",
      generationSource: input.generationSource ?? "adaptive_nudge_engine",
      policyVersion: input.policyVersion ?? "adaptive-v1",
    });
  }

  async cancelAdaptiveNudgesForTask(taskId: string): Promise<number> {
    const now = new Date().toISOString();
    const result = await this.db.runAsync(
      `UPDATE reminders
       SET enabled = 0, cancelled_at = ?,
           projection_dirty = 1, projection_state = 'stale',
           projection_revision = projection_revision + 1, updated_at = ?
       WHERE task_id = ? AND kind = 'adaptive_followup' AND enabled = 1`,
      [now, now, taskId],
    );
    return result.changes;
  }

  async cancelAllAdaptiveNudges(): Promise<number> {
    const now = new Date().toISOString();
    const result = await this.db.runAsync(
      `UPDATE reminders
       SET enabled = 0, cancelled_at = ?,
           projection_dirty = 1, projection_state = 'stale',
           projection_revision = projection_revision + 1, updated_at = ?
       WHERE kind = 'adaptive_followup' AND enabled = 1`,
      [now, now],
    );
    return result.changes;
  }

  async cancelAdaptiveNudge(id: string): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db.runAsync(
      `UPDATE reminders
       SET enabled = 0, cancelled_at = ?,
           projection_dirty = 1, projection_state = 'stale',
           projection_revision = projection_revision + 1, updated_at = ?
       WHERE id = ? AND kind = 'adaptive_followup' AND enabled = 1`,
      [now, now, id],
    );
    return result.changes > 0;
  }

  async markAdaptiveNudgeConsumed(id: string): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db.runAsync(
      `UPDATE reminders
       SET enabled = 0, consumed_at = ?,
           projection_dirty = 1, projection_state = 'stale',
           projection_revision = projection_revision + 1, updated_at = ?
       WHERE id = ? AND kind = 'adaptive_followup'`,
      [now, now, id],
    );
    return result.changes > 0;
  }

  async markDirty(id: string): Promise<boolean> {
    const result = await this.db.runAsync(
      `UPDATE reminders
       SET projection_dirty = 1,
           projection_state = CASE
             WHEN projection_state IN ('scheduled', 'not_required') THEN 'stale'
             ELSE 'pending'
           END,
           projection_revision = projection_revision + 1,
           updated_at = ?
       WHERE id = ?`,
      [new Date().toISOString(), id],
    );
    return result.changes > 0;
  }

  async markTaskDirty(taskId: string): Promise<number> {
    const result = await this.db.runAsync(
      `UPDATE reminders
       SET projection_dirty = 1,
           projection_state = CASE
             WHEN projection_state IN ('scheduled', 'not_required') THEN 'stale'
             ELSE 'pending'
           END,
           projection_revision = projection_revision + 1,
           updated_at = ?
       WHERE task_id = ?`,
      [new Date().toISOString(), taskId],
    );
    return result.changes;
  }

  async recordProjectionAttempt(
    id: string,
    revision: number,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db.runAsync(
      `UPDATE reminders
       SET projection_attempt_count = projection_attempt_count + 1,
           projection_last_attempt_at = ?, updated_at = ?
       WHERE id = ? AND projection_revision = ? AND projection_dirty = 1`,
      [now, now, id, revision],
    );
    return result.changes > 0;
  }

  async recordProjectionSuccess(
    id: string,
    revision: number,
    nativeId: string | null,
    state: Extract<ReminderProjectionState, "scheduled" | "not_required">,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db.runAsync(
      `UPDATE reminders
       SET native_notification_id = ?, projection_state = ?, projection_dirty = 0,
           projection_error_code = NULL, projection_error = NULL,
           projection_last_success_at = ?, updated_at = ?
       WHERE id = ? AND projection_revision = ?`,
      [nativeId, state, now, now, id, revision],
    );
    return result.changes > 0;
  }

  async recordProjectionFailure(
    id: string,
    revision: number,
    failure: ProjectionFailureInput,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db.runAsync(
      `UPDATE reminders
       SET projection_state = ?, projection_dirty = 1,
           projection_error_code = ?, projection_error = ?, updated_at = ?
       WHERE id = ? AND projection_revision = ?`,
      [
        failure.state ?? "failed",
        failure.code,
        failure.message,
        now,
        id,
        revision,
      ],
    );
    return result.changes > 0;
  }

  async recordProjectionMissing(
    id: string,
    revision: number,
  ): Promise<boolean> {
    return this.recordProjectionFailure(id, revision, {
      code: "NATIVE_NOTIFICATION_MISSING",
      message: "The device notification is missing and will be repaired.",
      state: "missing",
    });
  }

  /** Compatibility helper for tests and existing callers that set projection metadata directly. */
  async setProjection(
    id: string,
    nativeId: string | null,
    error: string | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `UPDATE reminders
       SET native_notification_id = ?,
           projection_state = ?, projection_dirty = ?,
           projection_error_code = ?, projection_error = ?,
           projection_last_success_at = CASE WHEN ? IS NULL THEN projection_last_success_at ELSE ? END,
           updated_at = ?
       WHERE id = ?`,
      [
        nativeId,
        error ? "failed" : nativeId ? "scheduled" : "not_required",
        error ? 1 : 0,
        error ? "PROJECTION_FAILED" : null,
        error,
        nativeId,
        now,
        now,
        id,
      ],
    );
  }

  async countActive(): Promise<number> {
    const row = await this.db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c
       FROM reminders r
       INNER JOIN tasks t ON t.id = r.task_id
       WHERE r.enabled = 1 AND t.completed = 0 AND t.deleted_at IS NULL`,
    );
    return row?.c ?? 0;
  }

  async countProjectionStates(): Promise<ProjectionCounts> {
    const row = await this.db.getFirstAsync<{
      dirty: number;
      failed: number;
      stale: number;
      missing: number;
      blocked: number;
      scheduled: number;
      not_required: number;
    }>(
      `SELECT
         SUM(CASE WHEN projection_dirty = 1 THEN 1 ELSE 0 END) AS dirty,
         SUM(CASE WHEN projection_state = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN projection_state = 'stale' THEN 1 ELSE 0 END) AS stale,
         SUM(CASE WHEN projection_state = 'missing' THEN 1 ELSE 0 END) AS missing,
         SUM(CASE WHEN projection_state = 'blocked' THEN 1 ELSE 0 END) AS blocked,
         SUM(CASE WHEN projection_state = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
         SUM(CASE WHEN projection_state = 'not_required' THEN 1 ELSE 0 END) AS not_required
       FROM reminders`,
    );
    return {
      dirty: row?.dirty ?? 0,
      failed: row?.failed ?? 0,
      stale: row?.stale ?? 0,
      missing: row?.missing ?? 0,
      blocked: row?.blocked ?? 0,
      scheduled: row?.scheduled ?? 0,
      notRequired: row?.not_required ?? 0,
    };
  }

  /** Projection counts limited to reminders that can affect active work. */
  async countActiveProjectionStates(): Promise<ProjectionCounts> {
    const row = await this.db.getFirstAsync<{
      dirty: number;
      failed: number;
      stale: number;
      missing: number;
      blocked: number;
      scheduled: number;
      not_required: number;
    }>(
      `SELECT
         SUM(CASE WHEN r.projection_dirty = 1 THEN 1 ELSE 0 END) AS dirty,
         SUM(CASE WHEN r.projection_state = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN r.projection_state = 'stale' THEN 1 ELSE 0 END) AS stale,
         SUM(CASE WHEN r.projection_state = 'missing' THEN 1 ELSE 0 END) AS missing,
         SUM(CASE WHEN r.projection_state = 'blocked' THEN 1 ELSE 0 END) AS blocked,
         SUM(CASE WHEN r.projection_state = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
         SUM(CASE WHEN r.projection_state = 'not_required' THEN 1 ELSE 0 END) AS not_required
       FROM reminders r
       INNER JOIN tasks t ON t.id = r.task_id
       WHERE r.enabled = 1 AND t.completed = 0 AND t.deleted_at IS NULL`,
    );
    return {
      dirty: row?.dirty ?? 0,
      failed: row?.failed ?? 0,
      stale: row?.stale ?? 0,
      missing: row?.missing ?? 0,
      blocked: row?.blocked ?? 0,
      scheduled: row?.scheduled ?? 0,
      notRequired: row?.not_required ?? 0,
    };
  }

  private async enqueueSyncUpsertInTransaction(
    reminder: Reminder,
  ): Promise<void> {
    if (!this.sync) return;
    const payload = toSyncReminderPayload(reminder);
    if (!payload) return;
    await this.sync.enqueueMutationInTransaction({
      collection: "reminders",
      entityId: reminder.id,
      operation: "upsert",
      payload,
      clientModifiedAt: reminder.updatedAt,
    });
  }
}
