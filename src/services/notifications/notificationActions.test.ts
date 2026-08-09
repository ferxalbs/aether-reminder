import { describe, expect, mock, test } from 'bun:test';
import type { AetherCore } from '@/core/aetherCore';
import { getLocalDateString, getLocalTimeString } from '@/temporal/localCalendar';
import {
  handleNotificationActionResponse,
  NOTIFICATION_ACTION_COMPLETE,
  NOTIFICATION_ACTION_SNOOZE,
  NOTIFICATION_ACTION_TOMORROW,
} from './notificationActions';

const reminder = {
  id: 'reminder-1',
  taskId: 'task-1',
  scheduledDate: '2026-08-09',
  scheduledTime: '18:30',
  timezone: 'America/Lima',
  semantics: 'floating' as const,
  enabled: true,
  nativeNotificationId: 'native-1',
  projectionError: null,
  createdAt: '2026-08-09T18:00:00.000Z',
  updatedAt: '2026-08-09T18:00:00.000Z',
};

function response(actionIdentifier: string) {
  return {
    actionIdentifier,
    notification: {
      request: {
        identifier: 'native-1',
        content: { data: { reminderId: reminder.id, taskId: reminder.taskId } },
      },
    },
  };
}

function core() {
  const completeTask = mock(async () => ({ value: { id: reminder.taskId } }));
  const rescheduleReminder = mock(async () => ({ value: reminder }));
  const value = {
    services: {
      reminders: {
        getReminder: mock(async () => reminder),
      },
    },
    commands: { completeTask, rescheduleReminder },
  } as unknown as AetherCore;
  return { value, completeTask, rescheduleReminder };
}

describe('handleNotificationActionResponse', () => {
  test('completes through AetherCommandExecutor', async () => {
    const harness = core();
    expect(await handleNotificationActionResponse(response(NOTIFICATION_ACTION_COMPLETE), harness.value)).toBe(true);
    expect(harness.completeTask).toHaveBeenCalledWith('task-1', 'notification_action');
  });

  test('snoozes exactly ten minutes using local calendar values', async () => {
    const harness = core();
    const now = new Date(2026, 7, 9, 23, 55, 0, 0);
    await handleNotificationActionResponse(response(NOTIFICATION_ACTION_SNOOZE), harness.value, now);
    const target = new Date(now.getTime() + 10 * 60_000);
    expect(harness.rescheduleReminder).toHaveBeenCalledWith('reminder-1', {
      scheduledDate: getLocalDateString(target),
      scheduledTime: getLocalTimeString(target),
      timezone: 'America/Lima',
      semantics: 'floating',
    });
  });

  test('moves the reminder to tomorrow while preserving its time', async () => {
    const harness = core();
    const now = new Date(2026, 7, 9, 18, 19, 0, 0);
    await handleNotificationActionResponse(response(NOTIFICATION_ACTION_TOMORROW), harness.value, now);
    expect(harness.rescheduleReminder).toHaveBeenCalledWith('reminder-1', {
      scheduledDate: '2026-08-10',
      scheduledTime: '18:30',
      timezone: 'America/Lima',
      semantics: 'floating',
    });
  });
});
