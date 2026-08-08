import { createId } from '@/lib/id';
import { getLocalDateString } from '@/temporal/localCalendar';
import type { CreateTaskInput, Task, UpdateTaskInput } from '@/domain/entities';
import { DatabaseError } from '../errors';
import { mapTaskRow, type TaskRow } from '../mappers';
import type { SqlDatabase } from '../types';
import { TaskEventsRepository } from './taskEventsRepository';

const ACTIVE = `deleted_at IS NULL`;

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

  async listUpcoming(localDate: string = getLocalDateString(), limit = 100): Promise<Task[]> {
    const rows = await this.db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks
       WHERE ${ACTIVE}
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

  async create(input: CreateTaskInput, eventSource = 'manual'): Promise<Task> {
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
        },
        createdAt: now,
      });
    });

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
