import type { ActionReceipt } from '@/domain/receipts';
import type { TaskPriority, TemporalSemantics, UpdateTaskInput } from '@/domain/entities';

export type TaskUndoAction =
  | 'task.soft_delete'
  | 'task.reopen'
  | 'task.reopen_recurring'
  | 'task.complete'
  | 'task.restore_soft_deleted'
  | 'task.restore_fields';

export interface RecurringCompletionUndo {
  ruleId: string;
  previousTaskId: string;
  nextTaskId: string;
  occurrenceCount: number;
}

function isTaskUndoAction(value: unknown): value is TaskUndoAction {
  return (
    value === 'task.soft_delete' ||
    value === 'task.reopen' ||
    value === 'task.reopen_recurring' ||
    value === 'task.complete' ||
    value === 'task.restore_soft_deleted' ||
    value === 'task.restore_fields'
  );
}

export function getTaskUndoAction(receipt: ActionReceipt | null): TaskUndoAction | null {
  if (receipt?.entityType !== 'task' || !receipt.undo) return null;
  if (!isTaskUndoAction(receipt.undo.kind)) return null;
  return typeof receipt.undo.payload.taskId === 'string' && receipt.undo.payload.taskId.length > 0
    ? receipt.undo.kind
    : null;
}

export function getTaskUndoTaskId(receipt: ActionReceipt | null): string | null {
  if (!getTaskUndoAction(receipt)) return null;
  const taskId = receipt?.undo?.payload.taskId;
  return typeof taskId === 'string' && taskId.length > 0 ? taskId : null;
}

export function getRecurringCompletionUndo(receipt: ActionReceipt | null): RecurringCompletionUndo | null {
  if (
    receipt?.entityType !== 'task' ||
    receipt.undo?.kind !== 'task.reopen_recurring' ||
    typeof receipt.undo.payload.taskId !== 'string' ||
    typeof receipt.undo.payload.ruleId !== 'string' ||
    typeof receipt.undo.payload.nextTaskId !== 'string' ||
    typeof receipt.undo.payload.occurrenceCount !== 'number'
  ) return null;
  return {
    ruleId: receipt.undo.payload.ruleId,
    previousTaskId: receipt.undo.payload.taskId,
    nextTaskId: receipt.undo.payload.nextTaskId,
    occurrenceCount: receipt.undo.payload.occurrenceCount,
  };
}

export function canUndoTaskReceipt(receipt: ActionReceipt | null): boolean {
  const action = getTaskUndoAction(receipt);
  if (action === null) return false;
  if (action === 'task.restore_fields') return getTaskUndoRestoreFields(receipt) !== null;
  if (action === 'task.reopen_recurring') return getRecurringCompletionUndo(receipt) !== null;
  return true;
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isTemporalSemantics(value: unknown): value is TemporalSemantics {
  return value === 'fixed' || value === 'floating';
}

/**
 * Updates already carry the previous field values in their domain receipt.
 * Keep the payload opaque at the receipt boundary and validate it again before
 * handing it back to the command layer during an explicit Undo action.
 */
export function getTaskUndoRestoreFields(receipt: ActionReceipt | null): UpdateTaskInput | null {
  if (
    receipt?.entityType !== 'task' ||
    receipt.undo?.kind !== 'task.restore_fields' ||
    typeof receipt.undo.payload.taskId !== 'string' ||
    receipt.undo.payload.taskId.length === 0
  ) return null;
  const payload = receipt?.undo?.payload;
  if (!payload || typeof payload.title !== 'string' || !isTaskPriority(payload.priority)) {
    return null;
  }

  const nullableString = (value: unknown): string | null | undefined =>
    value === null || typeof value === 'string' ? value : undefined;

  const dueSemantics = payload.dueSemantics;
  return {
    title: payload.title,
    notes: nullableString(payload.notes),
    priority: payload.priority,
    projectId: nullableString(payload.projectId),
    dueDate: nullableString(payload.dueDate),
    dueTime: nullableString(payload.dueTime),
    dueTimezone: nullableString(payload.dueTimezone),
    dueSemantics: isTemporalSemantics(dueSemantics) ? dueSemantics : undefined,
  };
}
