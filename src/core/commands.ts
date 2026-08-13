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
import {
  getRecoveryUndoItems,
  RECOVERY_UNDO_KIND,
  type RecoveryApplyResult,
  type RecoveryApplySelection,
  type RecoverySchedule,
} from '@/domain/recovery';
import type { NotificationReconciliationResult } from '@/services/notifications/notificationReconciliation';
import { reportNonFatalError } from '@/lib/nonFatalError';
import type { CaptureCommitContext } from '@/db/repositories/tasksRepository';

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

  getTask(taskId: string): Promise<Task | null> {
    return this.services.tasks.getTask(taskId);
  }

  private async syncTaskProjections(
    taskId: string,
    reason: string,
  ): Promise<NotificationReconciliationResult | null> {
    await this.services.repos.reminders.markTaskDirty(taskId);
    try {
      const result = await this.services.notifications.reconcile({
        mode: 'incremental',
        taskIds: [taskId],
        reason,
      });
      if (result.failed > 0) {
        reportNonFatalError(
          `notification-${reason}`,
          result.failures.map((failure) => failure.error.message).join('; '),
        );
      }
      return result;
    } catch (error) {
      reportNonFatalError(`notification-${reason}`, error);
      return null;
    }
  }

  private async replanAdaptiveNudges(taskId: string, reason: string): Promise<void> {
    try {
      await this.services.nudges.replanTask(taskId);
    } catch (error) {
      // Nudge learning is best-effort; task and primary reminder mutations do
      // not roll back because a derived plan or native projection is unhealthy.
      reportNonFatalError(`adaptive-nudge-${reason}`, error);
    }
  }

  private async recordTaskCompleted(task: Task, source: string): Promise<void> {
    try {
      await this.services.nudges.recordTaskCompleted(task, source);
    } catch (error) {
      reportNonFatalError('adaptive-nudge-completion', error);
    }
  }

  private async findDueReminder(task: Task): Promise<Reminder | null> {
    if (!task.dueDate || !task.dueTime) return null;
    const reminders = await this.services.reminders.listReminders({
      taskId: task.id,
      enabledOnly: true,
    });
    return reminders.find((reminder) =>
      reminder.kind !== 'adaptive_followup' &&
      reminder.scheduledDate === task.dueDate &&
      reminder.scheduledTime === task.dueTime &&
      reminder.semantics === task.dueSemantics
    ) ?? null;
  }

  /**
   * A task's due date+time owns one primary alert. Extra reminders (for example
   * "1 day before") are intentionally left untouched.
   */
  private async syncDueReminder(
    beforeTask: Task | null,
    afterTask: Task,
    source: string,
    options: { project?: boolean } = {},
  ): Promise<DueReminderChange> {
    const beforeReminder = beforeTask ? await this.findDueReminder(beforeTask) : null;
    const targetHasTime = Boolean(afterTask.dueDate && afterTask.dueTime);

    if (!targetHasTime) {
      if (!beforeReminder) return { kind: 'none' };
      await this.services.reminders.cancelReminder(beforeReminder.id, options);
      return { kind: 'cancelled', before: beforeReminder };
    }

    const scheduledDate = afterTask.dueDate!;
    const scheduledTime = afterTask.dueTime!;
    if (beforeReminder) {
      await this.services.reminders.rescheduleReminder(
        beforeReminder.id,
        {
          scheduledDate,
          scheduledTime,
          timezone: afterTask.dueTimezone,
          semantics: afterTask.dueSemantics,
        },
        options,
      );
      return { kind: 'rescheduled', reminderId: beforeReminder.id, before: beforeReminder };
    }

    // Avoid duplicating an existing alert that already matches the due time,
    // including reminders created by an older app version or another command.
    const existing = await this.services.reminders.listReminders({
      taskId: afterTask.id,
      enabledOnly: true,
    });
    const matching = existing.find((reminder) =>
      reminder.kind !== 'adaptive_followup' &&
      reminder.scheduledDate === scheduledDate &&
      reminder.scheduledTime === scheduledTime &&
      reminder.semantics === afterTask.dueSemantics
    );
    if (matching) return { kind: 'none' };

    const created = await this.services.reminders.scheduleReminder(
      {
        taskId: afterTask.id,
        scheduledDate,
        scheduledTime,
        timezone: afterTask.dueTimezone,
        semantics: afterTask.dueSemantics,
        enabled: true,
      },
      source,
      options,
    );
    return { kind: 'created', reminderId: created.value.id };
  }

  private scheduleFromTask(task: Task): RecoverySchedule {
    return {
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      dueTimezone: task.dueTimezone,
      dueSemantics: task.dueSemantics,
    };
  }

  private recoveryResult(planId: string): RecoveryApplyResult {
    return {
      planId,
      applied: [],
      skippedStale: [],
      alreadyApplied: [],
      excluded: [],
      failed: [],
      projectionFailures: [],
      receipt: null,
    };
  }

  private addProjectionFailures(
    result: RecoveryApplyResult,
    taskId: string,
    reconciliation: NotificationReconciliationResult | null,
  ): void {
    if (!reconciliation || reconciliation.failed === 0) return;
    for (const failure of reconciliation.failures) {
      result.projectionFailures.push({
        taskId,
        message: failure.error.message,
      });
    }
  }

  /**
   * Apply only the selected schedule fields. Task version checks and task
   * events are committed in one repository transaction; native notification
   * work is intentionally deferred to incremental reliability reconciliation.
   */
  async applyRecovery(
    planId: string,
    selections: readonly RecoveryApplySelection[],
  ): Promise<RecoveryApplyResult> {
    const result = this.recoveryResult(planId);
    const uniqueSelections = [...new Map(selections.map((selection) => [selection.proposal.taskId, selection])).values()];
    const selected = uniqueSelections.filter((selection) => selection.schedule !== null);
    result.excluded.push(...uniqueSelections.filter((selection) => selection.schedule === null).map((selection) => selection.proposal.taskId));
    for (const taskId of result.excluded) {
      try {
        await this.services.nudges.recordSmartRecovery(taskId, false);
      } catch (error) {
        reportNonFatalError('adaptive-nudge-recovery-rejected', error);
      }
    }

    let outcomes;
    try {
      outcomes = await this.services.tasks.applyRecoverySchedules(
        selected.map((selection) => ({
          taskId: selection.proposal.taskId,
          expectedUpdatedAt: selection.proposal.taskUpdatedAt,
          schedule: selection.schedule!,
        })),
        'recovery',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recovery could not be applied.';
      result.failed.push(...selected.map((selection) => ({ taskId: selection.proposal.taskId, message })));
      return result;
    }

    const applied = [] as {
      selection: RecoveryApplySelection;
      before: Task;
      after: Task;
    }[];
    for (const outcome of outcomes) {
      const selection = selected.find((item) => item.proposal.taskId === outcome.taskId);
      if (!selection || !selection.schedule) continue;
      if (outcome.applied && outcome.before && outcome.after) {
        result.applied.push(outcome.taskId);
        applied.push({ selection, before: outcome.before, after: outcome.after });
        continue;
      }
      const current = outcome.current;
      if (
        current &&
        !current.completed &&
        !current.deletedAt &&
        current.dueDate === selection.schedule.dueDate &&
        current.dueTime === selection.schedule.dueTime &&
        current.dueTimezone === selection.schedule.dueTimezone &&
        current.dueSemantics === selection.schedule.dueSemantics
      ) {
        result.alreadyApplied.push(outcome.taskId);
      } else {
        result.skippedStale.push(outcome.taskId);
      }
    }

    for (const item of applied) {
      try {
        await this.services.nudges.recordSmartRecovery(item.after.id, true);
      } catch (error) {
        reportNonFatalError('adaptive-nudge-recovery-accepted', error);
      }
      try {
        await this.syncDueReminder(item.before, item.after, 'recovery', { project: false });
      } catch (error) {
        result.projectionFailures.push({
          taskId: item.after.id,
          message: error instanceof Error ? error.message : 'Reminder projection repair failed.',
        });
      }
      try {
        const reconciliation = await this.syncTaskProjections(item.after.id, 'recovery');
        this.addProjectionFailures(result, item.after.id, reconciliation);
      } catch (error) {
        result.projectionFailures.push({
          taskId: item.after.id,
          message: error instanceof Error ? error.message : 'Reminder projection repair failed.',
        });
      }
      await this.replanAdaptiveNudges(item.after.id, 'recovery');
    }

    if (applied.length > 0) {
      result.receipt = createReceipt({
        risk: 'BULK_MUTATION',
        action: 'recovery.apply',
        entityType: 'task',
        entityId: planId,
        summary: `Recovered ${applied.length} ${applied.length === 1 ? 'task' : 'tasks'}`,
        undo: {
          kind: RECOVERY_UNDO_KIND,
          payload: {
            items: applied.map(({ selection, after }) => ({
              taskId: after.id,
              appliedUpdatedAt: after.updatedAt,
              applied: this.scheduleFromTask(after),
              previous: selection.proposal.previous,
            })),
          },
        },
      });
    }
    return result;
  }

  /** Explicit, version-protected Undo for a Recovery batch receipt. */
  async undoRecovery(receipt: import('@/domain/receipts').ActionReceipt): Promise<RecoveryApplyResult> {
    const items = getRecoveryUndoItems(receipt);
    if (!items) throw new Error('Recovery undo payload is invalid or no longer available.');
    const result = this.recoveryResult(receipt.entityId);
    let outcomes;
    try {
      outcomes = await this.services.tasks.applyRecoverySchedules(
        items.map((item) => ({
          taskId: item.taskId,
          expectedUpdatedAt: item.appliedUpdatedAt,
          schedule: item.previous,
        })),
        'recovery_undo',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recovery Undo failed.';
      result.failed.push(...items.map((item) => ({ taskId: item.taskId, message })));
      return result;
    }

    for (const outcome of outcomes) {
      const item = items.find((candidate) => candidate.taskId === outcome.taskId);
      if (!item) continue;
      if (outcome.applied && outcome.before && outcome.after) {
        result.applied.push(outcome.taskId);
        try {
          await this.syncDueReminder(outcome.before, outcome.after, 'recovery_undo', { project: false });
        } catch (error) {
          result.projectionFailures.push({
            taskId: outcome.taskId,
            message: error instanceof Error ? error.message : 'Reminder projection repair failed.',
          });
        }
        try {
          const reconciliation = await this.syncTaskProjections(outcome.taskId, 'recovery-undo');
          this.addProjectionFailures(result, outcome.taskId, reconciliation);
        } catch (error) {
          result.projectionFailures.push({
            taskId: outcome.taskId,
            message: error instanceof Error ? error.message : 'Reminder projection repair failed.',
          });
        }
        await this.replanAdaptiveNudges(outcome.taskId, 'recovery-undo');
      } else if (
        outcome.current &&
        !outcome.current.completed &&
        !outcome.current.deletedAt &&
        outcome.current.dueDate === item.previous.dueDate &&
        outcome.current.dueTime === item.previous.dueTime &&
        outcome.current.dueTimezone === item.previous.dueTimezone &&
        outcome.current.dueSemantics === item.previous.dueSemantics
      ) {
        result.alreadyApplied.push(outcome.taskId);
      } else {
        result.skippedStale.push(outcome.taskId);
      }
    }
    return result;
  }

  private async rollbackDueReminder(change: DueReminderChange): Promise<void> {
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
        }, 'command_rollback');
    }
  }

  async createTask(input: CreateTaskInput, source = 'manual') {
    const result = await this.services.tasks.createTask(input, source);
    try {
      await this.syncDueReminder(null, result.value, source);
      await this.replanAdaptiveNudges(result.value.id, 'create');
      return result;
    } catch (error) {
      await this.services.tasks.deleteTask(result.value.id, 'command_rollback').catch(() => undefined);
      throw error;
    }
  }

  async createCapturedTask(input: CreateTaskInput, capture: CaptureCommitContext) {
    const result = await this.services.tasks.createCapturedTask(input, capture);
    // Native projection is disposable. ReminderService persists dirty state and
    // classifies native projection failure without rolling the task back.
    await this.syncDueReminder(null, result.value, capture.ingress);
    await this.replanAdaptiveNudges(result.value.id, 'capture-create');
    return result;
  }

  async updateTask(id: string, input: UpdateTaskInput, source = 'manual') {
    const before = await this.services.tasks.getTask(id);
    if (!before) throw new Error('Task not found.');
    const result = await this.services.tasks.updateTask(id, input, source);
    let reminderChange: DueReminderChange = { kind: 'none' };
    try {
      await this.services.repos.reminders.markTaskDirty(id);
      reminderChange = await this.syncDueReminder(before, result.value, source);
      await this.syncTaskProjections(id, 'task-update');
      const scheduleChanged = before.dueDate !== result.value.dueDate
        || before.dueTime !== result.value.dueTime
        || before.dueTimezone !== result.value.dueTimezone
        || before.dueSemantics !== result.value.dueSemantics;
      if (scheduleChanged) {
        try {
          await this.services.nudges.recordTaskRescheduled(result.value, source);
        } catch (error) {
          reportNonFatalError('adaptive-nudge-reschedule', error);
        }
      }
      await this.replanAdaptiveNudges(id, 'task-update');
      return result;
    } catch (error) {
      await this.rollbackDueReminder(reminderChange).catch(() => undefined);
      await this.services.tasks.updateTask(id, {
        title: before.title,
        notes: before.notes,
        priority: before.priority,
        projectId: before.projectId,
        dueDate: before.dueDate,
        dueTime: before.dueTime,
        dueTimezone: before.dueTimezone,
        dueSemantics: before.dueSemantics,
      }, 'command_rollback').catch(() => undefined);
      throw error;
    }
  }

  /** Create from the manual editor with optional recurrence. */
  async createTaskEditorState(input: CreateTaskEditorStateInput, source = 'manual') {
    if (input.recurrence && !input.task.dueDate) {
      throw new Error('Recurring reminders require a scheduled date.');
    }

    if (input.recurrence) {
      const result = await this.createRecurringTask({
        task: input.task,
        recurrence: input.recurrence,
      }, source);
      return {
        value: result.task,
        recurrence: result.rule,
        receipt: result.receipt,
      };
    }

    const result = await this.createTask(input.task, source);
    return {
      value: result.value,
      recurrence: null,
      receipt: result.receipt,
    };
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

    // Use TaskService directly here because this method owns the combined
    // task/reminder/recurrence compensation as one higher-level operation.
    const taskResult = await this.services.tasks.updateTask(id, input.task, source);
    let reminderChange: DueReminderChange = { kind: 'none' };
    try {
      await this.services.repos.reminders.markTaskDirty(id);
      reminderChange = await this.syncDueReminder(beforeTask, taskResult.value, source);
      await this.syncTaskProjections(id, 'editor-update');
      const scheduleChanged = beforeTask.dueDate !== taskResult.value.dueDate
        || beforeTask.dueTime !== taskResult.value.dueTime
        || beforeTask.dueTimezone !== taskResult.value.dueTimezone
        || beforeTask.dueSemantics !== taskResult.value.dueSemantics;
      if (scheduleChanged) {
        try {
          await this.services.nudges.recordTaskRescheduled(taskResult.value, source);
        } catch (error) {
          reportNonFatalError('adaptive-nudge-editor-reschedule', error);
        }
      }
      await this.replanAdaptiveNudges(id, 'editor-update');

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
      await this.rollbackDueReminder(reminderChange).catch(() => undefined);
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
    await this.recordTaskCompleted(result.value, source);
    await this.syncTaskProjections(id, 'task-complete');
    const recurrence = await this.services.recurrence.advanceAfterCompletion(result.value, source);
    if (!recurrence) return result;

    await this.replanAdaptiveNudges(recurrence.nextTask.id, 'recurrence-next');

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
      if (recurringUndo) {
        await this.syncTaskProjections(id, 'task-reopen');
        await this.replanAdaptiveNudges(id, 'recurring-undo');
        return recurringUndo;
      }
    }
    const result = await this.services.tasks.reopenTask(id, source);
    await this.syncTaskProjections(id, 'task-reopen');
    await this.replanAdaptiveNudges(id, 'reopen');
    return result;
  }

  rescheduleTask(id: string, input: RescheduleTaskInput, source = 'manual') {
    return this.updateTask(id, {
      dueDate: input.dueDate,
      dueTime: input.dueTime,
      dueTimezone: input.dueTimezone,
      dueSemantics: input.dueSemantics,
    }, source);
  }

  async deleteTask(id: string, source = 'manual') {
    const result = await this.services.tasks.deleteTask(id, source);
    await this.syncTaskProjections(id, 'task-delete');
    await this.replanAdaptiveNudges(id, 'delete');
    return result;
  }

  async restoreTask(id: string, source = 'undo') {
    const result = await this.services.tasks.restoreTask(id, source);
    await this.syncTaskProjections(id, 'task-restore');
    await this.replanAdaptiveNudges(id, 'restore');
    return result;
  }

  createRecurrenceRule(input: CreateRecurrenceRuleInput) {
    return this.services.recurrence.createRule(input);
  }

  async createRecurringTask(input: CreateRecurringTaskInput, source = 'manual') {
    const result = await this.services.recurrence.createRecurringTask(input, source);
    try {
      await this.syncDueReminder(null, result.task, source);
      await this.replanAdaptiveNudges(result.task.id, 'recurring-create');
      return result;
    } catch (error) {
      await this.services.tasks.deleteTask(result.task.id, 'command_rollback').catch(() => undefined);
      throw error;
    }
  }

  updateRecurrenceRule(id: string, input: UpdateRecurrenceRuleInput) {
    return this.services.recurrence.updateRule(id, input);
  }

  stopRecurrenceRule(id: string) {
    return this.services.recurrence.stopRule(id);
  }

  async scheduleReminder(input: ScheduleReminderInput, source = 'manual') {
    const result = await this.services.reminders.scheduleReminder(input, source);
    if (result.value.kind !== 'adaptive_followup') {
      await this.replanAdaptiveNudges(input.taskId, 'reminder-schedule');
    }
    return result;
  }

  async rescheduleReminder(id: string, input: RescheduleReminderInput, source = 'manual') {
    const before = await this.services.reminders.getReminder(id);
    const result = await this.services.reminders.rescheduleReminder(id, input);
    if (source !== 'notification_action' && result.value.kind !== 'adaptive_followup' && before) {
      await this.replanAdaptiveNudges(before.taskId, 'reminder-reschedule');
    }
    return result;
  }

  async setAdaptiveNudgesEnabled(enabled: boolean): Promise<void> {
    await this.services.nudges.setEnabled(enabled);
  }

  async resetAdaptiveNudgeLearning(): Promise<void> {
    await this.services.nudges.resetLearning();
  }

  /** Explicit attention intent. This does not modify task scheduling fields. */
  async focusNow(taskId: string): Promise<void> {
    await this.services.attention.focusNow(taskId);
  }

  /** Clear explicit attention intent without changing the task itself. */
  async clearFocus(): Promise<void> {
    await this.services.attention.clearFocus();
  }

  async cancelReminder(id: string) {
    const before = await this.services.reminders.getReminder(id);
    const result = await this.services.reminders.cancelReminder(id);
    if (result.value.kind !== 'adaptive_followup' && before) {
      await this.replanAdaptiveNudges(before.taskId, 'reminder-cancel');
    }
    return result;
  }
}
