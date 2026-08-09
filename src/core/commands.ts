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
        undo: {
          kind: 'task.reopen_recurring',
          payload: {
            taskId: result.value.id,
            ruleId: recurrence.rule.id,
            nextTaskId: recurrence.nextTask.id,
            occurrenceCount: recurrence.rule.occurrenceCount,
          },
        },
      }),
    };
  }

  reopenTask(id: string, source = 'manual') {
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

  undoRecurringCompletion(input: {
    ruleId: string;
    previousTaskId: string;
    nextTaskId: string;
    occurrenceCount: number;
  }) {
    return this.services.recurrence.undoRecurringCompletion(input);
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
