import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from '../bunSqliteAdapter';
import { DatabaseError } from '../errors';
import { applyPragmas, getSchemaVersion, runMigrations } from '../migrator';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './index';
import type { Migration } from './types';
import { migration0001Core } from './0001_core';

describe('schema migrations', () => {
  test('empty database reaches latest schema', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    const result = await runMigrations(db);
    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(result.applied).toEqual(['0001_core', '0002_indexes', '0003_agent_runtime']);
    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);

    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
    );
    const names = tables.map((t) => t.name);
    expect(names).toContain('tasks');
    expect(names).toContain('reminders');
    expect(names).toContain('projects');
    expect(names).toContain('tags');
    expect(names).toContain('task_tags');
    expect(names).toContain('task_events');
    expect(names).toContain('app_meta');
    expect(names).toContain('agent_sessions');
    expect(names).toContain('agent_runs');
    expect(names).toContain('agent_events');
    expect(names).toContain('tool_executions');
    await db.closeAsync?.();
  });

  test('partially migrated database upgrades to latest', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db, [migration0001Core]);
    expect(await getSchemaVersion(db)).toBe(1);

    const result = await runMigrations(db, MIGRATIONS);
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(result.applied).toEqual(['0002_indexes', '0003_agent_runtime']);
    await db.closeAsync?.();
  });

  test('repeated migration execution is a no-op', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const second = await runMigrations(db);
    expect(second.fromVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(second.toVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(second.applied).toEqual([]);
    await db.closeAsync?.();
  });

  test('failed migration rolls back and does not advance user_version', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db, [migration0001Core]);
    expect(await getSchemaVersion(db)).toBe(1);

    const failing: Migration = {
      version: 2,
      name: '0002_failing',
      async up(database) {
        await database.execAsync(`CREATE TABLE boom_probe (id TEXT PRIMARY KEY NOT NULL);`);
        throw new Error('forced migration failure');
      },
    };

    await expect(runMigrations(db, [migration0001Core, failing])).rejects.toBeInstanceOf(
      DatabaseError
    );
    expect(await getSchemaVersion(db)).toBe(1);

    const probe = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'boom_probe'`
    );
    expect(probe).toBeNull();
    await db.closeAsync?.();
  });
});
