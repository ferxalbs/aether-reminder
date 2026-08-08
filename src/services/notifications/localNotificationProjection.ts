import type { Reminder } from '@/domain/entities';
import type { RemindersRepository } from '@/db/repositories/remindersRepository';
import type { TasksRepository } from '@/db/repositories/tasksRepository';
import { getDeviceTimeZone } from '@/temporal/localCalendar';
import { localDateTimeInZoneToDate } from '@/temporal/resolve';
import {
  NotificationError,
  toNotificationError,
} from './errors';

export interface LocalNotificationAdapter {
  list(): Promise<{ identifier: string; reminderId?: string }[]>;
  schedule(input: { reminderId: string; title: string; date: Date }): Promise<string>;
  cancel(identifier: string): Promise<void>;
}

export const expoLocalNotificationAdapter: LocalNotificationAdapter = {
  async list() {
    const Notifications = await import('expo-notifications');
    return (await Notifications.getAllScheduledNotificationsAsync()).map((item) => ({
      identifier: item.identifier,
      reminderId: typeof item.content.data?.reminderId === 'string' ? item.content.data.reminderId : undefined,
    }));
  },
  async schedule(input) {
    const Notifications = await import('expo-notifications');
    const { Platform } = await import('react-native');
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('aether-reminders', {
        name: 'AETHER Reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const permissions = await Notifications.getPermissionsAsync();
    const granted = permissions.granted ? permissions : await Notifications.requestPermissionsAsync();
    if (!granted.granted) {
      throw new NotificationError(
        'PERMISSION_DENIED',
        'Notifications are disabled. Enable them in system settings, then retry.',
      );
    }
    return Notifications.scheduleNotificationAsync({
      content: { title: 'AETHER Reminder', body: input.title, data: { reminderId: input.reminderId } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: input.date,
        channelId: 'aether-reminders',
      },
    });
  },
  async cancel(identifier) {
    const Notifications = await import('expo-notifications');
    await Notifications.cancelScheduledNotificationAsync(identifier);
  },
};

export function resolveReminderNotificationDate(
  reminder: Reminder,
  deviceTimezone: string | undefined = getDeviceTimeZone(),
): Date {
  if (!reminder.scheduledDate) throw new Error('Reminder has no scheduled date.');
  const timezone = reminder.semantics === 'fixed'
    ? (reminder.timezone ?? deviceTimezone)
    : deviceTimezone;
  if (!timezone) {
    const [year, month, day] = reminder.scheduledDate.split('-').map(Number);
    const [hour, minute] = (reminder.scheduledTime ?? '09:00').split(':').map(Number);
    const local = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (!Number.isFinite(local.getTime())) throw new Error('Reminder date is invalid.');
    return local;
  }
  return localDateTimeInZoneToDate(
    reminder.scheduledDate,
    reminder.scheduledTime ?? '09:00',
    timezone,
  );
}

export class LocalNotificationProjection {
  constructor(
    private readonly reminders: RemindersRepository,
    private readonly tasks: TasksRepository,
    private readonly adapter: LocalNotificationAdapter = expoLocalNotificationAdapter,
  ) {}

  async project(reminder: Reminder): Promise<'scheduled' | 'cancelled'> {
    try {
      if (reminder.nativeNotificationId) await this.adapter.cancel(reminder.nativeNotificationId);
      if (!reminder.enabled) {
        await this.reminders.setProjection(reminder.id, null, null);
        return 'cancelled';
      }
      const task = await this.tasks.getById(reminder.taskId);
      if (!task) throw new Error('Reminder task no longer exists.');
      const nativeId = await this.adapter.schedule({
        reminderId: reminder.id,
        title: task.title,
        date: resolveReminderNotificationDate(reminder),
      });
      await this.reminders.setProjection(reminder.id, nativeId, null);
      return 'scheduled';
    } catch (error) {
      const notificationError = toNotificationError(
        error,
        'PROJECTION_FAILED',
        'This reminder could not be synchronized with device notifications.',
      );
      try {
        await this.reminders.setProjection(reminder.id, null, notificationError.message);
      } catch (projectionError) {
        throw toNotificationError(
          projectionError,
          'PROJECTION_FAILED',
          'The notification synchronization state could not be saved.',
        );
      }
      throw notificationError;
    }
  }

  async reconcile(): Promise<NotificationReconciliationResult> {
    const native = await this.adapter.list();
    const nativeByReminder = new Map(native.filter((n) => n.reminderId).map((n) => [n.reminderId!, n.identifier]));
    let repaired = 0;
    let failed = 0;
    const failures: NotificationReconciliationFailure[] = [];
    const reminders = await this.reminders.listAll();
    const reminderIds = new Set(reminders.map((reminder) => reminder.id));
    for (const item of native) {
      if (!item.reminderId || reminderIds.has(item.reminderId)) continue;
      try {
        await this.adapter.cancel(item.identifier);
        repaired += 1;
      } catch (error) {
        failed += 1;
        failures.push({
          kind: 'orphan_cancel',
          error: toNotificationError(
            error,
            'RECONCILIATION_FAILED',
            'An obsolete device notification could not be removed.',
          ),
        });
      }
    }
    for (const reminder of reminders) {
      const actualId = nativeByReminder.get(reminder.id);
      if (!reminder.enabled) {
        const id = actualId ?? reminder.nativeNotificationId;
        try {
          if (id) {
            await this.adapter.cancel(id);
            repaired += 1;
          }
          await this.reminders.setProjection(reminder.id, null, null);
        } catch (error) {
          failed += 1;
          failures.push({
            kind: 'disabled_cancel',
            reminderId: reminder.id,
            error: toNotificationError(
              error,
              'RECONCILIATION_FAILED',
              'A disabled reminder could not be removed from device notifications.',
            ),
          });
        }
        continue;
      }
      if (actualId && actualId === reminder.nativeNotificationId && !reminder.projectionError) continue;
      try {
        await this.project({ ...reminder, nativeNotificationId: actualId ?? reminder.nativeNotificationId });
        repaired += 1;
      } catch (error) {
        failed += 1;
        failures.push({
          kind: 'reminder_projection',
          reminderId: reminder.id,
          error: toNotificationError(
            error,
            'RECONCILIATION_FAILED',
            'A reminder could not be scheduled on this device.',
          ),
        });
      }
    }
    return { repaired, failed, failures };
  }
}

export type NotificationReconciliationFailureKind =
  | 'orphan_cancel'
  | 'disabled_cancel'
  | 'reminder_projection';

export interface NotificationReconciliationFailure {
  kind: NotificationReconciliationFailureKind;
  reminderId?: string;
  error: NotificationError;
}

export interface NotificationReconciliationResult {
  repaired: number;
  failed: number;
  failures: NotificationReconciliationFailure[];
}

export async function configureLocalNotifications(): Promise<void> {
  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (error) {
    throw toNotificationError(
      error,
      'CONFIGURATION_FAILED',
      'Local notifications could not be initialized. Try again.',
    );
  }
}
