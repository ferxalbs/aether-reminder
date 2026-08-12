import { describe, expect, mock, test } from 'bun:test';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { createRepositories } from '@/db/repositories';
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
    }, 'notification_action');
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
    }, 'notification_action');
  });

  test('uses fixed reminder timezone and persists one snooze target across retries', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const repos = createRepositories(db);
    await repos.tasks.create({ id: 'task-1', title: 'Fixed reminder' });
    const storedReminder = await repos.reminders.create({
      id: 'reminder-1',
      taskId: 'task-1',
      scheduledDate: '2026-08-09',
      scheduledTime: '23:55',
      timezone: 'America/New_York',
      semantics: 'fixed',
    }, 'notification_action');
    let attempts = 0;
    const rescheduleReminder = mock(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary command failure');
      return { value: storedReminder };
    });
    const actionCore = {
      services: {
        reminders: { getReminder: mock(async () => storedReminder) },
        repos,
      },
      commands: {
        completeTask: mock(async () => ({ value: { id: 'task-1' } })),
        rescheduleReminder,
      },
    } as unknown as AetherCore;
    const actionResponse = response(NOTIFICATION_ACTION_SNOOZE);
    const firstNow = new Date('2026-08-10T03:55:00.000Z');

    await expect(handleNotificationActionResponse(actionResponse, actionCore, firstNow))
      .rejects.toThrow('temporary command failure');
    await handleNotificationActionResponse(
      actionResponse,
      actionCore,
      new Date('2026-08-10T12:00:00.000Z'),
    );
    await handleNotificationActionResponse(
      actionResponse,
      actionCore,
      new Date('2026-08-10T13:00:00.000Z'),
    );

    expect(rescheduleReminder).toHaveBeenNthCalledWith(1, 'reminder-1', {
      scheduledDate: '2026-08-10',
      scheduledTime: '00:05',
      timezone: 'America/New_York',
      semantics: 'fixed',
    }, 'notification_action');
    expect(rescheduleReminder).toHaveBeenNthCalledWith(2, 'reminder-1', {
      scheduledDate: '2026-08-10',
      scheduledTime: '00:05',
      timezone: 'America/New_York',
      semantics: 'fixed',
    }, 'notification_action');
    expect(rescheduleReminder).toHaveBeenCalledTimes(2);
    await db.closeAsync?.();
  });

  test('does not repeat completed action after process-local replay', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const repos = createRepositories(db);
    await repos.tasks.create({ id: 'task-1', title: 'Complete once' });
    const storedReminder = await repos.reminders.create({
      id: 'reminder-1',
      taskId: 'task-1',
      scheduledDate: '2026-08-09',
      scheduledTime: '18:30',
    });
    const completeTask = mock(async () => ({ value: { id: 'task-1' } }));
    const actionCore = {
      services: {
        reminders: { getReminder: mock(async () => storedReminder) },
        repos,
      },
      commands: { completeTask, rescheduleReminder: mock(async () => ({ value: storedReminder })) },
    } as unknown as AetherCore;

    await handleNotificationActionResponse(response(NOTIFICATION_ACTION_COMPLETE), actionCore);
    await handleNotificationActionResponse(response(NOTIFICATION_ACTION_COMPLETE), actionCore);

    expect(completeTask).toHaveBeenCalledTimes(1);
    await db.closeAsync?.();
  });
});
