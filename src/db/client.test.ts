import { afterEach, describe, expect, test } from 'bun:test';
import {
  __setDatabaseForTests,
  recoverDatabase,
  RECREATE_DATABASE_CONFIRMATION,
} from './client';
import { DatabaseError } from './errors';
import type { SqlDatabase } from './types';

function createDatabase(getFirst: SqlDatabase['getFirstAsync']): SqlDatabase {
  return {
    execAsync: async () => undefined,
    runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
    getFirstAsync: getFirst,
    getAllAsync: async () => [],
    withTransactionAsync: async (task) => task(),
    closeAsync: async () => undefined,
  };
}

afterEach(() => {
  __setDatabaseForTests(null);
});

describe('database recovery safety', () => {
  test('retry reuses a ready database without deleting data', async () => {
    const db = createDatabase(async () => null);
    __setDatabaseForTests(db);

    const result = await recoverDatabase('retry');

    expect(result.mode).toBe('retry');
    if (result.mode === 'retry') expect(result.handle.db).toBe(db);
  });

  test('check is read-only and accepts SQLite quick_check ok', async () => {
    const db = createDatabase(async () => ({ quick_check: 'ok' }));
    __setDatabaseForTests(db);

    await expect(recoverDatabase('check')).resolves.toEqual({
      mode: 'check',
      integrity: 'ok',
    });
  });

  test('check fails closed when SQLite reports corruption', async () => {
    const db = createDatabase(async () => ({ quick_check: '*** in database main ***' }));
    __setDatabaseForTests(db);

    try {
      await recoverDatabase('check');
      throw new Error('Expected integrity check to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseError);
      expect((error as DatabaseError).code).toBe('INTEGRITY_CHECK_FAILED');
    }
  });

  test('recreate refuses to run without the exact confirmation token', async () => {
    const db = createDatabase(async () => null);
    __setDatabaseForTests(db);

    for (const confirmation of [undefined, '', `${RECREATE_DATABASE_CONFIRMATION}_WRONG`]) {
      try {
        await recoverDatabase('recreate', confirmation);
        throw new Error('Expected recreation to require confirmation.');
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseError);
        expect((error as DatabaseError).code).toBe('RECOVERY_CONFIRMATION_REQUIRED');
      }
    }
  });

  test('rejects overlapping recovery operations', async () => {
    let releaseCheck: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      releaseCheck = resolve;
    });
    const db = createDatabase(async () => {
      await waiting;
      return { quick_check: 'ok' };
    });
    __setDatabaseForTests(db);

    const first = recoverDatabase('check');
    await Promise.resolve();

    try {
      await recoverDatabase('retry');
      throw new Error('Expected overlapping recovery to be rejected.');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseError);
      expect((error as DatabaseError).code).toBe('RECOVERY_IN_PROGRESS');
    } finally {
      releaseCheck?.();
    }
    await expect(first).resolves.toEqual({ mode: 'check', integrity: 'ok' });
  });
});
