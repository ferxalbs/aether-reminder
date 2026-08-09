import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { createDomainServices } from './index';
import { resolveTomorrow } from '@/temporal/resolve';
import { getLocalDateString } from '@/temporal/localCalendar';

async function ready() {
  const db = createBunSqliteDatabase();
  await applyPragmas(db);
  await runMigrations(db);
  return { db, services: createDomainServices(db) };
}

describe('TaskService', () => {
  test('create/complete/reopen/delete with receipts and events', async () => {
    const { db, services } = await ready();
    const { value, receipt } = await services.tasks.createTask({
      title: 'Service path',
      priority: 'high',
    });
    expect(receipt.risk).toBe('REVERSIBLE_WRITE');
    expect(receipt.undo).toBeTruthy();

    const done = await services.tasks.completeTask(value.id);
    expect(done.value.completed).toBe(true);
    expect(done.receipt.action).toBe('tasks.complete');

    const open = await services.tasks.reopenTask(value.id);
    expect(open.value.completed).toBe(false);

    const deleted = await services.tasks.deleteTask(value.id);
    expect(deleted.receipt.undo?.kind).toBe('task.restore_soft_deleted');
    expect(await services.tasks.getTask(value.id)).toBeNull();

    const restored = await services.tasks.restoreTask(value.id);
    expect(restored.value.deletedAt).toBeNull();
    expect(restored.receipt.undo?.kind).toBe('task.soft_delete');
    expect(await services.tasks.getTask(value.id)).not.toBeNull();
    await db.closeAsync?.();
  });

  test('reschedule validates temporal input', async () => {
    const { db, services } = await ready();
    const { value } = await services.tasks.createTask({ title: 'Move me' });
    const tomorrow = resolveTomorrow().date;
    const moved = await services.tasks.rescheduleTask(value.id, { dueDate: tomorrow });
    expect(moved.value.dueDate).toBe(tomorrow);

    await expect(
      services.tasks.rescheduleTask(value.id, {
        dueDate: '2026-08-07T00:00:00.000Z',
      })
    ).rejects.toThrow();
    await db.closeAsync?.();
  });

  test('upcoming list propagates its limit to SQLite', async () => {
    const { db, services } = await ready();
    const today = getLocalDateString();
    const tomorrow = resolveTomorrow().date;
    await services.tasks.createTask({ title: 'Upcoming one', dueDate: tomorrow });
    await services.tasks.createTask({ title: 'Upcoming two', dueDate: tomorrow });
    await services.tasks.createTask({ title: 'Upcoming three', dueDate: tomorrow });

    const upcoming = await services.tasks.listTasks({
      scope: 'upcoming',
      localDate: tomorrow,
      limit: 2,
    });
    expect(upcoming).toHaveLength(0);

    const fromToday = await services.tasks.listTasks({
      scope: 'upcoming',
      localDate: today,
      limit: 2,
    });
    expect(fromToday).toHaveLength(2);
    await db.closeAsync?.();
  });

  test('all list includes completed reminders', async () => {
    const { db, services } = await ready();
    const active = await services.tasks.createTask({ title: 'Active all item' });
    const completed = await services.tasks.createTask({ title: 'Completed all item' });
    await services.tasks.completeTask(completed.value.id);

    const all = await services.tasks.listTasks({ scope: 'all' });
    expect(all.map((task) => task.title)).toEqual(['Active all item', 'Completed all item']);
    expect(all.some((task) => task.id === active.value.id)).toBe(true);
    await db.closeAsync?.();
  });
});
