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
    expect(result.applied).toEqual([
      '0001_core',
      '0002_indexes',
      '0003_agent_runtime',
      '0004_notification_projection',
      '0005_notification_query_indexes',
      '0006_recurrence_rules',
      '0007_notification_reliability',
      '0008_adaptive_nudges',
      '0009_universal_capture',
    ]);
    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);

    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
    );
    const names = tables.map((t) => t.name);
    expect(names).toContain('tasks');
    expect(names).toContain('reminders');
    expect(names).toContain('recurrence_rules');
    expect(names).toContain('projects');
    expect(names).toContain('tags');
    expect(names).toContain('task_tags');
    expect(names).toContain('task_events');
    expect(names).toContain('app_meta');
    expect(names).toContain('agent_sessions');
    expect(names).toContain('agent_runs');
    expect(names).toContain('agent_events');
    expect(names).toContain('tool_executions');
    expect(names).toContain('notification_action_receipts');
    expect(names).toContain('nudge_events');
    expect(names).toContain('nudge_profiles');

    const indexes = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name`
    );
    expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining([
      'idx_reminders_enabled_schedule',
      'idx_reminders_native_notification',
      'idx_reminders_schedule',
      'idx_reminders_task_schedule',
      'idx_reminders_timezone',
      'recurrence_rules_active_idx',
      'recurrence_rules_active_task_idx',
      'recurrence_rules_last_completed_idx',
      'idx_reminders_projection_dirty',
      'idx_reminders_projection_error',
      'notification_action_receipts_reminder_idx',
      'idx_reminders_idempotency_key',
      'idx_reminders_task_kind_schedule',
      'idx_reminders_nudge_day',
      'idx_nudge_events_task_time',
      'idx_nudge_events_type_time',
      'idx_nudge_events_nudge_time',
    ]));
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
    expect(result.applied).toEqual([
      '0002_indexes',
      '0003_agent_runtime',
      '0004_notification_projection',
      '0005_notification_query_indexes',
      '0006_recurrence_rules',
      '0007_notification_reliability',
      '0008_adaptive_nudges',
      '0009_universal_capture',
    ]);
    await db.closeAsync?.();
  });

  test('rejects a missing migration version before applying a later migration', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    const skipped: Migration = {
      version: 3,
      name: '0003_skipped',
      async up() {},
    };

    await expect(runMigrations(db, [migration0001Core, skipped])).rejects.toMatchObject({
      code: 'MIGRATION_FAILED',
      message: 'Migration versions must be contiguous (expected v2, saw v3).',
    });
    expect(await getSchemaVersion(db)).toBe(0);
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
