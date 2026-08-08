import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from './bunSqliteAdapter';
import { applyPragmas, runMigrations } from './migrator';
import {
  KNOWN_DEMO_TASK_IDS,
  LEGACY_MIGRATION_META_KEY,
  migrateLegacyTasks,
  normalizeLegacyTask,
} from './legacyMigration';
import { TasksRepository } from './repositories/tasksRepository';

async function readyDb() {
  const db = createBunSqliteDatabase();
  await applyPragmas(db);
  await runMigrations(db);
  return db;
}

describe('normalizeLegacyTask', () => {
  test('accepts valid shape and preserves safe id', () => {
    const n = normalizeLegacyTask({
      id: 'task-user-abc',
      title: 'Buy milk',
      priority: 'high',
      completed: false,
      createdAt: '2026-01-01T12:00:00.000Z',
      dueDate: '2026-01-02',
    });
    expect(n).not.toBeNull();
    expect(n?.id).toBe('task-user-abc');
    expect(n?.title).toBe('Buy milk');
    expect(n?.priority).toBe('high');
  });

  test('rejects malformed data', () => {
    expect(normalizeLegacyTask(null)).toBeNull();
    expect(normalizeLegacyTask({})).toBeNull();
    expect(normalizeLegacyTask({ title: 'x' })).toBeNull();
    expect(normalizeLegacyTask({ title: '', priority: 'medium' })).toBeNull();
  });

  test('does not preserve demo ids', () => {
    const n = normalizeLegacyTask({
      id: 'demo-1',
      title: 'Something else',
      priority: 'medium',
      completed: false,
    });
    // demo-1 is excluded at migrate filter; normalize still may strip via isPlausibleId
    expect(KNOWN_DEMO_TASK_IDS.has('demo-1')).toBe(true);
    expect(n?.id).toBeUndefined();
  });
});

describe('migrateLegacyTasks', () => {
  test('empty legacy data marks complete without inserts', async () => {
    const db = await readyDb();
    const result = await migrateLegacyTasks(db, {
      readLegacy: async () => null,
      clearLegacy: async () => {},
    });
    expect(result.status).toBe('skipped_empty');
    expect(result.importedCount).toBe(0);
    const tasks = new TasksRepository(db);
    expect(await tasks.countActive()).toBe(0);

    const again = await migrateLegacyTasks(db, {
      readLegacy: async () => {
        throw new Error('should not read again');
      },
    });
    expect(again.status).toBe('skipped_already_done');
    await db.closeAsync?.();
  });

  test('imports valid user tasks and excludes demo seeds', async () => {
    const db = await readyDb();
    const blob = JSON.stringify({
      state: {
        tasks: [
          {
            id: 'demo-1',
            title: 'Review Q3 Product Architecture & Liquid Glass specs',
            priority: 'high',
            completed: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            dueDate: '2026-01-01',
          },
          {
            id: 'user-task-1',
            title: 'Real user task',
            notes: 'keep me',
            priority: 'medium',
            completed: false,
            createdAt: '2026-01-02T00:00:00.000Z',
            dueDate: '2026-01-03',
          },
          { title: 'broken', completed: false },
        ],
      },
      version: 0,
    });

    const result = await migrateLegacyTasks(db, {
      readLegacy: async () => blob,
      clearLegacy: async () => {},
    });

    expect(result.status).toBe('imported');
    expect(result.importedCount).toBe(1);
    expect(result.skippedDemoCount).toBe(1);
    expect(result.skippedInvalidCount).toBe(1);

    const tasks = new TasksRepository(db);
    const found = await tasks.getById('user-task-1');
    expect(found?.title).toBe('Real user task');
    expect(await tasks.getById('demo-1')).toBeNull();
    await db.closeAsync?.();
  });

  test('demo-only storage marks complete with no user rows', async () => {
    const db = await readyDb();
    const blob = JSON.stringify({
      state: {
        tasks: [
          {
            id: 'demo-2',
            title: 'Finalize OpenRouter API client abstraction',
            priority: 'high',
            completed: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            dueDate: '2026-01-01',
          },
        ],
      },
    });
    const result = await migrateLegacyTasks(db, {
      readLegacy: async () => blob,
      clearLegacy: async () => {},
    });
    expect(result.status).toBe('skipped_demo_only');
    expect(await new TasksRepository(db).countActive()).toBe(0);
    await db.closeAsync?.();
  });

  test('duplicate migration attempt does not duplicate rows', async () => {
    const db = await readyDb();
    const blob = JSON.stringify({
      state: {
        tasks: [
          {
            id: 'user-task-dup',
            title: 'Only once',
            priority: 'low',
            completed: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            dueDate: '2026-02-01',
          },
        ],
      },
    });

    let cleared = 0;
    await migrateLegacyTasks(db, {
      readLegacy: async () => blob,
      clearLegacy: async () => {
        cleared += 1;
      },
    });
    const second = await migrateLegacyTasks(db, {
      readLegacy: async () => blob,
      clearLegacy: async () => {
        cleared += 1;
      },
    });
    expect(second.status).toBe('skipped_already_done');
    expect(await new TasksRepository(db).countActive()).toBe(1);
    expect(cleared).toBe(1);

    const meta = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_meta WHERE key = ?`,
      [LEGACY_MIGRATION_META_KEY]
    );
    expect(meta?.value).toBe('1');
    await db.closeAsync?.();
  });

  test('malformed JSON fails closed without marking complete', async () => {
    const db = await readyDb();
    await expect(
      migrateLegacyTasks(db, {
        readLegacy: async () => '{not-json',
        clearLegacy: async () => {},
      })
    ).rejects.toMatchObject({ code: 'LEGACY_MIGRATION_FAILED' });

    const meta = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_meta WHERE key = ?`,
      [LEGACY_MIGRATION_META_KEY]
    );
    expect(meta).toBeNull();
    await db.closeAsync?.();
  });
});
