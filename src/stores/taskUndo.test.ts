import { describe, expect, test } from "bun:test";
import { createReceipt } from "@/domain/receipts";
import { RECOVERY_UNDO_KIND } from "@/domain/recovery";
import {
  canUndoTaskReceipt,
  getTaskUndoAction,
  getTaskUndoTaskId,
} from "./taskUndo";

describe("task undo receipt validation", () => {
  test("accepts supported task undo payloads", () => {
    const receipt = createReceipt({
      risk: "REVERSIBLE_WRITE",
      action: "tasks.delete",
      entityType: "task",
      entityId: "task-1",
      summary: "Deleted task “Write tests”",
      undo: {
        kind: "task.restore_soft_deleted",
        payload: { taskId: "task-1" },
      },
    });

    expect(canUndoTaskReceipt(receipt)).toBe(true);
    expect(getTaskUndoAction(receipt)).toBe("task.restore_soft_deleted");
    expect(getTaskUndoTaskId(receipt)).toBe("task-1");
  });

  test("accepts a batch recovery receipt through the shared undo surface", () => {
    const receipt = createReceipt({
      risk: "BULK_MUTATION",
      action: "recovery.apply",
      entityType: "task",
      entityId: "recovery-plan-1",
      summary: "Recovered 1 task",
      undo: {
        kind: RECOVERY_UNDO_KIND,
        payload: {
          items: [
            {
              taskId: "task-1",
              appliedUpdatedAt: "2026-08-11T10:00:00.000Z",
              applied: {
                dueDate: "2026-08-11",
                dueTime: "10:00",
                dueTimezone: null,
                dueSemantics: "floating",
              },
              previous: {
                dueDate: "2026-08-10",
                dueTime: "10:00",
                dueTimezone: null,
                dueSemantics: "floating",
              },
            },
          ],
        },
      },
    });

    expect(canUndoTaskReceipt(receipt)).toBe(true);
    expect(getTaskUndoAction(receipt)).toBe(RECOVERY_UNDO_KIND);
    expect(getTaskUndoTaskId(receipt)).toBeNull();
  });

  test("rejects non-task, malformed, and unsupported receipts", () => {
    const navigationReceipt = createReceipt({
      risk: "REVERSIBLE_WRITE",
      action: "app.navigate",
      entityType: "navigation",
      entityId: "tasks",
      summary: "Opened tasks",
      undo: { kind: "task.reopen", payload: { taskId: "task-1" } },
    });
    const malformedReceipt = createReceipt({
      risk: "REVERSIBLE_WRITE",
      action: "tasks.delete",
      entityType: "task",
      entityId: "task-1",
      summary: "Deleted task",
      undo: { kind: "task.restore_soft_deleted", payload: {} },
    });
    const updateReceipt = createReceipt({
      risk: "REVERSIBLE_WRITE",
      action: "tasks.update",
      entityType: "task",
      entityId: "task-1",
      summary: "Updated task",
      undo: {
        kind: "task.restore_fields",
        payload: {
          taskId: "task-1",
          title: "Before update",
          priority: "medium",
        },
      },
    });

    expect(canUndoTaskReceipt(navigationReceipt)).toBe(false);
    expect(canUndoTaskReceipt(malformedReceipt)).toBe(false);
    expect(canUndoTaskReceipt(updateReceipt)).toBe(true);
    expect(getTaskUndoAction(null)).toBeNull();
    expect(getTaskUndoTaskId(null)).toBeNull();
  });
});
