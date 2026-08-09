import { describe, expect, test } from 'bun:test';
import { createReceipt } from '@/domain/receipts';
import { canUndoTaskReceipt, getTaskUndoAction, getTaskUndoTaskId } from './taskUndo';

describe('task undo receipt validation', () => {
  test('accepts supported task undo payloads', () => {
    const receipt = createReceipt({
      risk: 'REVERSIBLE_WRITE',
      action: 'tasks.delete',
      entityType: 'task',
      entityId: 'task-1',
      summary: 'Deleted task “Write tests”',
      undo: {
        kind: 'task.restore_soft_deleted',
        payload: { taskId: 'task-1' },
      },
    });

    expect(canUndoTaskReceipt(receipt)).toBe(true);
    expect(getTaskUndoAction(receipt)).toBe('task.restore_soft_deleted');
    expect(getTaskUndoTaskId(receipt)).toBe('task-1');
  });

  test('rejects non-task, malformed, and unsupported receipts', () => {
    const navigationReceipt = createReceipt({
      risk: 'REVERSIBLE_WRITE',
      action: 'app.navigate',
      entityType: 'navigation',
      entityId: 'tasks',
      summary: 'Opened tasks',
      undo: { kind: 'task.reopen', payload: { taskId: 'task-1' } },
    });
    const malformedReceipt = createReceipt({
      risk: 'REVERSIBLE_WRITE',
      action: 'tasks.delete',
      entityType: 'task',
      entityId: 'task-1',
      summary: 'Deleted task',
      undo: { kind: 'task.restore_soft_deleted', payload: {} },
    });
    const updateReceipt = createReceipt({
      risk: 'REVERSIBLE_WRITE',
      action: 'tasks.update',
      entityType: 'task',
      entityId: 'task-1',
      summary: 'Updated task',
      undo: {
        kind: 'task.restore_fields',
        payload: { taskId: 'task-1', title: 'Before update', priority: 'medium' },
      },
    });

    expect(canUndoTaskReceipt(navigationReceipt)).toBe(false);
    expect(canUndoTaskReceipt(malformedReceipt)).toBe(false);
    expect(canUndoTaskReceipt(updateReceipt)).toBe(true);
    expect(getTaskUndoAction(null)).toBeNull();
    expect(getTaskUndoTaskId(null)).toBeNull();
  });
});
