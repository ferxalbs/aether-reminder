import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { createRepositories } from './index';
import { NotificationActionReceiptsRepository } from './notificationActionReceiptsRepository';

describe('notification action receipts repository', () => {
  test('claims once, preserves deterministic target, and completes idempotently', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const repositories = createRepositories(db);
    const task = await repositories.tasks.create({ title: 'Receipt test' });
    await repositories.reminders.create({ id: 'reminder-1', taskId: task.id });
    const repository = new NotificationActionReceiptsRepository(db);

    const first = await repository.claim({
      responseKey: 'native-1:AETHER_SNOOZE_10M',
      nativeNotificationId: 'native-1',
      actionIdentifier: 'AETHER_SNOOZE_10M',
      reminderId: 'reminder-1',
      targetDate: '2026-08-11',
      targetTime: '09:10',
      targetTimezone: 'America/New_York',
      targetSemantics: 'fixed',
    });
    const retry = await repository.claim({
      responseKey: first.responseKey,
      nativeNotificationId: 'native-1',
      actionIdentifier: 'AETHER_SNOOZE_10M',
      reminderId: 'reminder-1',
      targetDate: '2099-01-01',
      targetTime: '00:00',
      targetTimezone: 'UTC',
      targetSemantics: 'floating',
    });

    expect(retry.status).toBe('claimed');
    expect(retry.attemptCount).toBe(2);
    expect(retry.targetDate).toBe('2026-08-11');
    expect(retry.targetTime).toBe('09:10');
    expect(retry.targetTimezone).toBe('America/New_York');
    expect(retry.targetSemantics).toBe('fixed');

    await repository.markCompleted(first.responseKey);
    const duplicate = await repository.claim({
      responseKey: first.responseKey,
      nativeNotificationId: 'native-1',
      actionIdentifier: 'AETHER_SNOOZE_10M',
      reminderId: 'reminder-1',
    });
    expect(duplicate.status).toBe('completed');
    expect(duplicate.attemptCount).toBe(2);
    await db.closeAsync?.();
  });
});
