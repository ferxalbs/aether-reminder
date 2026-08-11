import type {
  Project,
  Reminder,
  Task,
  TaskEvent,
  TaskEventType,
  TaskPriority,
  TaskSource,
  TemporalSemantics,
  ReminderProjectionState,
  ReminderTimingPrecision,
} from '@/domain/entities';
import { reportNonFatalError } from '@/lib/nonFatalError';

export interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  completed: number;
  priority: string;
  project_id: string | null;
  due_date: string | null;
  due_time: string | null;
  due_timezone: string | null;
  due_semantics: string;
  source: string;
  creation_origin: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  deleted_at: string | null;
}

export interface ReminderRow {
  id: string;
  task_id: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  timezone: string | null;
  semantics: string;
  enabled: number;
  native_notification_id: string | null;
  projection_state: string;
  projection_dirty: number;
  projection_revision: number;
  projection_attempt_count: number;
  projection_last_attempt_at: string | null;
  projection_last_success_at: string | null;
  projection_error_code: string | null;
  projection_error: string | null;
  timing_precision: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  color: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface TaskEventRow {
  id: string;
  task_id: string;
  type: string;
  payload_json: string | null;
  source: string;
  created_at: string;
}

export function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    completed: row.completed === 1,
    priority: row.priority as TaskPriority,
    projectId: row.project_id,
    dueDate: row.due_date,
    dueTime: row.due_time,
    dueTimezone: row.due_timezone,
    dueSemantics: row.due_semantics as TemporalSemantics,
    source: row.source as TaskSource,
    creationOrigin: row.creation_origin as TaskSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
  };
}

export function mapReminderRow(row: ReminderRow): Reminder {
  return {
    id: row.id,
    taskId: row.task_id,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    timezone: row.timezone,
    semantics: row.semantics as TemporalSemantics,
    enabled: row.enabled === 1,
    nativeNotificationId: row.native_notification_id,
    projectionState: row.projection_state as ReminderProjectionState,
    projectionDirty: row.projection_dirty === 1,
    projectionRevision: row.projection_revision,
    projectionAttemptCount: row.projection_attempt_count,
    projectionLastAttemptAt: row.projection_last_attempt_at,
    projectionLastSuccessAt: row.projection_last_success_at,
    projectionErrorCode: row.projection_error_code,
    projectionError: row.projection_error,
    timingPrecision: row.timing_precision as ReminderTimingPrecision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTaskEventRow(row: TaskEventRow): TaskEvent {
  let payload: Record<string, unknown> | null = null;
  if (row.payload_json) {
    try {
      const parsed = JSON.parse(row.payload_json) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch (error) {
      reportNonFatalError('task-event-payload', error);
      payload = null;
    }
  }
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.type as TaskEventType,
    payload,
    source: row.source,
    createdAt: row.created_at,
  };
}
