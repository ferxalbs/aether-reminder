import { createId } from '@/lib/id';
import type {
  CreateRecurrenceRuleInput,
  RecurrenceFrequency,
  RecurrenceMode,
  RecurrenceRule,
  UpdateRecurrenceRuleInput,
} from '@/domain/entities';
import { DatabaseError } from '../errors';
import type { SqlDatabase } from '../types';

interface RecurrenceRuleRow {
  id: string;
  task_id: string;
  last_completed_task_id: string | null;
  frequency: string;
  interval: number;
  weekdays_json: string | null;
  month_days_json: string | null;
  start_date: string;
  end_date: string | null;
  max_occurrences: number | null;
  occurrence_count: number;
  mode: string;
  timezone: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

function parseNumberArray(value: string | null): number[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'number') ? parsed : null;
  } catch {
    return null;
  }
}

function mapRule(row: RecurrenceRuleRow): RecurrenceRule {
  return {
    id: row.id,
    taskId: row.task_id,
    frequency: row.frequency as RecurrenceFrequency,
    interval: row.interval,
    weekdays: parseNumberArray(row.weekdays_json),
    monthDays: parseNumberArray(row.month_days_json),
    startDate: row.start_date,
    endDate: row.end_date,
    maxOccurrences: row.max_occurrences,
    occurrenceCount: row.occurrence_count,
    mode: row.mode as RecurrenceMode,
    timezone: row.timezone,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeArray(value: number[] | null | undefined): string | null {
  return value && value.length > 0 ? JSON.stringify([...new Set(value)].sort((a, b) => a - b)) : null;
}

export class RecurrenceRulesRepository {
  constructor(private readonly db: SqlDatabase) {}

  async getById(id: string): Promise<RecurrenceRule | null> {
    const row = await this.db.getFirstAsync<RecurrenceRuleRow>(
      `SELECT * FROM recurrence_rules WHERE id = ?`,
      [id],
    );
    return row ? mapRule(row) : null;
  }

  async getActiveForTask(taskId: string): Promise<RecurrenceRule | null> {
    const row = await this.db.getFirstAsync<RecurrenceRuleRow>(
      `SELECT * FROM recurrence_rules WHERE task_id = ? AND active = 1 LIMIT 1`,
      [taskId],
    );
    return row ? mapRule(row) : null;
  }

  async getAdvancedFromTask(taskId: string): Promise<RecurrenceRule | null> {
    const row = await this.db.getFirstAsync<RecurrenceRuleRow>(
      `SELECT * FROM recurrence_rules WHERE last_completed_task_id = ? AND active = 1 LIMIT 1`,
      [taskId],
    );
    return row ? mapRule(row) : null;
  }

  async create(input: CreateRecurrenceRuleInput): Promise<RecurrenceRule> {
    if (!input.taskId || !input.startDate) {
      throw new DatabaseError('VALIDATION_FAILED', 'Recurrence requires taskId and startDate.');
    }
    const interval = Math.max(1, Math.floor(input.interval ?? 1));
    const id = input.id ?? createId();
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO recurrence_rules (
        id, task_id, last_completed_task_id, frequency, interval, weekdays_json, month_days_json,
        start_date, end_date, max_occurrences, occurrence_count, mode,
        timezone, active, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        id,
        input.taskId,
        input.frequency,
        interval,
        serializeArray(input.weekdays),
        serializeArray(input.monthDays),
        input.startDate,
        input.endDate ?? null,
        input.maxOccurrences ?? null,
        Math.max(1, Math.floor(input.occurrenceCount ?? 1)),
        input.mode ?? 'fixed',
        input.timezone ?? null,
        now,
        now,
      ],
    );
    const created = await this.getById(id);
    if (!created) throw new DatabaseError('QUERY_FAILED', 'Recurrence insert verification failed.');
    return created;
  }

  async update(id: string, input: UpdateRecurrenceRuleInput): Promise<RecurrenceRule> {
    const existing = await this.getById(id);
    if (!existing) throw new DatabaseError('NOT_FOUND', 'Recurrence rule not found.');
    const next = {
      frequency: input.frequency ?? existing.frequency,
      interval: input.interval === undefined ? existing.interval : Math.max(1, Math.floor(input.interval)),
      weekdays: input.weekdays === undefined ? existing.weekdays : input.weekdays,
      monthDays: input.monthDays === undefined ? existing.monthDays : input.monthDays,
      endDate: input.endDate === undefined ? existing.endDate : input.endDate,
      maxOccurrences: input.maxOccurrences === undefined ? existing.maxOccurrences : input.maxOccurrences,
      mode: input.mode ?? existing.mode,
      timezone: input.timezone === undefined ? existing.timezone : input.timezone,
    };
    await this.db.runAsync(
      `UPDATE recurrence_rules SET
        frequency = ?, interval = ?, weekdays_json = ?, month_days_json = ?,
        end_date = ?, max_occurrences = ?, mode = ?, timezone = ?, updated_at = ?
       WHERE id = ?`,
      [
        next.frequency,
        next.interval,
        serializeArray(next.weekdays),
        serializeArray(next.monthDays),
        next.endDate,
        next.maxOccurrences,
        next.mode,
        next.timezone,
        new Date().toISOString(),
        id,
      ],
    );
    const updated = await this.getById(id);
    if (!updated) throw new DatabaseError('QUERY_FAILED', 'Recurrence update verification failed.');
    return updated;
  }

  async stop(id: string): Promise<RecurrenceRule> {
    await this.db.runAsync(
      `UPDATE recurrence_rules SET active = 0, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id],
    );
    const rule = await this.getById(id);
    if (!rule) throw new DatabaseError('NOT_FOUND', 'Recurrence rule not found.');
    return rule;
  }

  async advance(
    id: string,
    previousTaskId: string,
    nextTaskId: string,
    expectedOccurrenceCount: number,
  ): Promise<boolean> {
    const result = await this.db.runAsync(
      `UPDATE recurrence_rules
       SET task_id = ?, last_completed_task_id = ?, occurrence_count = occurrence_count + 1, updated_at = ?
       WHERE id = ? AND active = 1 AND task_id = ? AND occurrence_count = ?`,
      [nextTaskId, previousTaskId, new Date().toISOString(), id, previousTaskId, expectedOccurrenceCount],
    );
    return result.changes === 1;
  }

  async rollbackAdvance(
    id: string,
    previousTaskId: string,
    currentTaskId: string,
    expectedOccurrenceCount: number,
  ): Promise<boolean> {
    const result = await this.db.runAsync(
      `UPDATE recurrence_rules
       SET task_id = ?, last_completed_task_id = NULL,
           occurrence_count = occurrence_count - 1, updated_at = ?
       WHERE id = ? AND active = 1 AND task_id = ?
         AND last_completed_task_id = ? AND occurrence_count = ?`,
      [previousTaskId, new Date().toISOString(), id, currentTaskId, previousTaskId, expectedOccurrenceCount],
    );
    return result.changes === 1;
  }
}
