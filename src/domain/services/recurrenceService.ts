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
import { TaskService } from './taskService';

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
        // Deterministic occurrence IDs make a concurrent/retried advancement safe.
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

    return { rule: currentRule, nextTask };
  }

  async undoRecurringCompletion(input: {
    ruleId: string;
    previousTaskId: string;
    nextTaskId: string;
    occurrenceCount: number;
  }): Promise<void> {
    const current = await this.rules.getById(input.ruleId);
    if (!current) throw new Error('Recurrence rule not found.');

    const alreadyRolledBack =
      current.taskId === input.previousTaskId &&
      current.occurrenceCount === input.occurrenceCount - 1;

    if (!alreadyRolledBack) {
      const rolledBack = await this.rules.rollbackAdvance(
        input.ruleId,
        input.previousTaskId,
        input.nextTaskId,
        input.occurrenceCount,
      );
      if (!rolledBack) throw new Error('Recurring completion can no longer be undone safely.');
    }

    const next = await this.tasks.getTask(input.nextTaskId);
    if (next) await this.tasks.deleteTask(input.nextTaskId, 'undo');
    await this.tasks.reopenTask(input.previousTaskId, 'undo');
  }
}
