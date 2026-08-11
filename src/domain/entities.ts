/** Domain entities — independent of SQLite row shapes. */

export type TaskPriority = 'low' | 'medium' | 'high';

/** fixed = absolute instant semantics; floating = wall-clock in local/device zone */
export type TemporalSemantics = 'fixed' | 'floating';
export type ReminderProjectionState =
  | 'pending'
  | 'scheduled'
  | 'stale'
  | 'failed'
  | 'missing'
  | 'not_required'
  | 'blocked';
export type ReminderTimingPrecision = 'exact' | 'normal' | 'flexible';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RecurrenceMode = 'fixed' | 'after_completion';

export type TaskSource =
  | 'manual'
  | 'voice'
  | 'agent'
  | 'recurrence'
  | 'notification_candidate'
  | 'widget'
  | 'shortcut'
  | 'import';

export type TaskCreationOrigin = TaskSource;

export type TaskEventType =
  | 'created'
  | 'updated'
  | 'completed'
  | 'reopened'
  | 'rescheduled'
  | 'deleted';

export interface Project {
  id: string;
  name: string;
  color: string | null;
  archived: boolean;
  createdAt: string; // ISO instant
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  completed: boolean;
  priority: TaskPriority;
  projectId: string | null;
  /** Local calendar date YYYY-MM-DD — not a UTC instant */
  dueDate: string | null;
  /** Local wall-clock HH:mm */
  dueTime: string | null;
  dueTimezone: string | null;
  dueSemantics: TemporalSemantics;
  source: TaskSource;
  creationOrigin: TaskCreationOrigin;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
}

export interface Reminder {
  id: string;
  taskId: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  timezone: string | null;
  semantics: TemporalSemantics;
  enabled: boolean;
  nativeNotificationId: string | null;
  projectionState: ReminderProjectionState;
  projectionDirty: boolean;
  projectionRevision: number;
  projectionAttemptCount: number;
  projectionLastAttemptAt: string | null;
  projectionLastSuccessAt: string | null;
  projectionErrorCode: string | null;
  projectionError: string | null;
  timingPrecision: ReminderTimingPrecision;
  createdAt: string;
  updatedAt: string;
}

export interface RecurrenceRule {
  id: string;
  /** Current occurrence task. Historical completed tasks remain immutable. */
  taskId: string;
  frequency: RecurrenceFrequency;
  interval: number;
  /** JS weekday numbers: Sunday=0 ... Saturday=6. */
  weekdays: number[] | null;
  monthDays: number[] | null;
  startDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
  occurrenceCount: number;
  mode: RecurrenceMode;
  timezone: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurrenceRuleInput {
  id?: string;
  taskId: string;
  frequency: RecurrenceFrequency;
  interval?: number;
  weekdays?: number[] | null;
  monthDays?: number[] | null;
  startDate: string;
  endDate?: string | null;
  maxOccurrences?: number | null;
  occurrenceCount?: number;
  mode?: RecurrenceMode;
  timezone?: string | null;
}

export interface UpdateRecurrenceRuleInput {
  frequency?: RecurrenceFrequency;
  interval?: number;
  weekdays?: number[] | null;
  monthDays?: number[] | null;
  startDate?: string;
  endDate?: string | null;
  maxOccurrences?: number | null;
  mode?: RecurrenceMode;
  timezone?: string | null;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  type: TaskEventType;
  /** Small structured JSON payload — never full app dumps */
  payload: Record<string, unknown> | null;
  source: string;
  createdAt: string;
}

/** Input for creating a task (id/timestamps optional — generated if omitted). */
export interface CreateTaskInput {
  id?: string;
  title: string;
  notes?: string | null;
  priority?: TaskPriority;
  projectId?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  dueTimezone?: string | null;
  dueSemantics?: TemporalSemantics;
  source?: TaskSource;
  creationOrigin?: TaskCreationOrigin;
  completed?: boolean;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string | null;
  priority?: TaskPriority;
  projectId?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  dueTimezone?: string | null;
  dueSemantics?: TemporalSemantics;
}

/** UI-facing compatibility shape used by existing TaskCard (Slice 2 bridge). */
export interface TaskListItem {
  id: string;
  title: string;
  notes?: string;
  completed: boolean;
  createdAt: string;
  dueDate?: string;
  dueTime?: string;
  dueTimezone?: string;
  dueSemantics?: TemporalSemantics;
  priority: TaskPriority;
  aiSuggested?: boolean;
}

export function toTaskListItem(task: Task): TaskListItem {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes ?? undefined,
    completed: task.completed,
    createdAt: task.createdAt,
    dueDate: task.dueDate ?? undefined,
    dueTime: task.dueTime ?? undefined,
    dueTimezone: task.dueTimezone ?? undefined,
    dueSemantics: task.dueSemantics,
    priority: task.priority,
    aiSuggested: task.source === 'agent' || task.creationOrigin === 'agent',
  };
}
