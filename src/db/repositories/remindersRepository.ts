import { createId } from '@/lib/id';
import type { Reminder, TemporalSemantics } from '@/domain/entities';
import { DatabaseError } from '../errors';
import { mapReminderRow, type ReminderRow } from '../mappers';
import type { SqlDatabase } from '../types';

export interface CreateReminderInput {
  id?: string;
  taskId: string;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  timezone?: string | null;
  semantics?: TemporalSemantics;
  enabled?: boolean;
}

export class RemindersRepository {
  constructor(private readonly db: SqlDatabase) {}

  async getById(id: string): Promise<Reminder | null> {
    const row = await this.db.getFirstAsync<ReminderRow>(
      `SELECT * FROM reminders WHERE id = ?`,
      [id]
    );
    return row ? mapReminderRow(row) : null;
  }

  async listForTask(taskId: string): Promise<Reminder[]> {
    const rows = await this.db.getAllAsync<ReminderRow>(
      `SELECT * FROM reminders WHERE task_id = ? ORDER BY scheduled_date ASC, scheduled_time ASC`,
      [taskId]
    );
    return rows.map(mapReminderRow);
  }

  async listEnabled(): Promise<Reminder[]> {
    const rows = await this.db.getAllAsync<ReminderRow>(
      `SELECT * FROM reminders WHERE enabled = 1 ORDER BY scheduled_date ASC, scheduled_time ASC`
    );
    return rows.map(mapReminderRow);
  }

  async listAll(limit?: number): Promise<Reminder[]> {
    const rows = limit === undefined
      ? await this.db.getAllAsync<ReminderRow>(
        `SELECT * FROM reminders ORDER BY scheduled_date ASC, scheduled_time ASC`
      )
      : await this.db.getAllAsync<ReminderRow>(
        `SELECT * FROM reminders ORDER BY scheduled_date ASC, scheduled_time ASC LIMIT ?`,
        [limit]
      );
    return rows.map(mapReminderRow);
  }

  async create(input: CreateReminderInput): Promise<Reminder> {
    if (!input.taskId) {
      throw new DatabaseError('VALIDATION_FAILED', 'Reminder requires taskId.');
    }
    const id = input.id ?? createId();
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO reminders (
        id, task_id, scheduled_date, scheduled_time, timezone, semantics, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.taskId,
        input.scheduledDate ?? null,
        input.scheduledTime ?? null,
        input.timezone ?? null,
        input.semantics ?? 'floating',
        input.enabled === false ? 0 : 1,
        now,
        now,
      ]
    );
    const reminder = await this.getById(id);
    if (!reminder) throw new DatabaseError('QUERY_FAILED', 'Reminder insert verification failed.');
    return reminder;
  }

  async setEnabled(id: string, enabled: boolean): Promise<Reminder> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `UPDATE reminders SET enabled = ?, updated_at = ? WHERE id = ?`,
      [enabled ? 1 : 0, now, id]
    );
    const reminder = await this.getById(id);
    if (!reminder) throw new DatabaseError('NOT_FOUND', 'Reminder not found.');
    return reminder;
  }

  async updateSchedule(
    id: string,
    input: {
      scheduledDate?: string | null;
      scheduledTime?: string | null;
      timezone?: string | null;
      semantics?: TemporalSemantics;
    }
  ): Promise<Reminder> {
    const existing = await this.getById(id);
    if (!existing) throw new DatabaseError('NOT_FOUND', 'Reminder not found.');

    const now = new Date().toISOString();
    await this.db.runAsync(
      `UPDATE reminders SET
        scheduled_date = ?, scheduled_time = ?, timezone = ?, semantics = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.scheduledDate !== undefined ? input.scheduledDate : existing.scheduledDate,
        input.scheduledTime !== undefined ? input.scheduledTime : existing.scheduledTime,
        input.timezone !== undefined ? input.timezone : existing.timezone,
        input.semantics ?? existing.semantics,
        now,
        id,
      ]
    );
    const reminder = await this.getById(id);
    if (!reminder) throw new DatabaseError('QUERY_FAILED', 'Reminder update verification failed.');
    return reminder;
  }

  async setProjection(id: string, nativeId: string | null, error: string | null): Promise<void> {
    await this.db.runAsync(
      `UPDATE reminders SET native_notification_id = ?, projection_error = ?, updated_at = ? WHERE id = ?`,
      [nativeId, error, new Date().toISOString(), id]
    );
  }
}
