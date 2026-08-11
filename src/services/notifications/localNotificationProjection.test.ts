import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { createRepositories } from '@/db/repositories';
import type { Reminder } from '@/domain/entities';
import {
  LocalNotificationProjection,
  NOTIFICATION_RECONCILIATION_BATCH_SIZE,
  resolveReminderNotificationDate,
  type LocalNotificationAdapter,
} from './localNotificationProjection';

describe('local notification projection', () => {
  test('resolves fixed reminder timezone and floating device timezone distinctly', () => {
    const base: Reminder = {
      id: 'reminder', taskId: 'task', scheduledDate: '2030-01-02', scheduledTime: '09:00',
      timezone: 'America/New_York', semantics: 'fixed', enabled: true,
      nativeNotificationId: null, projectionState: 'pending', projectionDirty: true,
      projectionRevision: 0, projectionAttemptCount: 0, projectionLastAttemptAt: null,
      projectionLastSuccessAt: null, projectionErrorCode: null, projectionError: null,
      timingPrecision: 'normal', createdAt: '', updatedAt: '',
    };
    expect(resolveReminderNotificationDate(base, 'America/Los_Angeles').toISOString())
      .toBe('2030-01-02T14:00:00.000Z');
    expect(resolveReminderNotificationDate(
      { ...base, semantics: 'floating' },
      'America/Los_Angeles',
    ).toISOString()).toBe('2030-01-02T17:00:00.000Z');
  });

  test('schedules, repairs missing OS state, and cancels from SQLite truth', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db); await runMigrations(db);
    const repos = createRepositories(db);
    const task = await repos.tasks.create({ title: 'Take medicine' });
    let scheduled: { identifier: string; reminderId?: string }[] = [];
    let sequence = 0;
    const adapter: LocalNotificationAdapter = {
      list: async () => scheduled,
      schedule: async ({ reminderId }) => {
        const identifier = `native-${++sequence}`;
        scheduled = [...scheduled, { identifier, reminderId }];
        return identifier;
      },
      cancel: async (identifier) => { scheduled = scheduled.filter((item) => item.identifier !== identifier); },
    };
    const projection = new LocalNotificationProjection(repos.reminders, repos.tasks, adapter);
    const reminder = await repos.reminders.create({ taskId: task.id, scheduledDate: '2030-01-02', scheduledTime: '09:00' });
    await projection.project(reminder);
    expect((await repos.reminders.getById(reminder.id))?.nativeNotificationId).toBe('native-1');

    scheduled = [];
    expect(await projection.reconcile()).toEqual({ repaired: 1, failed: 0, failures: [] });
    const repaired = await repos.reminders.getById(reminder.id);
    expect(repaired?.nativeNotificationId).toBe('native-2');

    await repos.reminders.setEnabled(reminder.id, false);
    await projection.reconcile();
    expect(scheduled).toHaveLength(0);
    expect((await repos.reminders.getById(reminder.id))?.nativeNotificationId).toBeNull();
    await db.closeAsync?.();
  });

  test('reconciliation removes projected notifications with no SQLite reminder', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db); await runMigrations(db);
    const repos = createRepositories(db);
    let scheduled = [{ identifier: 'orphan-native', reminderId: 'missing-reminder' }];
    const adapter: LocalNotificationAdapter = {
      list: async () => scheduled,
      schedule: async () => 'unused',
      cancel: async (identifier) => {
        scheduled = scheduled.filter((item) => item.identifier !== identifier);
      },
    };

    const result = await new LocalNotificationProjection(
      repos.reminders,
      repos.tasks,
      adapter,
    ).reconcile();

    expect(result).toEqual({ repaired: 1, failed: 0, failures: [] });
    expect(scheduled).toHaveLength(0);
    await db.closeAsync?.();
  });

  test('reconciliation does not orphan valid notifications beyond 200 reminders', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db); await runMigrations(db);
    const repos = createRepositories(db);
    const task = await repos.tasks.create({ title: 'Large reminder set' });
    const scheduled: { identifier: string; reminderId: string }[] = [];
    for (let index = 0; index < 201; index += 1) {
      const reminder = await repos.reminders.create({
        id: `reminder-${String(index).padStart(3, '0')}`,
        taskId: task.id,
        scheduledDate: '2030-01-02',
        scheduledTime: '09:00',
      });
      const identifier = `native-${index}`;
      await repos.reminders.setProjection(reminder.id, identifier, null);
      scheduled.push({ identifier, reminderId: reminder.id });
    }
    const cancelled: string[] = [];
    const adapter: LocalNotificationAdapter = {
      list: async () => scheduled,
      schedule: async () => { throw new Error('Valid projection must not be rescheduled.'); },
      cancel: async (identifier) => { cancelled.push(identifier); },
    };

    expect(await new LocalNotificationProjection(repos.reminders, repos.tasks, adapter).reconcile())
      .toEqual({ repaired: 0, failed: 0, failures: [] });
    expect(cancelled).toHaveLength(0);
    expect(await repos.reminders.listAll()).toHaveLength(201);
    await db.closeAsync?.();
  });

  test('reconciliation repairs reminders in bounded batches', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db); await runMigrations(db);
    const repos = createRepositories(db);
    const task = await repos.tasks.create({ title: 'Bounded reminder set' });
    const reminderCount = NOTIFICATION_RECONCILIATION_BATCH_SIZE + 3;
    for (let index = 0; index < reminderCount; index += 1) {
      await repos.reminders.create({
        id: `bounded-reminder-${index}`,
        taskId: task.id,
        scheduledDate: '2030-01-02',
        scheduledTime: '09:00',
      });
    }

    let activeSchedules = 0;
    let maxActiveSchedules = 0;
    let scheduledCount = 0;
    const adapter: LocalNotificationAdapter = {
      list: async () => [],
      schedule: async ({ reminderId }) => {
        activeSchedules += 1;
        maxActiveSchedules = Math.max(maxActiveSchedules, activeSchedules);
        await new Promise((resolve) => setTimeout(resolve, 2));
        scheduledCount += 1;
        activeSchedules -= 1;
        return `native-${reminderId}`;
      },
      cancel: async () => {},
    };

    const result = await new LocalNotificationProjection(
      repos.reminders,
      repos.tasks,
      adapter,
    ).reconcile();

    expect(result).toEqual({ repaired: reminderCount, failed: 0, failures: [] });
    expect(scheduledCount).toBe(reminderCount);
    expect(maxActiveSchedules).toBeLessThanOrEqual(NOTIFICATION_RECONCILIATION_BATCH_SIZE);
    await db.closeAsync?.();
  });
});
