import { createId } from '@/lib/id';
import { getLocalDateString } from '@/temporal/localCalendar';
import type {
  CaptureSource,
  CreateTaskInput,
  Task,
  TemporalSemantics,
  UpdateTaskInput,
} from '@/domain/entities';
import { DatabaseError } from '../errors';
import { mapTaskRow, type TaskRow } from '../mappers';
import type { SqlDatabase } from '../types';
import { TaskEventsRepository } from './taskEventsRepository';

const ACTIVE = `deleted_at IS NULL`;

export interface ConditionalTaskScheduleChange {
  taskId: string;
  expectedUpdatedAt: string;
  dueDate: string;
  dueTime: string | null;
  dueTimezone: string | null;
  dueSemantics: TemporalSemantics;
  eventSource?: string;
}

export interface ConditionalTaskScheduleOutcome {
  taskId: string;
  applied: boolean;
  before: Task | null;
  after: Task | null;
  current: Task | null;
}

export interface CaptureCommitContext {
  captureId: string;
  ingress: string;
  sources: readonly CaptureSource[];
}

function sameSchedule(
  task: Task,
  change: ConditionalTaskScheduleChange,
): boolean {
  return task.dueDate === change.dueDate
    && task.dueTime === change.dueTime
    && task.dueTimezone === change.dueTimezone
    && task.dueSemantics === change.dueSemantics;
}

export class TasksRepository {
  private readonly events: TaskEventsRepository;

  constructor(private readonly db: SqlDatabase) {
    this.events = new TaskEventsRepository(db);
  }

  async getById(id: string, options?: { includeDeleted?: boolean }): Promise<Task | null> {
    const sql = options?.includeDeleted
      ? `SELECT * FROM tasks WHERE id = ?`
      : `SELECT * FROM tasks WHERE id = ? AND ${ACTIVE}`;
    const row = await this.db.getFirstAsync<TaskRow>(sql, [id]);
    return row ? mapTaskRow(row) : null;
  }

  /** Tasks due today (local calendar) or without a due date — active only. */
  async listToday(localDate: string = getLocalDateString()): Promise<Task[]> {
    const rows = await this.db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks
       WHERE ${ACTIVE}
         AND (due_date = ? OR due_date IS NULL)
       ORDER BY
         completed ASC,
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         created_at DESC`,
      [localDate]
    );
    return rows.map(mapTaskRow);
  }

  async listOverdue(localDate: string = getLocalDateString()): Promise<Task[]> {
    const rows = await this.db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks
       WHERE ${ACTIVE}
         AND completed = 0
         AND due_date IS NOT NULL
         AND due_date < ?
       ORDER BY due_date ASC,
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
      [localDate]
    );
    return rows.map(mapTaskRow);
  }

  /**
   * Candidate read for Smart Recovery. The due-date index bounds this to
   * overdue work plus a one-day timezone window; pure domain code filters the
   * result for the exact fixed/floating wall-clock eligibility.
   */
  async listRecoveryCandidates(throughDate: string): Promise<Task[]> {
    const rows = await this.db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks
       WHERE ${ACTIVE}
         AND completed = 0
         AND due_date IS NOT NULL
         AND due_date <= ?
       ORDER BY due_date ASC,
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         due_time ASC,
         id ASC`,
      [throughDate]
    );
    return rows.map(mapTaskRow);
  }

  /** Indexed bounded read for Adaptive Nudge planning. The optional lower
   * bound keeps meaningfully overdue work in Smart Recovery's lane; the pure
   * planner still applies timezone-aware timing and handoff rules. */
  async listNudgeCandidates(throughDate: string, limit = 100, fromDate?: string): Promise<Task[]> {
    const lowerBound = fromDate ? ' AND due_date >= ?' : '';
    const rows = await this.db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks
       WHERE ${ACTIVE}
         AND completed = 0
         AND due_date IS NOT NULL
         ${lowerBound}
         AND due_date <= ?
       ORDER BY due_date ASC,
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         due_time ASC,
         id ASC
       LIMIT ?`,
      fromDate
        ? [fromDate, throughDate, Math.max(1, Math.floor(limit))]
        : [throughDate, Math.max(1, Math.floor(limit))],
    );
    return rows.map(mapTaskRow);
  }

  /**
   * Bounded read for the NOW/NEXT attention planner. The query gathers only
   * the current temporal window, active adaptive-nudge tasks, and any
   * explicitly focused task. Ranking remains pure domain logic.
   */
  async listAttentionCandidates(options: {
    fromDate: string;
    throughDate: string;
    explicitTaskIds?: readonly string[];
    limit?: number;
  }): Promise<Task[]> {
    const explicitTaskIds = [...new Set(options.explicitTaskIds ?? [])].filter(Boolean);
    const explicitClause = explicitTaskIds.length > 0
      ? ` OR t.id IN (${explicitTaskIds.map(() => '?').join(', ')})`
      : '';
    const rows = await this.db.getAllAsync<TaskRow>(
      `SELECT DISTINCT t.* FROM tasks t
       LEFT JOIN reminders r
         ON r.task_id = t.id
        AND r.kind = 'adaptive_followup'
        AND r.enabled = 1
        AND r.cancelled_at IS NULL
        AND r.consumed_at IS NULL
       WHERE t.${ACTIVE}
         AND t.completed = 0
         AND (
           (t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ?)
           OR r.id IS NOT NULL${explicitClause}
         )
       ORDER BY
         CASE WHEN r.id IS NULL THEN 1 ELSE 0 END,
         CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
         t.due_date ASC,
         CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         t.due_time ASC,
         t.id ASC
       LIMIT ?`,
      [
        options.fromDate,
        options.throughDate,
        ...explicitTaskIds,
        Math.max(1, Math.floor(options.limit ?? 32)),
      ],
    );
    return rows.map(mapTaskRow);
  }

  async listUpcoming(localDate: string = getLocalDateString(), limit = 100): Promise<Task[]> {
    const rows = await this.db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks
       WHERE ${ACTIVE}
         AND completed = 0
         AND due_date IS NOT NULL
         AND due_date > ?
       ORDER BY due_date ASC,
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         created_at DESC,
         id ASC
       LIMIT ?`,
      [localDate, Math.max(1, Math.floor(limit))]
    );
    return rows.map(mapTaskRow);
  }

  /** Every non-deleted task for the All surface, including completed items. */
  async listAll(): Promise<Task[]> {
    const rows = await this.db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks
       WHERE ${ACTIVE}
       ORDER BY
         completed ASC,
         CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
         due_date ASC,
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         updated_at DESC,
         id ASC`,
    );
    return rows.map(mapTaskRow);
  }

  async listByProject(projectId: string): Promise<Task[]> {
    const rows = await this.db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks
       WHERE ${ACTIVE} AND project_id = ?
       ORDER BY completed ASC, updated_at DESC`,
      [projectId]
    );
    return rows.map(mapTaskRow);
  }

  async listByPriority(priority: Task['priority']): Promise<Task[]> {
    const rows = await this.db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks
       WHERE ${ACTIVE} AND priority = ?
       ORDER BY completed ASC, updated_at DESC`,
      [priority]
    );
    return rows.map(mapTaskRow);
  }

  /**
   * Active tasks for limited analytics/AI context — not a full dump by default.
   */
  async listActive(options?: { limit?: number; completed?: boolean }): Promise<Task[]> {
    const limit = options?.limit ?? 100;
    const completedClause =
      options?.completed === undefined ? '' : `AND completed = ${options.completed ? 1 : 0}`;
    const rows = await this.db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks
       WHERE ${ACTIVE} ${completedClause}
       ORDER BY updated_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows.map(mapTaskRow);
  }

  async search(query: string, limit = 50): Promise<Task[]> {
    const q = query.trim();
    if (!q) return [];
    const like = `%${q.replace(/%/g, '').replace(/_/g, '')}%`;
    const rows = await this.db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks
       WHERE ${ACTIVE}
         AND (title LIKE ? COLLATE NOCASE OR IFNULL(notes, '') LIKE ? COLLATE NOCASE)
       ORDER BY completed ASC, updated_at DESC
       LIMIT ?`,
      [like, like, limit]
    );
    return rows.map(mapTaskRow);
  }

  async create(
    input: CreateTaskInput,
    eventSource = 'manual',
    capture?: CaptureCommitContext,
  ): Promise<Task> {
    const title = input.title?.trim();
    if (!title) {
      throw new DatabaseError('VALIDATION_FAILED', 'Task title is required.');
    }

    const id = input.id ?? createId();
    const now = input.createdAt ?? new Date().toISOString();
    const updatedAt = input.updatedAt ?? now;
    const completed = input.completed ? 1 : 0;
    const completedAt = input.completedAt ?? (completed ? now : null);
    const priority = input.priority ?? 'medium';
    const dueDate = input.dueDate === undefined ? getLocalDateString() : input.dueDate;
    const source = input.source ?? 'manual';
    const creationOrigin = input.creationOrigin ?? source;

    try {
      await this.db.withTransactionAsync(async () => {
        await this.db.runAsync(
        `INSERT INTO tasks (
          id, title, notes, completed, priority, project_id,
          due_date, due_time, due_timezone, due_semantics,
          source, creation_origin, created_at, updated_at, completed_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          id,
          title,
          input.notes ?? null,
          completed,
          priority,
          input.projectId ?? null,
          dueDate,
          input.dueTime ?? null,
          input.dueTimezone ?? null,
          input.dueSemantics ?? 'floating',
          source,
          creationOrigin,
          now,
          updatedAt,
          completedAt,
        ]
      );

        await this.events.append({
          taskId: id,
          type: 'created',
          source: eventSource,
          payload: {
            title,
            priority,
            dueDate,
            source,
            creationOrigin,
            ...(capture ? { captureId: capture.captureId } : {}),
          },
          createdAt: now,
        });

        if (capture) {
          for (const [position, captureSource] of capture.sources.entries()) {
            await this.db.runAsync(
              `INSERT INTO task_capture_sources (
                id, task_id, position, kind, url, asset_ref, mime_type,
                size_bytes, display_name, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                createId(),
                id,
                position,
                captureSource.kind,
                captureSource.kind === 'url' ? captureSource.url : null,
                captureSource.kind === 'image' ? captureSource.assetRef : null,
                captureSource.kind === 'image' ? captureSource.mimeType : null,
                captureSource.kind === 'image' ? captureSource.sizeBytes ?? null : null,
                captureSource.kind === 'image' ? captureSource.displayName ?? null : null,
                now,
              ],
            );
          }
          await this.db.runAsync(
            `INSERT INTO capture_commits (capture_id, task_id, ingress, committed_at)
             VALUES (?, ?, ?, ?)`,
            [capture.captureId, id, capture.ingress, now],
          );
        }
      });
    } catch (cause) {
      // Competing/replayed callbacks converge on the unique capture marker.
      if (capture) {
        const existing = await this.db.getFirstAsync<{ task_id: string }>(
          'SELECT task_id FROM capture_commits WHERE capture_id = ?',
          [capture.captureId],
        );
        if (existing) {
          const task = await this.getById(existing.task_id);
          if (task) return task;
        }
      }
      throw cause;
    }

    const task = await this.getById(id);
    if (!task) throw new DatabaseError('QUERY_FAILED', 'Task insert verification failed.');
    return task;
  }

  async update(id: string, input: UpdateTaskInput, eventSource = 'manual'): Promise<Task> {
    const existing = await this.getById(id);
    if (!existing) throw new DatabaseError('NOT_FOUND', 'Task not found.');

    const next = {
      title: input.title !== undefined ? input.title.trim() : existing.title,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      priority: input.priority ?? existing.priority,
      projectId: input.projectId !== undefined ? input.projectId : existing.projectId,
      dueDate: input.dueDate !== undefined ? input.dueDate : existing.dueDate,
      dueTime: input.dueTime !== undefined ? input.dueTime : existing.dueTime,
      dueTimezone: input.dueTimezone !== undefined ? input.dueTimezone : existing.dueTimezone,
      dueSemantics: input.dueSemantics ?? existing.dueSemantics,
    };

    if (!next.title) {
      throw new DatabaseError('VALIDATION_FAILED', 'Task title is required.');
    }

    const now = new Date().toISOString();
    const rescheduled =
      next.dueDate !== existing.dueDate ||
      next.dueTime !== existing.dueTime ||
      next.dueTimezone !== existing.dueTimezone ||
      next.dueSemantics !== existing.dueSemantics;

    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE tasks SET
          title = ?, notes = ?, priority = ?, project_id = ?,
          due_date = ?, due_time = ?, due_timezone = ?, due_semantics = ?,
          updated_at = ?
         WHERE id = ? AND ${ACTIVE}`,
        [
          next.title,
          next.notes,
          next.priority,
          next.projectId,
          next.dueDate,
          next.dueTime,
          next.dueTimezone,
          next.dueSemantics,
          now,
          id,
        ]
      );

      await this.events.append({
        taskId: id,
        type: rescheduled ? 'rescheduled' : 'updated',
        source: eventSource,
        payload: {
          fields: Object.keys(input),
          dueDate: next.dueDate,
          dueTime: next.dueTime,
        },
        createdAt: now,
      });
    });

    const task = await this.getById(id);
    if (!task) throw new DatabaseError('QUERY_FAILED', 'Task update verification failed.');
    return task;
  }

  /**
   * Atomically applies conditional schedule-only mutations. Entries whose
   * task version no longer matches are returned without mutation, allowing a
   * batch command to skip stale proposals safely while valid entries commit
   * together with their task events.
   */
  async applyConditionalScheduleChanges(
    changes: readonly ConditionalTaskScheduleChange[],
  ): Promise<ConditionalTaskScheduleOutcome[]> {
    const outcomes: ConditionalTaskScheduleOutcome[] = [];
    await this.db.withTransactionAsync(async () => {
      for (const change of changes) {
        const currentRow = await this.db.getFirstAsync<TaskRow>(
          `SELECT * FROM tasks WHERE id = ?`,
          [change.taskId],
        );
        const current = currentRow ? mapTaskRow(currentRow) : null;
        if (
          !current ||
          current.deletedAt !== null ||
          current.completed ||
          current.updatedAt !== change.expectedUpdatedAt ||
          sameSchedule(current, change)
        ) {
          outcomes.push({
            taskId: change.taskId,
            applied: false,
            before: null,
            after: null,
            current,
          });
          continue;
        }

        const now = new Date().toISOString();
        const result = await this.db.runAsync(
          `UPDATE tasks SET
             due_date = ?, due_time = ?, due_timezone = ?, due_semantics = ?, updated_at = ?
           WHERE id = ? AND ${ACTIVE} AND completed = 0 AND updated_at = ?`,
          [
            change.dueDate,
            change.dueTime,
            change.dueTimezone,
            change.dueSemantics,
            now,
            change.taskId,
            change.expectedUpdatedAt,
          ],
        );
        if (result.changes !== 1) {
          const refreshedRow = await this.db.getFirstAsync<TaskRow>(
            `SELECT * FROM tasks WHERE id = ?`,
            [change.taskId],
          );
          outcomes.push({
            taskId: change.taskId,
            applied: false,
            before: null,
            after: null,
            current: refreshedRow ? mapTaskRow(refreshedRow) : null,
          });
          continue;
        }

        await this.events.append({
          taskId: change.taskId,
          type: 'rescheduled',
          source: change.eventSource ?? 'recovery',
          payload: {
            fields: ['dueDate', 'dueTime', 'dueTimezone', 'dueSemantics'],
            dueDate: change.dueDate,
            dueTime: change.dueTime,
          },
          createdAt: now,
        });

        const updatedRow = await this.db.getFirstAsync<TaskRow>(
          `SELECT * FROM tasks WHERE id = ?`,
          [change.taskId],
        );
        const after = updatedRow ? mapTaskRow(updatedRow) : null;
        if (!after) throw new DatabaseError('QUERY_FAILED', 'Recovery update verification failed.');
        outcomes.push({
          taskId: change.taskId,
          applied: true,
          before: current,
          after,
          current: after,
        });
      }
    });
    return outcomes;
  }

  async complete(id: string, eventSource = 'manual'): Promise<Task> {
    const existing = await this.getById(id);
    if (!existing) throw new DatabaseError('NOT_FOUND', 'Task not found.');
    if (existing.completed) return existing;

    const now = new Date().toISOString();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE tasks SET completed = 1, completed_at = ?, updated_at = ?
         WHERE id = ? AND ${ACTIVE}`,
        [now, now, id]
      );
      await this.events.append({
        taskId: id,
        type: 'completed',
        source: eventSource,
        payload: { completedAt: now },
        createdAt: now,
      });
    });

    const task = await this.getById(id);
    if (!task) throw new DatabaseError('QUERY_FAILED', 'Task complete verification failed.');
    return task;
  }

  async reopen(id: string, eventSource = 'manual'): Promise<Task> {
    const existing = await this.getById(id);
    if (!existing) throw new DatabaseError('NOT_FOUND', 'Task not found.');
    if (!existing.completed) return existing;

    const now = new Date().toISOString();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE tasks SET completed = 0, completed_at = NULL, updated_at = ?
         WHERE id = ? AND ${ACTIVE}`,
        [now, id]
      );
      await this.events.append({
        taskId: id,
        type: 'reopened',
        source: eventSource,
        payload: {},
        createdAt: now,
      });
    });

    const task = await this.getById(id);
    if (!task) throw new DatabaseError('QUERY_FAILED', 'Task reopen verification failed.');
    return task;
  }

  /** Soft delete — sets deleted_at; default queries exclude the row. */
  async softDelete(id: string, eventSource = 'manual'): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new DatabaseError('NOT_FOUND', 'Task not found.');

    const now = new Date().toISOString();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${ACTIVE}`,
        [now, now, id]
      );
      await this.events.append({
        taskId: id,
        type: 'deleted',
        source: eventSource,
        payload: { deletedAt: now },
        createdAt: now,
      });
    });
  }

  /** Restore a soft-deleted task without reconstructing it from UI state. */
  async restoreSoftDeleted(id: string, eventSource = 'manual'): Promise<Task> {
    const existing = await this.getById(id, { includeDeleted: true });
    if (!existing) throw new DatabaseError('NOT_FOUND', 'Task not found.');
    if (!existing.deletedAt) return existing;

    const now = new Date().toISOString();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?`,
        [now, id]
      );
      await this.events.append({
        taskId: id,
        type: 'updated',
        source: eventSource,
        payload: { restored: true },
        createdAt: now,
      });
    });

    const task = await this.getById(id);
    if (!task) throw new DatabaseError('QUERY_FAILED', 'Task restore verification failed.');
    return task;
  }

  async countActive(): Promise<number> {
    const row = await this.db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM tasks WHERE ${ACTIVE}`
    );
    return row?.c ?? 0;
  }
}
