import type {
  CreateRecurrenceRuleInput,
  CreateTaskInput,
  UpdateRecurrenceRuleInput,
  UpdateTaskInput,
} from '@/domain/entities';
import { createReceipt } from '@/domain/receipts';
import type { DomainServices } from '@/domain/services';
import type { CreateRecurringTaskInput } from '@/domain/services/recurrenceService';
import type { RescheduleTaskInput } from '@/domain/services/taskService';
import type {
  RescheduleReminderInput,
  ScheduleReminderInput,
} from '@/domain/services/reminderService';

export type TaskEditorRecurrenceDraft = Omit<
  CreateRecurrenceRuleInput,
  'id' | 'taskId' | 'occurrenceCount'
>;

export interface SaveTaskEditorStateInput {
  task: UpdateTaskInput;
  recurrence: TaskEditorRecurrenceDraft | null;
}

/**
 * The shared mutation path for UI, agent tools, and native actions.
 * Business rules remain in domain services; this class only owns dispatch and
 * the small amount of cross-domain orchestration that must be atomic in intent.
 */
export class AetherCommandExecutor {
  constructor(private readonly services: DomainServices) {}

  createTask(input: CreateTaskInput, source = 'manual') {
    return this.services.tasks.createTask(input, source);
  }

  updateTask(id: string, input: UpdateTaskInput, source = 'manual') {
    return this.services.tasks.updateTask(id, input, source);
  }

  /**
   * Save the editor's task fields and recurrence intent through one command
   * boundary. If recurrence persistence fails, restore the task fields so the
   * sheet never reports a partially-applied schedule as success.
   */
  async saveTaskEditorState(id: string, input: SaveTaskEditorStateInput, source = 'manual') {
    const beforeTask = await this.services.tasks.getTask(id);
    if (!beforeTask) throw new Error('Task not found.');
    const beforeRule = await this.services.recurrence.getRuleForTask(id);
    const targetDate = input.task.dueDate === undefined ? beforeTask.dueDate : input.task.dueDate;
    if (input.recurrence && !targetDate) {
      throw new Error('Recurring reminders require a scheduled date.');
    }

    const taskResult = await this.services.tasks.updateTask(id, input.task, source);
    try {
      let recurrenceResult = null;
      if (input.recurrence && targetDate) {
        const normalized = { ...input.recurrence, startDate: targetDate };
        recurrenceResult = beforeRule
          ? await this.services.recurrence.updateRule(beforeRule.id, normalized)
          : await this.services.recurrence.createRule({
              ...normalized,
              taskId: id,
            });
      } else if (beforeRule) {
        recurrenceResult = await this.services.recurrence.stopRule(beforeRule.id);
      }

      return {
        value: taskResult.value,
        recurrence: recurrenceResult?.value ?? null,
        receipt: recurrenceResult?.receipt ?? taskResult.receipt,
      };
    } catch (error) {
      await this.services.tasks.updateTask(
        id,
        {
          title: beforeTask.title,
          notes: beforeTask.notes,
          priority: beforeTask.priority,
          projectId: beforeTask.projectId,
          dueDate: beforeTask.dueDate,
          dueTime: beforeTask.dueTime,
          dueTimezone: beforeTask.dueTimezone,
          dueSemantics: beforeTask.dueSemantics,
        },
        'editor_rollback',
      ).catch(() => undefined);
      throw error;
    }
  }

  async completeTask(id: string, source = 'manual') {
    const result = await this.services.tasks.completeTask(id, source);
    const recurrence = await this.services.recurrence.advanceAfterCompletion(result.value, source);
    if (!recurrence) return result;

    return {
      ...result,
      recurrence,
      receipt: createReceipt({
        risk: 'REVERSIBLE_WRITE',
        action: 'tasks.complete_recurring',
        entityType: 'task',
        entityId: result.value.id,
        summary: `Completed “${result.value.title}” · next ${recurrence.nextTask.dueDate ?? ''}`.trim(),
        // Keep the public Undo contract stable. reopenTask(..., 'undo') detects
        // the latest recurrence advancement and rolls it back before reopening.
        undo: { kind: 'task.reopen', payload: { taskId: result.value.id } },
      }),
    };
  }

  async reopenTask(id: string, source = 'manual') {
    if (source === 'undo') {
      const recurringUndo = await this.services.recurrence.undoLatestCompletionForTask(id);
      if (recurringUndo) return recurringUndo;
    }
    return this.services.tasks.reopenTask(id, source);
  }

  rescheduleTask(id: string, input: RescheduleTaskInput, source = 'manual') {
    return this.services.tasks.rescheduleTask(id, input, source);
  }

  deleteTask(id: string, source = 'manual') {
    return this.services.tasks.deleteTask(id, source);
  }

  restoreTask(id: string, source = 'undo') {
    return this.services.tasks.restoreTask(id, source);
  }

  createRecurrenceRule(input: CreateRecurrenceRuleInput) {
    return this.services.recurrence.createRule(input);
  }

  createRecurringTask(input: CreateRecurringTaskInput, source = 'manual') {
    return this.services.recurrence.createRecurringTask(input, source);
  }

  updateRecurrenceRule(id: string, input: UpdateRecurrenceRuleInput) {
    return this.services.recurrence.updateRule(id, input);
  }

  stopRecurrenceRule(id: string) {
    return this.services.recurrence.stopRule(id);
  }

  scheduleReminder(input: ScheduleReminderInput, source = 'manual') {
    return this.services.reminders.scheduleReminder(input, source);
  }

  rescheduleReminder(id: string, input: RescheduleReminderInput) {
    return this.services.reminders.rescheduleReminder(id, input);
  }

  cancelReminder(id: string) {
    return this.services.reminders.cancelReminder(id);
  }
}
