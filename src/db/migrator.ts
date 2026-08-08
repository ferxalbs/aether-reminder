import { DatabaseError } from './errors';
import { LATEST_SCHEMA_VERSION, MIGRATIONS, type Migration } from './migrations';
import type { SqlDatabase } from './types';
import { reportNonFatalError } from '@/lib/nonFatalError';

export interface MigrationResult {
  fromVersion: number;
  toVersion: number;
  applied: string[];
}

export async function getSchemaVersion(db: SqlDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Apply pending migrations in order using PRAGMA user_version.
 * Each migration runs in its own transaction; failure rolls back that migration
 * and does NOT advance user_version.
 */
export async function runMigrations(
  db: SqlDatabase,
  migrations: readonly Migration[] = MIGRATIONS
): Promise<MigrationResult> {
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].version <= ordered[i - 1].version) {
      throw new DatabaseError(
        'MIGRATION_FAILED',
        `Migration versions must be strictly increasing (saw ${ordered[i - 1].version} then ${ordered[i].version}).`
      );
    }
  }

  const fromVersion = await getSchemaVersion(db);
  const applied: string[] = [];
  let current = fromVersion;

  for (const migration of ordered) {
    if (migration.version <= current) continue;

    if (migration.version !== current + 1 && current !== 0) {
      // Allow jumping only when starting from empty (0 → 1 is fine even if we have gaps later).
      // For non-empty, require contiguous versions relative to current chain.
      const nextExpected = current + 1;
      const hasNext = ordered.some((m) => m.version === nextExpected);
      if (hasNext && migration.version > nextExpected) {
        // Will be applied after intermediate ones; loop continues in order
      }
    }

    try {
      await db.withTransactionAsync(async () => {
        await migration.up(db);
        // PRAGMA user_version cannot use bound parameters safely across drivers.
        await db.execAsync(`PRAGMA user_version = ${migration.version}`);
      });
      applied.push(migration.name);
      current = migration.version;
    } catch (cause) {
      // Transaction rolled back → user_version unchanged. Fail closed.
      throw new DatabaseError(
        'MIGRATION_FAILED',
        `Migration ${migration.name} (v${migration.version}) failed; schema remains at v${current}.`,
        cause
      );
    }
  }

  const toVersion = await getSchemaVersion(db);
  if (toVersion !== LATEST_SCHEMA_VERSION && migrations === MIGRATIONS) {
    // Only enforce latest when using the app migration list.
    const maxAvailable = ordered[ordered.length - 1]?.version ?? 0;
    if (toVersion < maxAvailable) {
      throw new DatabaseError(
        'MIGRATION_PARTIAL',
        `Schema at v${toVersion}; expected v${maxAvailable} after migrations.`
      );
    }
  }

  return { fromVersion, toVersion, applied };
}

export async function applyPragmas(db: SqlDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  // WAL improves concurrent read performance; ignore if unsupported (e.g. some in-memory modes).
  try {
    await db.execAsync('PRAGMA journal_mode = WAL;');
  } catch (error) {
    // WAL is an optimization; retain the usable database if this driver does not support it.
    reportNonFatalError('sqlite-wal', error);
  }
}
