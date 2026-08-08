import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { createDomainServices } from './index';
import { resolveTomorrow } from '@/temporal/resolve';

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

    await services.tasks.deleteTask(value.id);
    expect(await services.tasks.getTask(value.id)).toBeNull();
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
});
