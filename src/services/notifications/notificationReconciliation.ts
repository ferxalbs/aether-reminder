import type { Reminder } from '@/domain/entities';
import { AppMetaRepository } from '@/db/repositories/appMetaRepository';
import { RemindersRepository } from '@/db/repositories/remindersRepository';
import { TasksRepository } from '@/db/repositories/tasksRepository';
import {
  LocalNotificationProjection,
  NOTIFICATION_RECONCILIATION_BATCH_SIZE,
  type LocalNotificationAdapter,
} from './localNotificationProjection';
import { NotificationError, toNotificationError } from './errors';

export type NotificationReconciliationMode = 'incremental' | 'full';

export interface NotificationReconciliationOptions {
  mode?: NotificationReconciliationMode;
  taskIds?: readonly string[];
  reason?: string;
  dirtyLimit?: number;
}

export type NotificationReconciliationFailureKind =
  | 'orphan_cancel'
  | 'duplicate_cancel'
  | 'disabled_cancel'
  | 'reminder_projection';

export interface NotificationReconciliationFailure {
  kind: NotificationReconciliationFailureKind;
  reminderId?: string;
  nativeNotificationId?: string;
  error: NotificationError;
}

export interface NotificationReconciliationResult {
  mode: NotificationReconciliationMode;
  reason?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  inspected: number;
  dirtyProcessed: number;
  repaired: number;
  scheduled: number;
  cancelled: number;
  unchanged: number;
  blocked: number;
  missing: number;
  stale: number;
  orphanCancelled: number;
  duplicateCancelled: number;
  failed: number;
  failures: NotificationReconciliationFailure[];
}

interface OperationResult {
  repaired: number;
  scheduled: number;
  cancelled: number;
  unchanged: number;
  blocked: number;
  missing: number;
  stale: number;
  failed: number;
  failures: NotificationReconciliationFailure[];
}

const EMPTY_OPERATION: OperationResult = {
  repaired: 0,
  scheduled: 0,
  cancelled: 0,
  unchanged: 0,
  blocked: 0,
  missing: 0,
  stale: 0,
  failed: 0,
  failures: [],
};

async function mapInBatches<T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let offset = 0; offset < items.length; offset += NOTIFICATION_RECONCILIATION_BATCH_SIZE) {
    const batch = items.slice(offset, offset + NOTIFICATION_RECONCILIATION_BATCH_SIZE);
    results.push(...await Promise.all(batch.map(worker)));
  }
  return results;
}

function addOperation(target: OperationResult, value: OperationResult): void {
  target.repaired += value.repaired;
  target.scheduled += value.scheduled;
  target.cancelled += value.cancelled;
  target.unchanged += value.unchanged;
  target.blocked += value.blocked;
  target.missing += value.missing;
  target.stale += value.stale;
  target.failed += value.failed;
  target.failures.push(...value.failures);
}

function failureFor(
  kind: NotificationReconciliationFailureKind,
  error: unknown,
  fallback: string,
  reminderId?: string,
  nativeNotificationId?: string,
): NotificationReconciliationFailure {
  return {
    kind,
    reminderId,
    nativeNotificationId,
    error: toNotificationError(error, 'RECONCILIATION_FAILED', fallback),
  };
}

/** Explicit incremental/full reconciliation boundary for disposable native projections. */
export class NotificationReconciliationService {
  constructor(
    private readonly reminders: RemindersRepository,
    private readonly tasks: TasksRepository,
    private readonly projection: LocalNotificationProjection,
    private readonly adapter: LocalNotificationAdapter,
    private readonly appMeta?: AppMetaRepository,
  ) {}

  async reconcile(options: NotificationReconciliationOptions = {}): Promise<NotificationReconciliationResult> {
    const mode = options.mode ?? 'incremental';
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const operation: OperationResult = { ...EMPTY_OPERATION, failures: [] };
    let inspected = 0;
    let dirtyProcessed = 0;
    let orphanCancelled = 0;
    let duplicateCancelled = 0;

    const native = mode === 'full' ? await this.adapter.list() : [];
    const nativeByReminder = new Map<string, string[]>();
    for (const item of native) {
      if (!item.reminderId) continue;
      const ids = nativeByReminder.get(item.reminderId) ?? [];
      ids.push(item.identifier);
      nativeByReminder.set(item.reminderId, ids);
    }

    const reminders = options.taskIds?.length
      ? (await Promise.all(options.taskIds.map((taskId) => this.reminders.listForTask(taskId)))).flat()
      : mode === 'full'
        ? await this.reminders.listAll()
        : await this.reminders.listDirty(options.dirtyLimit ?? 100);
    const uniqueReminders = [...new Map(reminders.map((reminder) => [reminder.id, reminder])).values()];
    inspected = uniqueReminders.length;

    if (mode === 'full' && !options.taskIds?.length) {
      const knownReminderIds = new Set(uniqueReminders.map((reminder) => reminder.id));
      const orphanItems = native.filter(
        (item) => item.reminderId !== undefined && !knownReminderIds.has(item.reminderId),
      );
      const orphanResults = await mapInBatches(orphanItems, async (item): Promise<OperationResult> => {
        try {
          await this.adapter.cancel(item.identifier);
          orphanCancelled += 1;
          return { ...EMPTY_OPERATION, repaired: 1, cancelled: 1 };
        } catch (error) {
          return {
            ...EMPTY_OPERATION,
            failed: 1,
            failures: [failureFor(
              'orphan_cancel',
              error,
              'An obsolete device notification could not be removed.',
              undefined,
              item.identifier,
            )],
          };
        }
      });
      for (const result of orphanResults) addOperation(operation, result);
    }

    const reminderResults = await mapInBatches(uniqueReminders, async (reminder) => {
      if (reminder.projectionDirty || options.taskIds?.includes(reminder.taskId)) dirtyProcessed += 1;
      return this.reconcileReminder(reminder, mode, nativeByReminder.get(reminder.id) ?? []);
    });
    for (const result of reminderResults) {
      duplicateCancelled += result.duplicateCancelled;
      addOperation(operation, result.operation);
    }

    const completedAt = new Date().toISOString();
    const result: NotificationReconciliationResult = {
      mode,
      reason: options.reason,
      startedAt,
      completedAt,
      durationMs: Date.now() - startedMs,
      inspected,
      dirtyProcessed,
      repaired: operation.repaired,
      scheduled: operation.scheduled,
      cancelled: operation.cancelled,
      unchanged: operation.unchanged,
      blocked: operation.blocked,
      missing: operation.missing,
      stale: operation.stale,
      orphanCancelled,
      duplicateCancelled,
      failed: operation.failed,
      failures: operation.failures,
    };

    await this.persistResult(result);
    return result;
  }

  async repair(options: Omit<NotificationReconciliationOptions, 'mode'> = {}) {
    return this.reconcile({ ...options, mode: 'full' });
  }

  private async reconcileReminder(
    reminder: Reminder,
    mode: NotificationReconciliationMode,
    actualIds: readonly string[],
  ): Promise<{ operation: OperationResult; duplicateCancelled: number }> {
    const operation: OperationResult = { ...EMPTY_OPERATION, failures: [] };
    let duplicateCancelled = 0;
    const preferredId = actualIds.includes(reminder.nativeNotificationId ?? '')
      ? reminder.nativeNotificationId
      : actualIds[0] ?? null;
    const duplicateIds = actualIds.filter((id) => id !== preferredId);

    if (mode === 'full' && duplicateIds.length) {
      const duplicateResults = await mapInBatches(duplicateIds, async (identifier): Promise<OperationResult> => {
        try {
          await this.adapter.cancel(identifier);
          duplicateCancelled += 1;
          return { ...EMPTY_OPERATION, repaired: 1, cancelled: 1 };
        } catch (error) {
          return {
            ...EMPTY_OPERATION,
            failed: 1,
            failures: [failureFor(
              'duplicate_cancel',
              error,
              'A duplicate device notification could not be removed.',
              reminder.id,
              identifier,
            )],
          };
        }
      });
      for (const result of duplicateResults) addOperation(operation, result);
    }

    const task = await this.tasks.getById(reminder.taskId);
    const required = reminder.enabled && !!task && !task.completed;
    const hasMatchingNative = required
      ? preferredId !== null && preferredId === reminder.nativeNotificationId
      : preferredId === null && reminder.nativeNotificationId === null;
    const canSkip = mode === 'full'
      ? hasMatchingNative
        && reminder.projectionState === 'scheduled'
        && !reminder.projectionDirty
        && !reminder.projectionError
      : !reminder.projectionDirty;

    if (canSkip) {
      operation.unchanged = 1;
      return { operation, duplicateCancelled };
    }

    if (mode === 'full' && !reminder.projectionDirty) {
      await this.reminders.markDirty(reminder.id);
      const refreshed = await this.reminders.getById(reminder.id);
      if (refreshed) {
        return this.reconcileReminder(refreshed, mode, preferredId ? [preferredId] : []);
      }
    }

    const projectionInput = preferredId === null
      ? reminder
      : { ...reminder, nativeNotificationId: preferredId };
    try {
      const result = await this.projection.project(projectionInput);
      if (result === 'scheduled') {
        operation.repaired = 1;
        operation.scheduled = 1;
      } else if (result === 'cancelled') {
        operation.repaired = 1;
        operation.cancelled = 1;
      } else {
        operation.stale = 1;
      }
    } catch (error) {
      const notificationError = toNotificationError(
        error,
        'RECONCILIATION_FAILED',
        required
          ? 'A reminder could not be scheduled on this device.'
          : 'A disabled reminder could not be removed from device notifications.',
      );
      if (notificationError.code === 'EXACT_TIMING_UNAVAILABLE'
        || notificationError.code === 'PERMISSION_DENIED'
        || notificationError.code === 'CHANNEL_UNAVAILABLE') {
        operation.blocked = 1;
      }
      if (notificationError.code === 'NATIVE_NOTIFICATION_MISSING') operation.missing = 1;
      operation.failed = 1;
      operation.failures.push({
        kind: required ? 'reminder_projection' : 'disabled_cancel',
        reminderId: reminder.id,
        error: notificationError,
      });
    }
    return { operation, duplicateCancelled };
  }

  private async persistResult(result: NotificationReconciliationResult): Promise<void> {
    if (!this.appMeta) return;
    try {
      await this.appMeta.set('reliability.last_reconciliation_at', result.completedAt);
      await this.appMeta.set('reliability.last_reconciliation_result', JSON.stringify({
        mode: result.mode,
        reason: result.reason ?? null,
        inspected: result.inspected,
        dirtyProcessed: result.dirtyProcessed,
        repaired: result.repaired,
        scheduled: result.scheduled,
        cancelled: result.cancelled,
        unchanged: result.unchanged,
        blocked: result.blocked,
        missing: result.missing,
        stale: result.stale,
        failed: result.failed,
        durationMs: result.durationMs,
      }));
      await this.appMeta.set(
        'reliability.last_error_category',
        result.failures[0]?.error.code ?? 'NONE',
      );
    } catch (error) {
      throw new NotificationError(
        'PERSISTENCE_FAILED',
        'Notification reconciliation result could not be saved.',
        true,
        error,
      );
    }
  }
}
