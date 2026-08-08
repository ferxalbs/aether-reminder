import type { Reminder, TemporalSemantics } from '@/domain/entities';
import { createReceipt, type ActionReceipt } from '@/domain/receipts';
import {
  RemindersRepository,
  type CreateReminderInput,
} from '@/db/repositories/remindersRepository';
import { assertResolvedDateTime } from '@/temporal/resolve';
import { LocalNotificationProjection } from '@/services/notifications/localNotificationProjection';

export interface ScheduleReminderInput {
  taskId: string;
  scheduledDate: string;
  scheduledTime?: string | null;
  timezone?: string | null;
  semantics?: TemporalSemantics;
  enabled?: boolean;
}

export interface RescheduleReminderInput {
  scheduledDate: string;
  scheduledTime?: string | null;
  timezone?: string | null;
  semantics?: TemporalSemantics;
}

export interface ReminderMutationResult {
  value: Reminder;
  receipt: ActionReceipt;
  /**
   * Slice 6 will project reminders to OS notifications.
   * Domain scheduling only until then — never claim OS delivery.
   */
  osNotificationProjection: 'scheduled' | 'cancelled' | 'failed';
  projectionError?: string;
}

/**
 * Domain service for reminders. Operates on DB state only until Slice 6.
 */
export class ReminderService {
  constructor(
    private readonly reminders: RemindersRepository,
    private readonly projection: LocalNotificationProjection,
  ) {}

  private async project(value: Reminder): Promise<Pick<ReminderMutationResult, 'osNotificationProjection' | 'projectionError'>> {
    try {
      return { osNotificationProjection: await this.projection.project(value) };
    } catch (error) {
      return { osNotificationProjection: 'failed', projectionError: error instanceof Error ? error.message : 'Notification projection failed.' };
    }
  }

  async listReminders(options?: { taskId?: string; enabledOnly?: boolean }): Promise<Reminder[]> {
    if (options?.taskId) {
      const list = await this.reminders.listForTask(options.taskId);
      return options.enabledOnly ? list.filter((r) => r.enabled) : list;
    }
    if (options?.enabledOnly) return this.reminders.listEnabled();
    return this.reminders.listAll();
  }

  async getReminder(id: string): Promise<Reminder | null> {
    return this.reminders.getById(id);
  }

  async scheduleReminder(input: ScheduleReminderInput, source = 'manual'): Promise<ReminderMutationResult> {
    const resolved = assertResolvedDateTime({
      date: input.scheduledDate,
      time: input.scheduledTime,
      timezone: input.timezone,
      semantics: input.semantics,
    });

    const createInput: CreateReminderInput = {
      taskId: input.taskId,
      scheduledDate: resolved.date,
      scheduledTime: resolved.time,
      timezone: resolved.timezone,
      semantics: resolved.semantics,
      enabled: input.enabled,
    };

    const reminder = await this.reminders.create(createInput);
    const projection = await this.project(reminder);
    return {
      value: reminder,
      ...projection,
      receipt: createReceipt({
        risk: 'REVERSIBLE_WRITE',
        action: 'reminders.schedule',
        entityType: 'reminder',
        entityId: reminder.id,
        summary: projection.osNotificationProjection === 'scheduled'
          ? `Scheduled reminder for task ${input.taskId} on ${resolved.date}`
          : `Saved reminder for task ${input.taskId}, but local notification delivery failed`,
        undo: { kind: 'reminder.cancel', payload: { reminderId: reminder.id } },
      }),
    };
  }

  async rescheduleReminder(
    id: string,
    input: RescheduleReminderInput
  ): Promise<ReminderMutationResult> {
    const resolved = assertResolvedDateTime({
      date: input.scheduledDate,
      time: input.scheduledTime,
      timezone: input.timezone,
      semantics: input.semantics,
    });
    const before = await this.reminders.getById(id);
    const reminder = await this.reminders.updateSchedule(id, {
      scheduledDate: resolved.date,
      scheduledTime: resolved.time,
      timezone: resolved.timezone,
      semantics: resolved.semantics,
    });
    const projection = await this.project(reminder);
    return {
      value: reminder,
      ...projection,
      receipt: createReceipt({
        risk: 'REVERSIBLE_WRITE',
        action: 'reminders.reschedule',
        entityType: 'reminder',
        entityId: reminder.id,
        summary: projection.osNotificationProjection === 'scheduled'
          ? `Rescheduled reminder to ${resolved.date}`
          : `Updated reminder schedule, but local notification delivery failed`,
        undo: before
          ? {
              kind: 'reminder.reschedule',
              payload: {
                reminderId: id,
                scheduledDate: before.scheduledDate,
                scheduledTime: before.scheduledTime,
                timezone: before.timezone,
                semantics: before.semantics,
              },
            }
          : undefined,
      }),
    };
  }

  /** Disables reminder in domain DB. Does not touch OS notifications (Slice 6). */
  async cancelReminder(id: string): Promise<ReminderMutationResult> {
    const reminder = await this.reminders.setEnabled(id, false);
    const projection = await this.project(reminder);
    return {
      value: reminder,
      ...projection,
      receipt: createReceipt({
        risk: 'REVERSIBLE_WRITE',
        action: 'reminders.cancel',
        entityType: 'reminder',
        entityId: reminder.id,
        summary: projection.osNotificationProjection === 'cancelled'
          ? `Cancelled reminder ${id}`
          : `Disabled reminder ${id}, but cancelling its local notification failed`,
        undo: { kind: 'reminder.enable', payload: { reminderId: id } },
      }),
    };
  }
}
