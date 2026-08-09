import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from '../bunSqliteAdapter';
import { applyPragmas, runMigrations } from '../migrator';
import type { SqlBindParams, SqlDatabase } from '../types';
import { TaskEventsRepository } from './taskEventsRepository';
import { TasksRepository } from './tasksRepository';
import { getLocalDateString } from '@/temporal/localCalendar';

async function readyDb() {
  const db = createBunSqliteDatabase();
  await applyPragmas(db);
  await runMigrations(db);
  return db;
}

describe('TasksRepository', () => {
  test('create + getById + event history', async () => {
    const db = await readyDb();
    const tasks = new TasksRepository(db);
    const events = new TaskEventsRepository(db);

    const task = await tasks.create({
      title: 'Ship slice 2',
      priority: 'high',
      dueDate: getLocalDateString(),
    });
    expect(task.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(task.title).toBe('Ship slice 2');
    expect(task.completed).toBe(false);

    const history = await events.listForTask(task.id);
    expect(history.map((e) => e.type)).toEqual(['created']);
    await db.closeAsync?.();
  });

  test('complete and reopen', async () => {
    const db = await readyDb();
    const tasks = new TasksRepository(db);
    const created = await tasks.create({ title: 'Toggle me', priority: 'medium' });
    const done = await tasks.complete(created.id);
    expect(done.completed).toBe(true);
    expect(done.completedAt).toBeTruthy();
    const open = await tasks.reopen(created.id);
    expect(open.completed).toBe(false);
    expect(open.completedAt).toBeNull();
    await db.closeAsync?.();
  });

  test('soft delete hides from default queries', async () => {
    const db = await readyDb();
    const tasks = new TasksRepository(db);
    const created = await tasks.create({ title: 'Delete me', priority: 'low' });
    await tasks.softDelete(created.id);
    expect(await tasks.getById(created.id)).toBeNull();
    expect(await tasks.getById(created.id, { includeDeleted: true })).not.toBeNull();
    expect(await tasks.countActive()).toBe(0);
    await db.closeAsync?.();
  });

  test('listToday / overdue / upcoming use local calendar', async () => {
    const db = await readyDb();
    const tasks = new TasksRepository(db);
    const today = getLocalDateString();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = getLocalDateString(yesterdayDate);
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = getLocalDateString(tomorrowDate);

    await tasks.create({ title: 'Today', priority: 'medium', dueDate: today });
    await tasks.create({ title: 'No date', priority: 'medium', dueDate: null });
    await tasks.create({ title: 'Overdue', priority: 'high', dueDate: yesterday });
    await tasks.create({ title: 'Later', priority: 'low', dueDate: tomorrow });
    const completedLater = await tasks.create({
      title: 'Completed later',
      priority: 'medium',
      dueDate: tomorrow,
    });
    await tasks.complete(completedLater.id);

    const todayList = await tasks.listToday(today);
    expect(todayList.map((t) => t.title).sort()).toEqual(['No date', 'Today'].sort());

    const overdue = await tasks.listOverdue(today);
    expect(overdue.map((t) => t.title)).toEqual(['Overdue']);

    const upcoming = await tasks.listUpcoming(today);
    expect(upcoming.map((t) => t.title)).toEqual(['Later']);
    await db.closeAsync?.();
  });

  test('upcoming query enforces its limit and deterministic ordering', async () => {
    const db = await readyDb();
    const tasks = new TasksRepository(db);
    const today = getLocalDateString();
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = getLocalDateString(tomorrowDate);

    await tasks.create({ title: 'Later low', priority: 'low', dueDate: tomorrow });
    await tasks.create({ title: 'Later high', priority: 'high', dueDate: tomorrow });
    await tasks.create({ title: 'Later medium', priority: 'medium', dueDate: tomorrow });

    const upcoming = await tasks.listUpcoming(today, 2);
    expect(upcoming).toHaveLength(2);
    expect(upcoming.map((task) => task.title)).toEqual(['Later high', 'Later medium']);
    await db.closeAsync?.();
  });

  test('listAll includes completed tasks but excludes soft-deleted tasks', async () => {
    const db = await readyDb();
    const tasks = new TasksRepository(db);
    const active = await tasks.create({ title: 'Active reminder', priority: 'medium' });
    const completed = await tasks.create({ title: 'Completed reminder', priority: 'low' });
    const deleted = await tasks.create({ title: 'Deleted reminder', priority: 'high' });

    await tasks.complete(completed.id);
    await tasks.softDelete(deleted.id);

    const all = await tasks.listAll();
    expect(all.map((task) => task.title)).toEqual(['Active reminder', 'Completed reminder']);
    expect(all.some((task) => task.id === active.id)).toBe(true);
    expect(all.some((task) => task.id === deleted.id)).toBe(false);
    await db.closeAsync?.();
  });

  test('update and search', async () => {
    const db = await readyDb();
    const tasks = new TasksRepository(db);
    const created = await tasks.create({
      title: 'Original',
      notes: 'alpha notes',
      priority: 'medium',
    });
    const updated = await tasks.update(created.id, { title: 'Renamed', priority: 'high' });
    expect(updated.title).toBe('Renamed');
    expect(updated.priority).toBe('high');

    const found = await tasks.search('alpha');
    expect(found.some((t) => t.id === created.id)).toBe(true);
    await db.closeAsync?.();
  });

  test('transaction integrity: failed event insert rolls back task mutation', async () => {
    const base = await readyDb();
    let failEvents = false;

    const wrapped: SqlDatabase = {
      execAsync: (s) => base.execAsync(s),
      getFirstAsync: (s, p) => base.getFirstAsync(s, p),
      getAllAsync: (s, p) => base.getAllAsync(s, p),
      closeAsync: () => base.closeAsync?.(),
      runAsync: async (source: string, params?: SqlBindParams) => {
        if (failEvents && source.includes('INSERT INTO task_events')) {
          throw new Error('forced event failure');
        }
        return base.runAsync(source, params);
      },
      withTransactionAsync: (task) => base.withTransactionAsync(task),
    };

    const tasks = new TasksRepository(wrapped);
    failEvents = true;
    await expect(tasks.create({ title: 'Should roll back', priority: 'medium' })).rejects.toThrow();

    failEvents = false;
    // Table should not contain the task
    const count = await base.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM tasks WHERE title = ?`,
      ['Should roll back']
    );
    expect(count?.c).toBe(0);

    const eventCount = await base.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM task_events`
    );
    expect(eventCount?.c).toBe(0);
    await base.closeAsync?.();
  });
});
