import type { Reminder, ReminderTimingPrecision } from '@/domain/entities';
import type { RemindersRepository } from '@/db/repositories/remindersRepository';
import type { TasksRepository } from '@/db/repositories/tasksRepository';
import { getDeviceTimeZone } from '@/temporal/localCalendar';
import { localDateTimeInZoneToDate } from '@/temporal/resolve';
import {
  AETHER_NOTIFICATION_CATEGORY,
  configureNotificationActionCategory,
} from './notificationActions';
import {
  assertTimingCapability,
  defaultNotificationCapabilities,
  type NotificationCapabilities,
} from './notificationCapabilities';
import {
  NotificationError,
  toNotificationError,
} from './errors';

export interface LocalNotificationAdapter {
  list(): Promise<{ identifier: string; reminderId?: string }[]>;
  schedule(input: {
    reminderId: string;
    taskId: string;
    title: string;
    date: Date;
    timingPrecision: ReminderTimingPrecision;
  }): Promise<string>;
  cancel(identifier: string): Promise<void>;
  getCapabilities?: () => Promise<NotificationCapabilities>;
}

const ANDROID_REMINDER_CHANNEL_ID = 'aether-reminders';

async function ensureAndroidReminderChannel(): Promise<void> {
  const Notifications = await import('expo-notifications');
  const { Platform } = await import('react-native');
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_REMINDER_CHANNEL_ID, {
      name: 'AETHER Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  } catch (error) {
    throw new NotificationError(
      'CHANNEL_UNAVAILABLE',
      'Reminder notifications are unavailable because their Android channel could not be created.',
      true,
      error,
    );
  }
}

async function getExpoNotificationCapabilities(): Promise<NotificationCapabilities> {
  const Notifications = await import('expo-notifications');
  const { Platform } = await import('react-native');
  await ensureAndroidReminderChannel();

  const permissions = await Notifications.getPermissionsAsync();
  const permission = permissions.granted
    ? 'granted'
    : permissions.canAskAgain === false
      ? 'denied'
      : 'undetermined';

  const androidVersion = Number(Platform.Version);
  const exactTiming = Platform.OS !== 'android'
    || !Number.isFinite(androidVersion)
    || androidVersion < 31
    ? 'available'
    : 'unknown';

  return {
    permission,
    channel: 'available',
    exactTiming,
  };
}

export const expoLocalNotificationAdapter: LocalNotificationAdapter = {
  async list() {
    const Notifications = await import('expo-notifications');
    return (await Notifications.getAllScheduledNotificationsAsync()).map((item) => ({
      identifier: item.identifier,
      reminderId: typeof item.content.data?.reminderId === 'string'
        ? item.content.data.reminderId
        : undefined,
    }));
  },
  async schedule(input) {
    const Notifications = await import('expo-notifications');
    await ensureAndroidReminderChannel();
    const capabilities = await getExpoNotificationCapabilities();
    assertTimingCapability(input.timingPrecision, capabilities);

    const permissions = capabilities.permission === 'granted'
      ? { granted: true }
      : await Notifications.requestPermissionsAsync();
    if (!permissions.granted) {
      throw new NotificationError(
        'PERMISSION_DENIED',
        'Notifications are disabled. Enable them in system settings, then retry.',
      );
    }

    try {
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: 'AETHER Reminder',
          body: input.title,
          categoryIdentifier: AETHER_NOTIFICATION_CATEGORY,
          data: { reminderId: input.reminderId, taskId: input.taskId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: input.date,
          channelId: ANDROID_REMINDER_CHANNEL_ID,
        },
      });
    } catch (error) {
      throw toNotificationError(
        error,
        'PROJECTION_FAILED',
        'This reminder could not be scheduled on this device.',
      );
    }
  },
  async cancel(identifier) {
    const Notifications = await import('expo-notifications');
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch (error) {
      throw toNotificationError(
        error,
        'NATIVE_NOTIFICATION_MISSING',
        'The device notification could not be cancelled.',
      );
    }
  },
  getCapabilities: getExpoNotificationCapabilities,
};

export function resolveReminderNotificationDate(
  reminder: Reminder,
  deviceTimezone: string | undefined = getDeviceTimeZone(),
): Date {
  if (!reminder.scheduledDate) {
    throw new NotificationError('INVALID_TRIGGER', 'Reminder has no scheduled date.');
  }
  const timezone = reminder.semantics === 'fixed'
    ? (reminder.timezone ?? deviceTimezone)
    : deviceTimezone;
  if (!timezone) {
    const [year, month, day] = reminder.scheduledDate.split('-').map(Number);
    const [hour, minute] = (reminder.scheduledTime ?? '09:00').split(':').map(Number);
    const local = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (!Number.isFinite(local.getTime())) {
      throw new NotificationError('INVALID_TRIGGER', 'Reminder date is invalid.');
    }
    return local;
  }
  try {
    return localDateTimeInZoneToDate(
      reminder.scheduledDate,
      reminder.scheduledTime ?? '09:00',
      timezone,
    );
  } catch (error) {
    throw new NotificationError(
      'INVALID_TRIGGER',
      'Reminder time is invalid for its timezone.',
      false,
      error,
    );
  }
}

export type ProjectionResult = 'scheduled' | 'cancelled' | 'skipped';

function failureState(code: string): 'failed' | 'blocked' | 'missing' {
  if (code === 'PERMISSION_DENIED' || code === 'CHANNEL_UNAVAILABLE' || code === 'EXACT_TIMING_UNAVAILABLE') {
    return 'blocked';
  }
  if (code === 'NATIVE_NOTIFICATION_MISSING') return 'missing';
  return 'failed';
}

/** Single-reminder native projection. Batch orchestration lives in reconciliation service. */
export class LocalNotificationProjection {
  constructor(
    private readonly reminders: RemindersRepository,
    private readonly tasks: TasksRepository,
    private readonly adapter: LocalNotificationAdapter = expoLocalNotificationAdapter,
  ) {}

  getCapabilities(): Promise<NotificationCapabilities> {
    return this.adapter.getCapabilities?.() ?? Promise.resolve(defaultNotificationCapabilities());
  }

  /**
   * Compatibility wrapper for callers that still expect projection-owned repair.
   * New code should use NotificationReconciliationService directly.
   */
  async reconcile(): Promise<{
    repaired: number;
    failed: number;
    failures: unknown[];
  }> {
    const { NotificationReconciliationService } = await import('./notificationReconciliation');
    const result = await new NotificationReconciliationService(
      this.reminders,
      this.tasks,
      this,
      this.adapter,
    ).reconcile({ mode: 'full', reason: 'legacy-projection' });
    return {
      repaired: result.repaired,
      failed: result.failed,
      failures: result.failures,
    };
  }

  async project(reminder: Reminder): Promise<ProjectionResult> {
    const revision = reminder.projectionRevision;
    try {
      const claimed = await this.reminders.recordProjectionAttempt(reminder.id, revision);
      if (!claimed) return 'skipped';

      if (reminder.nativeNotificationId) {
        try {
          await this.adapter.cancel(reminder.nativeNotificationId);
        } catch (error) {
          const cancellationError = toNotificationError(
            error,
            'PROJECTION_FAILED',
            'The previous device notification could not be cancelled.',
          );
          // Missing native state is already absent; continue repairing projection.
          if (cancellationError.code !== 'NATIVE_NOTIFICATION_MISSING') throw cancellationError;
        }
      }

      if (!reminder.enabled) {
        const saved = await this.reminders.recordProjectionSuccess(
          reminder.id,
          revision,
          null,
          'not_required',
        );
        return saved ? 'cancelled' : 'skipped';
      }

      const task = await this.tasks.getById(reminder.taskId);
      if (!task || task.completed) {
        const saved = await this.reminders.recordProjectionSuccess(
          reminder.id,
          revision,
          null,
          'not_required',
        );
        return saved ? 'cancelled' : 'skipped';
      }

      const nativeId = await this.adapter.schedule({
        reminderId: reminder.id,
        taskId: reminder.taskId,
        title: task.title,
        date: resolveReminderNotificationDate(reminder),
        timingPrecision: reminder.timingPrecision,
      });
      const saved = await this.reminders.recordProjectionSuccess(
        reminder.id,
        revision,
        nativeId,
        'scheduled',
      );
      if (!saved) {
        await this.adapter.cancel(nativeId).catch(() => undefined);
        return 'skipped';
      }
      return 'scheduled';
    } catch (error) {
      const notificationError = toNotificationError(
        error,
        'PROJECTION_FAILED',
        'This reminder could not be synchronized with device notifications.',
      );
      try {
        await this.reminders.recordProjectionFailure(reminder.id, revision, {
          code: notificationError.code,
          message: notificationError.message,
          state: failureState(notificationError.code),
        });
      } catch (persistenceError) {
        throw new NotificationError(
          'PERSISTENCE_FAILED',
          'Notification recovery state could not be saved.',
          true,
          persistenceError,
        );
      }
      throw notificationError;
    }
  }
}

export const NOTIFICATION_RECONCILIATION_BATCH_SIZE = 8;

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
    await ensureAndroidReminderChannel();
    await configureNotificationActionCategory();
  } catch (error) {
    throw toNotificationError(
      error,
      'CONFIGURATION_FAILED',
      'Local notifications could not be initialized. Try again.',
    );
  }
}
