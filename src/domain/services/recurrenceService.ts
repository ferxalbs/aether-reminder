import type {
  CreateRecurrenceRuleInput,
  CreateTaskInput,
  RecurrenceRule,
  Task,
  UpdateRecurrenceRuleInput,
} from '@/domain/entities';
import { createReceipt, type ActionReceipt } from '@/domain/receipts';
import { RecurrenceRulesRepository } from '@/db/repositories/recurrenceRulesRepository';
import { getLocalDateString } from '@/temporal/localCalendar';
import { getNextRecurrenceDate } from '@/temporal/recurrence';
import { ReminderService } from './reminderService';
import { TaskService, type MutationResult } from './taskService';

export interface RecurrenceMutationResult {
  value: RecurrenceRule;
  receipt: ActionReceipt;
}

export interface RecurrenceAdvanceResult {
  rule: RecurrenceRule;
  nextTask: Task;
}

export interface CreateRecurringTaskInput {
  task: CreateTaskInput;
  recurrence: Omit<CreateRecurrenceRuleInput, 'taskId' | 'startDate'> & { startDate?: string };
}

function occurrenceTaskId(ruleId: string, occurrence: number): string {
  return `recurrence_${ruleId}_${occurrence}`;
}

export class RecurrenceService {
  constructor(
    private readonly rules: RecurrenceRulesRepository,
    private readonly tasks: TaskService,
    private readonly reminders: ReminderService,
  ) {}

  async getRuleForTask(taskId: string): Promise<RecurrenceRule | null> {
    return this.rules.getActiveForTask(taskId);
  }

  async createRule(input: CreateRecurrenceRuleInput): Promise<RecurrenceMutationResult> {
    const task = await this.tasks.getTask(input.taskId);
    if (!task) throw new Error('Task not found for recurrence.');
    const rule = await this.rules.create(input);
    return {
      value: rule,
      receipt: createReceipt({
        risk: 'REVERSIBLE_WRITE',
        action: 'recurrence.create',
        entityType: 'task',
        entityId: task.id,
        summary: `Made “${task.title}” repeat ${rule.frequency}`,
        undo: { kind: 'recurrence.stop', payload: { ruleId: rule.id, taskId: task.id } },
      }),
    };
  }

  async createRecurringTask(input: CreateRecurringTaskInput, source = 'manual'): Promise<{
    task: Task;
    rule: RecurrenceRule;
    receipt: ActionReceipt;
  }> {
    const startDate = input.recurrence.startDate ?? input.task.dueDate ?? getLocalDateString();
    const taskResult = await this.tasks.createTask(
      {
        ...input.task,
        dueDate: startDate,
      },
      source,
    );
    try {
      const ruleResult = await this.createRule({
        ...input.recurrence,
        taskId: taskResult.value.id,
        startDate,
      });
      return {
        task: taskResult.value,
        rule: ruleResult.value,
        receipt: createReceipt({
          risk: 'REVERSIBLE_WRITE',
          action: 'tasks.create_recurring',
          entityType: 'task',
          entityId: taskResult.value.id,
          summary: `Created recurring task “${taskResult.value.title}”`,
          undo: { kind: 'task.soft_delete', payload: { taskId: taskResult.value.id } },
        }),
      };
    } catch (error) {
      await this.tasks.deleteTask(taskResult.value.id, 'recurrence_rollback').catch(() => undefined);
      throw error;
    }
  }

  async updateRule(id: string, input: UpdateRecurrenceRuleInput): Promise<RecurrenceMutationResult> {
    const rule = await this.rules.update(id, input);
    return {
      value: rule,
      receipt: createReceipt({
        risk: 'REVERSIBLE_WRITE',
        action: 'recurrence.update',
        entityType: 'task',
        entityId: rule.taskId,
        summary: `Updated ${rule.frequency} recurrence`,
      }),
    };
  }

  async stopRule(id: string): Promise<RecurrenceMutationResult> {
    const rule = await this.rules.stop(id);
    return {
      value: rule,
      receipt: createReceipt({
        risk: 'REVERSIBLE_WRITE',
        action: 'recurrence.stop',
        entityType: 'task',
        entityId: rule.taskId,
        summary: 'Stopped recurring schedule',
      }),
    };
  }

  async advanceAfterCompletion(completedTask: Task, source = 'recurrence'): Promise<RecurrenceAdvanceResult | null> {
    const rule = await this.rules.getActiveForTask(completedTask.id);
    if (!rule) return null;

    const fromDate = rule.mode === 'after_completion'
      ? getLocalDateString(completedTask.completedAt ? new Date(completedTask.completedAt) : new Date())
      : (completedTask.dueDate ?? rule.startDate);
    const nextDate = getNextRecurrenceDate(rule, fromDate);
    if (!nextDate) {
      await this.rules.stop(rule.id);
      return null;
    }

    const nextOccurrence = rule.occurrenceCount + 1;
    const nextId = occurrenceTaskId(rule.id, nextOccurrence);
    let nextTask = await this.tasks.getTask(nextId, { includeDeleted: true });
    if (!nextTask || nextTask.deletedAt) {
      try {
        const created = await this.tasks.createTask(
          {
            id: nextId,
            title: completedTask.title,
            notes: completedTask.notes,
            priority: completedTask.priority,
            projectId: completedTask.projectId,
            dueDate: nextDate,
            dueTime: completedTask.dueTime,
            dueTimezone: rule.timezone ?? completedTask.dueTimezone,
            dueSemantics: completedTask.dueSemantics,
            source: 'recurrence',
            creationOrigin: completedTask.creationOrigin,
          },
          source,
        );
        nextTask = created.value;
      } catch (error) {
        nextTask = await this.tasks.getTask(nextId, { includeDeleted: true });
        if (!nextTask || nextTask.deletedAt) throw error;
      }
    }

    const advanced = await this.rules.advance(
      rule.id,
      completedTask.id,
      nextTask.id,
      rule.occurrenceCount,
    );
    const currentRule = await this.rules.getById(rule.id);
    if (!currentRule) throw new Error('Recurrence rule disappeared during advancement.');
    if (!advanced && currentRule.taskId !== nextTask.id) {
      throw new Error('Recurrence changed while advancing; retry the completion.');
    }

    // Only the winning advancement copies reminder semantics forward. The old
    // reminder record remains attached to completed history; projection suppresses it.
    if (advanced) {
      const existingReminders = await this.reminders.listReminders({
        taskId: completedTask.id,
        enabledOnly: true,
      });
      for (const reminder of existingReminders) {
        await this.reminders.scheduleReminder(
          {
            taskId: nextTask.id,
            scheduledDate: nextDate,
            scheduledTime: reminder.scheduledTime,
            timezone: reminder.timezone ?? rule.timezone,
            semantics: reminder.semantics,
            enabled: true,
          },
          source,
        );
      }
    }

    return { rule: currentRule, nextTask };
  }

  /** Undo only the latest recurrence advancement associated with this completion. */
  async undoLatestCompletionForTask(previousTaskId: string): Promise<MutationResult<Task> | null> {
    const rule = await this.rules.getAdvancedFromTask(previousTaskId);
    if (!rule) return null;
    const nextTaskId = rule.taskId;
    const rolledBack = await this.rules.rollbackAdvance(
      rule.id,
      previousTaskId,
      nextTaskId,
      rule.occurrenceCount,
    );
    if (!rolledBack) throw new Error('Recurring completion can no longer be undone safely.');

    try {
      const nextReminders = await this.reminders.listReminders({ taskId: nextTaskId, enabledOnly: true });
      for (const reminder of nextReminders) {
        await this.reminders.cancelReminder(reminder.id);
      }
      const next = await this.tasks.getTask(nextTaskId);
      if (next) await this.tasks.deleteTask(nextTaskId, 'undo');
      return await this.tasks.reopenTask(previousTaskId, 'undo');
    } catch (error) {
      await this.rules.advance(
        rule.id,
        previousTaskId,
        nextTaskId,
        rule.occurrenceCount - 1,
      ).catch(() => undefined);
      throw error;
    }
  }
}
