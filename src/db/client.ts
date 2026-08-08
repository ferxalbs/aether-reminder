import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseError } from './errors';
import { applyPragmas, runMigrations, type MigrationResult } from './migrator';
import type { SqlBindParams, SqlDatabase, SqlRunResult } from './types';

export const DATABASE_NAME = 'aether.db';

export type DatabaseStatus = 'idle' | 'initializing' | 'ready' | 'error';

export interface DatabaseHandle {
  db: SqlDatabase;
  status: 'ready';
  migration: MigrationResult;
}

let readyHandle: DatabaseHandle | null = null;
let initPromise: Promise<DatabaseHandle> | null = null;
let lastError: DatabaseError | null = null;

function wrapExpoDatabase(native: SQLiteDatabase): SqlDatabase {
  return {
    execAsync: (source) => native.execAsync(source),
    runAsync: async (source, params?: SqlBindParams): Promise<SqlRunResult> => {
      const result =
        params === undefined
          ? await native.runAsync(source)
          : Array.isArray(params)
            ? await native.runAsync(source, params)
            : await native.runAsync(source, params);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    getFirstAsync: async <T>(source: string, params?: SqlBindParams) => {
      if (params === undefined) return native.getFirstAsync<T>(source);
      if (Array.isArray(params)) return native.getFirstAsync<T>(source, params);
      return native.getFirstAsync<T>(source, params);
    },
    getAllAsync: async <T>(source: string, params?: SqlBindParams) => {
      if (params === undefined) return native.getAllAsync<T>(source);
      if (Array.isArray(params)) return native.getAllAsync<T>(source, params);
      return native.getAllAsync<T>(source, params);
    },
    withTransactionAsync: (task) => native.withTransactionAsync(task),
    closeAsync: () => native.closeAsync(),
  };
}

/**
 * Open DB, apply pragmas + migrations. Idempotent singleton for app process.
 * Fail closed — throws DatabaseError on failure.
 */
export async function initializeDatabase(): Promise<DatabaseHandle> {
  if (readyHandle) return readyHandle;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { openDatabaseAsync } = await import('expo-sqlite');
      const native = await openDatabaseAsync(DATABASE_NAME);
      const db = wrapExpoDatabase(native);
      await applyPragmas(db);
      const migration = await runMigrations(db);
      readyHandle = { db, status: 'ready', migration };
      lastError = null;
      return readyHandle;
    } catch (cause) {
      lastError =
        cause instanceof DatabaseError
          ? cause
          : new DatabaseError('INIT_FAILED', 'Failed to initialize SQLite database.', cause);
      initPromise = null;
      throw lastError;
    }
  })();

  return initPromise;
}

export function getDatabase(): SqlDatabase {
  if (!readyHandle) {
    throw new DatabaseError('NOT_READY', 'Database has not been initialized.');
  }
  return readyHandle.db;
}

export function isDatabaseReady(): boolean {
  return readyHandle !== null;
}

export function getDatabaseInitError(): DatabaseError | null {
  return lastError;
}

/** Test-only: inject a ready database (e.g. bun:sqlite). */
export function __setDatabaseForTests(db: SqlDatabase | null): void {
  if (db) {
    readyHandle = {
      db,
      status: 'ready',
      migration: { fromVersion: 0, toVersion: 0, applied: [] },
    };
    lastError = null;
  } else {
    readyHandle = null;
    initPromise = null;
    lastError = null;
  }
}

/** Bootstrap for tests: run migrations on provided SqlDatabase. */
export async function initializeDatabaseWith(db: SqlDatabase): Promise<DatabaseHandle> {
  await applyPragmas(db);
  const migration = await runMigrations(db);
  readyHandle = { db, status: 'ready', migration };
  lastError = null;
  return readyHandle;
}
