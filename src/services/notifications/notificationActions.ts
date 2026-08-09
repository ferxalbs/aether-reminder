import type { AetherCore } from '@/core/aetherCore';
import { getLocalDateString, getLocalTimeString } from '@/temporal/localCalendar';
import { resolveTomorrow } from '@/temporal/resolve';
import { reportNonFatalError } from '@/lib/nonFatalError';

export const AETHER_NOTIFICATION_CATEGORY = 'aether_reminder_actions';
export const NOTIFICATION_ACTION_COMPLETE = 'AETHER_COMPLETE';
export const NOTIFICATION_ACTION_SNOOZE = 'AETHER_SNOOZE_10M';
export const NOTIFICATION_ACTION_TOMORROW = 'AETHER_TOMORROW';

type NotificationResponseLike = {
  actionIdentifier: string;
  notification: {
    request: {
      identifier: string;
      content: { data?: Record<string, unknown> };
    };
  };
};

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

export async function handleNotificationActionResponse(
  response: NotificationResponseLike,
  core: AetherCore,
  now: Date = new Date(),
): Promise<boolean> {
  const reminderId = response.notification.request.content.data?.reminderId;
  if (typeof reminderId !== 'string' || !reminderId) return false;
  const reminder = await core.services.reminders.getReminder(reminderId);
  if (!reminder) return false;

  switch (response.actionIdentifier) {
    case NOTIFICATION_ACTION_COMPLETE:
      await core.commands.completeTask(reminder.taskId, 'notification_action');
      return true;

    case NOTIFICATION_ACTION_SNOOZE: {
      const target = new Date(now.getTime() + 10 * 60_000);
      await core.commands.rescheduleReminder(reminder.id, {
        scheduledDate: getLocalDateString(target),
        scheduledTime: getLocalTimeString(target),
        timezone: reminder.timezone,
        semantics: reminder.semantics,
      });
      return true;
    }

    case NOTIFICATION_ACTION_TOMORROW:
      await core.commands.rescheduleReminder(reminder.id, {
        scheduledDate: resolveTomorrow(now).date,
        scheduledTime: reminder.scheduledTime ?? getLocalTimeString(now),
        timezone: reminder.timezone,
        semantics: reminder.semantics,
      });
      return true;

    default:
      return false;
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
  const seen = new Set<string>();

  const process = async (response: NotificationResponseLike) => {
    const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (seen.has(key)) return;
    seen.add(key);
    try {
      const mutated = await handleNotificationActionResponse(response, core);
      if (mutated) {
        await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);
        await onMutation?.();
      }
    } catch (error) {
      reportNonFatalError('notification-action', error);
    }
  };

  const lastResponse = await Notifications.getLastNotificationResponseAsync();
  if (lastResponse) {
    await process(lastResponse);
    Notifications.clearLastNotificationResponse();
  }

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    void process(response);
  });
  return () => subscription.remove();
}
