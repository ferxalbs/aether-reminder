import type { ActionReceipt } from '@/domain/receipts';

export type TaskUndoAction =
  | 'task.soft_delete'
  | 'task.reopen'
  | 'task.complete'
  | 'task.restore_soft_deleted';

function isTaskUndoAction(value: unknown): value is TaskUndoAction {
  return (
    value === 'task.soft_delete' ||
    value === 'task.reopen' ||
    value === 'task.complete' ||
    value === 'task.restore_soft_deleted'
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

export function canUndoTaskReceipt(receipt: ActionReceipt | null): boolean {
  return getTaskUndoAction(receipt) !== null;
}
