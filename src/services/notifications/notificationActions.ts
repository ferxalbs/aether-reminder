import type { AetherCore } from '@/core/aetherCore';
import type { Reminder } from '@/domain/entities';
import {
  addLocalCalendarDays,
  getLocalDateString,
  getLocalTimeString,
  getZonedDateTimeStrings,
} from '@/temporal/localCalendar';
import { reportNonFatalError } from '@/lib/nonFatalError';
import type { NotificationActionReceipt } from '@/db/repositories/notificationActionReceiptsRepository';
import { NotificationError } from './errors';

export const AETHER_NOTIFICATION_CATEGORY = 'aether_reminder_actions';
export const NOTIFICATION_ACTION_COMPLETE = 'AETHER_COMPLETE';
export const NOTIFICATION_ACTION_SNOOZE = 'AETHER_SNOOZE_10M';
export const NOTIFICATION_ACTION_TOMORROW = 'AETHER_TOMORROW';

export type NotificationResponseLike = {
  actionIdentifier: string;
  notification: {
    request: {
      identifier: string;
      content: { data?: Record<string, unknown> };
    };
  };
};

type ActionTarget = {
  scheduledDate: string;
  scheduledTime: string;
  timezone: string | null;
  semantics: Reminder['semantics'];
};

type ActionProcessingResult = 'completed' | 'ignored' | 'failed';

export async function configureNotificationActionCategory(): Promise<void> {
  const Notifications = await import('expo-notifications');
  await Notifications.setNotificationCategoryAsync(
    AETHER_NOTIFICATION_CATEGORY,
    [
      {
        identifier: NOTIFICATION_ACTION_COMPLETE,
        buttonTitle: 'Complete',
        options: {
          opensAppToForeground: false,
          isAuthenticationRequired: false,
          isDestructive: false,
        },
      },
      {
        identifier: NOTIFICATION_ACTION_SNOOZE,
        buttonTitle: 'Snooze 10m',
        options: {
          opensAppToForeground: false,
          isAuthenticationRequired: false,
          isDestructive: false,
        },
      },
      {
        identifier: NOTIFICATION_ACTION_TOMORROW,
        buttonTitle: 'Tomorrow',
        options: {
          opensAppToForeground: false,
          isAuthenticationRequired: false,
          isDestructive: false,
        },
      },
    ],
  );
}

function actionCalendarValues(reminder: Reminder, instant: Date): { date: string; time: string } {
  if (reminder.semantics === 'fixed' && reminder.timezone) {
    try {
      return getZonedDateTimeStrings(instant, reminder.timezone);
    } catch (error) {
      throw new NotificationError(
        'INVALID_TRIGGER',
        'Reminder timezone is invalid for this notification action.',
        false,
        error,
      );
    }
  }
  return {
    date: getLocalDateString(instant),
    time: getLocalTimeString(instant),
  };
}

function calculateActionTarget(
  actionIdentifier: string,
  reminder: Reminder,
  now: Date,
): ActionTarget | null {
  switch (actionIdentifier) {
    case NOTIFICATION_ACTION_SNOOZE: {
      const values = actionCalendarValues(reminder, new Date(now.getTime() + 10 * 60_000));
      return {
        scheduledDate: values.date,
        scheduledTime: values.time,
        timezone: reminder.timezone,
        semantics: reminder.semantics,
      };
    }
    case NOTIFICATION_ACTION_TOMORROW: {
      const values = actionCalendarValues(reminder, now);
      return {
        scheduledDate: addLocalCalendarDays(values.date, 1),
        scheduledTime: reminder.scheduledTime ?? values.time,
        timezone: reminder.timezone,
        semantics: reminder.semantics,
      };
    }
    default:
      return null;
  }
}

function getActionReceiptsRepository(core: AetherCore) {
  return core.services.repos?.notificationActions;
}

function responseKey(response: NotificationResponseLike): string {
  return `${response.notification.request.identifier}:${response.actionIdentifier}`;
}

function targetFromReceipt(receipt: NotificationActionReceipt): ActionTarget | null {
  if (!receipt.targetDate || !receipt.targetTime || !receipt.targetSemantics) return null;
  return {
    scheduledDate: receipt.targetDate,
    scheduledTime: receipt.targetTime,
    timezone: receipt.targetTimezone,
    semantics: receipt.targetSemantics,
  };
}

export async function handleNotificationActionResponse(
  response: NotificationResponseLike,
  core: AetherCore,
  now: Date = new Date(),
): Promise<boolean> {
  const reminderId = response.notification.request.content.data?.reminderId;
  if (typeof reminderId !== 'string' || !reminderId) return false;
  if (![NOTIFICATION_ACTION_COMPLETE, NOTIFICATION_ACTION_SNOOZE, NOTIFICATION_ACTION_TOMORROW]
    .includes(response.actionIdentifier)) return false;

  const reminder = await core.services.reminders.getReminder(reminderId);
  if (!reminder) return false;

  const target = calculateActionTarget(response.actionIdentifier, reminder, now);
  const repository = getActionReceiptsRepository(core);
  let receipt: NotificationActionReceipt | null = null;
  if (repository) {
    try {
      receipt = await repository.claim({
        responseKey: responseKey(response),
        nativeNotificationId: response.notification.request.identifier,
        actionIdentifier: response.actionIdentifier,
        reminderId: reminder.id,
        targetDate: target?.scheduledDate ?? null,
        targetTime: target?.scheduledTime ?? null,
        targetTimezone: target?.timezone ?? null,
        targetSemantics: target?.semantics ?? null,
      });
    } catch (error) {
      throw new NotificationError(
        'PERSISTENCE_FAILED',
        'Notification action could not be recorded locally.',
        true,
        error,
      );
    }
    if (receipt.status === 'completed') return false;
  }

  const persistedTarget = receipt ? targetFromReceipt(receipt) : null;
  const effectiveTarget = persistedTarget ?? target;
  try {
    switch (response.actionIdentifier) {
      case NOTIFICATION_ACTION_COMPLETE:
        await core.commands.completeTask(reminder.taskId, 'notification_action');
        break;
      case NOTIFICATION_ACTION_SNOOZE:
      case NOTIFICATION_ACTION_TOMORROW:
        if (!effectiveTarget) return false;
        await core.commands.rescheduleReminder(reminder.id, effectiveTarget);
        break;
      default:
        return false;
    }
    if (repository && receipt) await repository.markCompleted(receipt.responseKey);
    return true;
  } catch (error) {
    // Leave claimed receipt open so next delivery/restart can retry same target.
    throw error;
  }
}

/**
 * Register foreground/background response handling and consume the last response
 * once after cold launch. Domain mutation stays inside AetherCommandExecutor.
 */
export async function registerNotificationActionListener(
  core: AetherCore,
  onMutation?: () => void | Promise<void>,
): Promise<() => void> {
  const Notifications = await import('expo-notifications');
  const processing = new Set<string>();
  const completed = new Set<string>();

  const process = async (response: NotificationResponseLike): Promise<ActionProcessingResult> => {
    const key = responseKey(response);
    if (processing.has(key) || completed.has(key)) return 'ignored';
    processing.add(key);
    try {
      const mutated = await handleNotificationActionResponse(response, core);
      if (!mutated) return 'ignored';
      completed.add(key);
      try {
        await Notifications.dismissNotificationAsync(response.notification.request.identifier);
      } catch (error) {
        reportNonFatalError('notification-action-dismiss', error);
      }
      await onMutation?.();
      return 'completed';
    } catch (error) {
      reportNonFatalError('notification-action', error);
      return 'failed';
    } finally {
      processing.delete(key);
    }
  };

  const lastResponse = await Notifications.getLastNotificationResponseAsync();
  if (lastResponse) {
    const outcome = await process(lastResponse);
    if (outcome !== 'failed') {
      try {
        await Notifications.clearLastNotificationResponseAsync();
      } catch (error) {
        reportNonFatalError('notification-action-clear', error);
      }
    }
  }

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    void process(response);
  });
  return () => subscription.remove();
}
