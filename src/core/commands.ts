import type {
  CreateRecurrenceRuleInput,
  CreateTaskInput,
  Reminder,
  Task,
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

export interface CreateTaskEditorStateInput {
  task: CreateTaskInput;
  recurrence: TaskEditorRecurrenceDraft | null;
}

export interface SaveTaskEditorStateInput {
  task: UpdateTaskInput;
  recurrence: TaskEditorRecurrenceDraft | null;
}

type DueReminderChange =
  | { kind: 'none' }
  | { kind: 'created'; reminderId: string }
  | { kind: 'rescheduled'; reminderId: string; before: Reminder }
  | { kind: 'cancelled'; before: Reminder };

/**
 * The shared mutation path for UI, agent tools, and native actions.
 * Business rules remain in domain services; this class only owns dispatch and
 * the small amount of cross-domain orchestration that spans those services.
 */
export class AetherCommandExecutor {
  constructor(private readonly services: DomainServices) {}

  createTask(input: CreateTaskInput, source = 'manual') {
    return this.services.tasks.createTask(input, source);
  }

  updateTask(id: string, input: UpdateTaskInput, source = 'manual') {
    return this.services.tasks.updateTask(id, input, source);
  }

  private async findDueReminder(task: Task): Promise<Reminder | null> {
    if (!task.dueDate || !task.dueTime) return null;
    const reminders = await this.services.reminders.listReminders({
      taskId: task.id,
      enabledOnly: true,
    });
    return reminders.find((reminder) =>
      reminder.scheduledDate === task.dueDate &&
      reminder.scheduledTime === task.dueTime &&
      reminder.semantics === task.dueSemantics
    ) ?? null;
  }

  /**
   * The editor treats the task's due date+time as its primary alert. Extra
   * reminders (for example "1 day before") are intentionally left untouched.
   */
  private async syncEditorDueReminder(
    beforeTask: Task | null,
    afterTask: Task,
    source: string,
  ): Promise<DueReminderChange> {
    const beforeReminder = beforeTask ? await this.findDueReminder(beforeTask) : null;
    const targetHasTime = Boolean(afterTask.dueDate && afterTask.dueTime);

    if (!targetHasTime) {
      if (!beforeReminder) return { kind: 'none' };
      await this.services.reminders.cancelReminder(beforeReminder.id);
      return { kind: 'cancelled', before: beforeReminder };
    }

    const scheduledDate = afterTask.dueDate!;
    const scheduledTime = afterTask.dueTime!;
    if (beforeReminder) {
      await this.services.reminders.rescheduleReminder(beforeReminder.id, {
        scheduledDate,
        scheduledTime,
        timezone: afterTask.dueTimezone,
        semantics: afterTask.dueSemantics,
      });
      return { kind: 'rescheduled', reminderId: beforeReminder.id, before: beforeReminder };
    }

    // Avoid duplicating an existing alert that already matches the newly edited
    // due time, even if older builds did not explicitly mark a primary reminder.
    const existing = await this.services.reminders.listReminders({
      taskId: afterTask.id,
      enabledOnly: true,
    });
    const matching = existing.find((reminder) =>
      reminder.scheduledDate === scheduledDate &&
      reminder.scheduledTime === scheduledTime &&
      reminder.semantics === afterTask.dueSemantics
    );
    if (matching) return { kind: 'none' };

    const created = await this.services.reminders.scheduleReminder({
      taskId: afterTask.id,
      scheduledDate,
      scheduledTime,
      timezone: afterTask.dueTimezone,
      semantics: afterTask.dueSemantics,
      enabled: true,
    }, source);
    return { kind: 'created', reminderId: created.value.id };
  }

  private async rollbackEditorDueReminder(change: DueReminderChange): Promise<void> {
    switch (change.kind) {
      case 'none':
        return;
      case 'created':
        await this.services.reminders.cancelReminder(change.reminderId);
        return;
      case 'rescheduled':
        if (!change.before.scheduledDate) return;
        await this.services.reminders.rescheduleReminder(change.reminderId, {
          scheduledDate: change.before.scheduledDate,
          scheduledTime: change.before.scheduledTime,
          timezone: change.before.timezone,
          semantics: change.before.semantics,
        });
        return;
      case 'cancelled':
        if (!change.before.scheduledDate) return;
        await this.services.reminders.scheduleReminder({
          taskId: change.before.taskId,
          scheduledDate: change.before.scheduledDate,
          scheduledTime: change.before.scheduledTime,
          timezone: change.before.timezone,
          semantics: change.before.semantics,
          enabled: true,
        }, 'editor_rollback');
    }
  }

  /**
   * Create from the manual editor. Unlike generic task creation, a chosen due
   * time is also persisted as a reminder and projected to the OS.
   */
  async createTaskEditorState(input: CreateTaskEditorStateInput, source = 'manual') {
    if (input.recurrence && !input.task.dueDate) {
      throw new Error('Recurring reminders require a scheduled date.');
    }

    let createdTask: Task | null = null;
    try {
      if (input.recurrence) {
        const result = await this.services.recurrence.createRecurringTask({
          task: input.task,
          recurrence: input.recurrence,
        }, source);
        createdTask = result.task;
        await this.syncEditorDueReminder(null, result.task, source);
        return {
          value: result.task,
          recurrence: result.rule,
          receipt: result.receipt,
        };
      }

      const result = await this.services.tasks.createTask(input.task, source);
      createdTask = result.value;
      await this.syncEditorDueReminder(null, result.value, source);
      return {
        value: result.value,
        recurrence: null,
        receipt: result.receipt,
      };
    } catch (error) {
      if (createdTask) {
        const dueReminder = await this.findDueReminder(createdTask).catch(() => null);
        if (dueReminder) {
          await this.services.reminders.cancelReminder(dueReminder.id).catch(() => undefined);
        }
        await this.services.tasks.deleteTask(createdTask.id, 'editor_rollback').catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * Save the editor's task fields, primary due reminder, and recurrence intent
   * through one command boundary. Recurrence is applied last; if it fails, the
   * primary reminder and task fields are compensated before the error escapes.
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
    let reminderChange: DueReminderChange = { kind: 'none' };
    try {
      reminderChange = await this.syncEditorDueReminder(beforeTask, taskResult.value, source);

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
      await this.rollbackEditorDueReminder(reminderChange).catch(() => undefined);
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
