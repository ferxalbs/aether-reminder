import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { createRepositories } from '@/db/repositories';
import { LocalNotificationProjection, type LocalNotificationAdapter } from './localNotificationProjection';

describe('local notification projection', () => {
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
    expect(await projection.reconcile()).toEqual({ repaired: 1, failed: 0 });
    const repaired = await repos.reminders.getById(reminder.id);
    expect(repaired?.nativeNotificationId).toBe('native-2');

    await repos.reminders.setEnabled(reminder.id, false);
    await projection.reconcile();
    expect(scheduled).toHaveLength(0);
    expect((await repos.reminders.getById(reminder.id))?.nativeNotificationId).toBeNull();
    await db.closeAsync?.();
  });
});
