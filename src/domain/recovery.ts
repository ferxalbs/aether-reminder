import type { ActionReceipt } from '@/domain/receipts';
import type { TaskPriority, TemporalSemantics } from './entities';
import { isValidLocalDate, isValidLocalTime } from '@/temporal/resolve';

export type RecoveryReason = 'overdue' | 'missed_time';

/** The schedule fields Smart Recovery is allowed to change. */
export interface RecoverySchedule {
  dueDate: string | null;
  dueTime: string | null;
  dueTimezone: string | null;
  dueSemantics: TemporalSemantics;
}

export type RecoveryAlternativeKind =
  | 'later_today'
  | 'today_original'
  | 'tomorrow'
  | 'keep_current'
  | 'exclude';

export interface RecoveryAlternative {
  kind: RecoveryAlternativeKind;
  label: string;
  schedule: RecoverySchedule | null;
}

export interface RecoveryRecurrenceMetadata {
  ruleId: string;
  mode: 'fixed' | 'after_completion';
  occurrenceCount: number;
  startDate: string;
}

export interface RecoveryProposal {
  id: string;
  taskId: string;
  taskTitle: string;
  priority: TaskPriority;
  /** The task version captured when this derived proposal was generated. */
  taskUpdatedAt: string;
  previous: RecoverySchedule;
  proposed: RecoverySchedule;
  reason: RecoveryReason;
  generatedAt: string;
  alternatives: RecoveryAlternative[];
  recurrence: RecoveryRecurrenceMetadata | null;
}

export interface RecoveryPlan {
  id: string;
  generatedAt: string;
  proposals: RecoveryProposal[];
}

/** A null schedule means “keep current” or “exclude from this apply”. */
export interface RecoveryApplySelection {
  proposal: RecoveryProposal;
  schedule: RecoverySchedule | null;
}

export interface RecoveryFailure {
  taskId: string;
  message: string;
}

export interface RecoveryApplyResult {
  planId: string;
  applied: string[];
  skippedStale: string[];
  alreadyApplied: string[];
  excluded: string[];
  failed: RecoveryFailure[];
  projectionFailures: RecoveryFailure[];
  receipt: ActionReceipt | null;
}

export interface RecoveryUndoItem {
  taskId: string;
  /** Version written by Apply Recovery; used to protect newer edits. */
  appliedUpdatedAt: string;
  applied: RecoverySchedule;
  previous: RecoverySchedule;
}

export const RECOVERY_UNDO_KIND = 'recovery.batch';
/** Shared handoff boundary used by Smart Recovery and Adaptive Nudge. */
export const RECOVERY_MISSED_GRACE_MINUTES = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSchedule(value: unknown): RecoverySchedule | null {
  if (!isRecord(value)) return null;
  const dueDate = value.dueDate;
  const dueTime = value.dueTime;
  const dueTimezone = value.dueTimezone;
  const dueSemantics = value.dueSemantics;
  if (
    !(dueDate === null || typeof dueDate === 'string') ||
    !(dueTime === null || typeof dueTime === 'string') ||
    !(dueTimezone === null || typeof dueTimezone === 'string') ||
    (dueSemantics !== 'fixed' && dueSemantics !== 'floating')
  ) return null;
  return {
    dueDate,
    dueTime,
    dueTimezone,
    dueSemantics,
  };
}

/** Parse the opaque batch receipt again immediately before an explicit Undo. */
export function getRecoveryUndoItems(receipt: ActionReceipt | null): RecoveryUndoItem[] | null {
  if (
    receipt?.entityType !== 'task' ||
    receipt.undo?.kind !== RECOVERY_UNDO_KIND ||
    !isRecord(receipt.undo.payload) ||
    !Array.isArray(receipt.undo.payload.items)
  ) return null;

  const items: RecoveryUndoItem[] = [];
  for (const value of receipt.undo.payload.items) {
    if (!isRecord(value)) return null;
    const taskId = value.taskId;
    const appliedUpdatedAt = value.appliedUpdatedAt;
    const applied = parseSchedule(value.applied);
    const previous = parseSchedule(value.previous);
    if (
      typeof taskId !== 'string' || taskId.length === 0 ||
      typeof appliedUpdatedAt !== 'string' || appliedUpdatedAt.length === 0 ||
      !applied || !previous
    ) return null;
    items.push({ taskId, appliedUpdatedAt, applied, previous });
  }
  return items.length > 0 ? items : null;
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/** Defensive validation for derived schedules before they reach SQLite. */
export function assertRecoverySchedule(schedule: RecoverySchedule): void {
  if (schedule.dueDate === null || !isValidLocalDate(schedule.dueDate)) {
    throw new Error('Recovery schedule has an invalid due date.');
  }
  if (schedule.dueTime !== null && !isValidLocalTime(schedule.dueTime)) {
    throw new Error('Recovery schedule has an invalid due time.');
  }
  if (schedule.dueSemantics !== 'fixed' && schedule.dueSemantics !== 'floating') {
    throw new Error('Recovery schedule has invalid temporal semantics.');
  }
  if (schedule.dueTimezone !== null && !isValidTimezone(schedule.dueTimezone)) {
    throw new Error('Recovery schedule has an invalid timezone.');
  }
}
