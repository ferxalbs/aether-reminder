import { createId } from '@/lib/id';
import type { TaskEvent, TaskEventType } from '@/domain/entities';
import { mapTaskEventRow, type TaskEventRow } from '../mappers';
import type { SqlDatabase } from '../types';

export class TaskEventsRepository {
  constructor(private readonly db: SqlDatabase) {}

  async append(input: {
    taskId: string;
    type: TaskEventType;
    payload?: Record<string, unknown> | null;
    source?: string;
    id?: string;
    createdAt?: string;
  }): Promise<TaskEvent> {
    const id = input.id ?? createId();
    const createdAt = input.createdAt ?? new Date().toISOString();
    const payloadJson =
      input.payload && Object.keys(input.payload).length > 0
        ? JSON.stringify(input.payload)
        : null;

    await this.db.runAsync(
      `INSERT INTO task_events (id, task_id, type, payload_json, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.taskId, input.type, payloadJson, input.source ?? 'manual', createdAt]
    );

    const row = await this.db.getFirstAsync<TaskEventRow>(
      `SELECT * FROM task_events WHERE id = ?`,
      [id]
    );
    if (!row) {
      throw new Error('Failed to read inserted task event');
    }
    return mapTaskEventRow(row);
  }

  async listForTask(taskId: string): Promise<TaskEvent[]> {
    const rows = await this.db.getAllAsync<TaskEventRow>(
      `SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at ASC`,
      [taskId]
    );
    return rows.map(mapTaskEventRow);
  }
}
