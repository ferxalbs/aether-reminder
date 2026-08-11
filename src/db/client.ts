import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseError } from './errors';
import {
  applyPragmas,
  getSchemaVersion,
  runMigrations,
  type MigrationResult,
} from './migrator';
import { LATEST_SCHEMA_VERSION } from './migrations';
import type { SqlBindParams, SqlDatabase, SqlRunResult } from './types';

export const DATABASE_NAME = 'aether.db';

export type DatabaseStatus = 'idle' | 'initializing' | 'ready' | 'error';

export interface DatabaseHandle {
  db: SqlDatabase;
  status: 'ready';
  migration: MigrationResult;
}

export type DatabaseRecoveryMode = 'retry' | 'check' | 'recreate';

export type DatabaseRecoveryResult =
  | { mode: 'retry' | 'recreate'; handle: DatabaseHandle }
  | { mode: 'check'; integrity: 'ok' };

/** Exact token required by the destructive recovery path. */
export const RECREATE_DATABASE_CONFIRMATION = 'RECREATE_LOCAL_DATABASE';

let readyHandle: DatabaseHandle | null = null;
let initPromise: Promise<DatabaseHandle> | null = null;
let lastError: DatabaseError | null = null;
let recoveryInProgress = false;

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
    let db: SqlDatabase | null = null;
    try {
      const { openDatabaseAsync } = await import('expo-sqlite');
      const native = await openDatabaseAsync(DATABASE_NAME);
      db = wrapExpoDatabase(native);
      await applyPragmas(db);
      const migration = await runMigrations(db);
      readyHandle = { db, status: 'ready', migration };
      lastError = null;
      return readyHandle;
    } catch (cause) {
      await db?.closeAsync?.().catch(() => undefined);
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

export async function assertDatabaseIntegrity(db: SqlDatabase): Promise<void> {
  const schemaVersion = await getSchemaVersion(db);
  if (schemaVersion !== LATEST_SCHEMA_VERSION) {
    throw new DatabaseError(
      'INTEGRITY_CHECK_FAILED',
      `SQLite schema is not at expected version ${LATEST_SCHEMA_VERSION}.`,
    );
  }

  const quickCheck = await db.getFirstAsync<Record<string, unknown>>('PRAGMA quick_check');
  if (!quickCheck || !Object.values(quickCheck).some((value) => value === 'ok')) {
    throw new DatabaseError('INTEGRITY_CHECK_FAILED', 'SQLite quick check did not return ok.');
  }

  const foreignKeyFailure = await db.getFirstAsync<Record<string, unknown>>(
    'PRAGMA foreign_key_check',
  );
  if (foreignKeyFailure) {
    throw new DatabaseError('INTEGRITY_CHECK_FAILED', 'SQLite foreign-key check found an orphan row.');
  }

  const orphanReminder = await db.getFirstAsync<{ id: string }>(
    `SELECT r.id
     FROM reminders r
     LEFT JOIN tasks t ON t.id = r.task_id
     WHERE t.id IS NULL
     LIMIT 1`,
  );
  if (orphanReminder) {
    throw new DatabaseError('INTEGRITY_CHECK_FAILED', 'Reminder/task relationship check failed.');
  }
}

/**
 * Explicit recovery boundary. Retry and check preserve data. Recreate is the
 * only destructive mode and requires the exported confirmation token.
 */
export async function recoverDatabase(
  mode: DatabaseRecoveryMode,
  confirmation?: string,
): Promise<DatabaseRecoveryResult> {
  if (recoveryInProgress) {
    throw new DatabaseError('RECOVERY_IN_PROGRESS', 'Database recovery is already in progress.');
  }
  if (mode === 'recreate' && confirmation !== RECREATE_DATABASE_CONFIRMATION) {
    throw new DatabaseError(
      'RECOVERY_CONFIRMATION_REQUIRED',
      'Refusing to recreate the database without explicit confirmation.',
    );
  }

  recoveryInProgress = true;
  try {
    if (mode === 'check') {
      await initPromise?.catch(() => undefined);
      let transientDatabase: SqlDatabase | null = null;
      try {
        if (!readyHandle) {
          const { openDatabaseAsync } = await import('expo-sqlite');
          transientDatabase = wrapExpoDatabase(await openDatabaseAsync(DATABASE_NAME));
        }
        const db = readyHandle?.db ?? transientDatabase;
        if (!db) {
          throw new DatabaseError('INTEGRITY_CHECK_FAILED', 'SQLite database is unavailable.');
        }
        await assertDatabaseIntegrity(db);
      } finally {
        await transientDatabase?.closeAsync?.().catch(() => undefined);
      }
      return { mode, integrity: 'ok' };
    }

    if (mode === 'retry') {
      return { mode, handle: await initializeDatabase() };
    }

    // Any initializer already in flight must settle before its handle can be
    // closed and the single, explicit database file can be removed.
    await initPromise?.catch(() => undefined);
    const handleToClose = readyHandle;
    readyHandle = null;
    initPromise = null;
    lastError = null;
    await handleToClose?.db.closeAsync?.();

    const { deleteDatabaseAsync } = await import('expo-sqlite');
    await deleteDatabaseAsync(DATABASE_NAME);
    return { mode, handle: await initializeDatabase() };
  } catch (cause) {
    if (cause instanceof DatabaseError) throw cause;
    const error = new DatabaseError('RECOVERY_FAILED', `Database ${mode} recovery failed.`, cause);
    lastError = error;
    throw error;
  } finally {
    recoveryInProgress = false;
  }
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
