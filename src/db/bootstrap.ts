import { initializeDatabase } from "./client";
import { DatabaseError } from "./errors";
import {
  migrateLegacyTasks,
  type LegacyMigrationResult,
} from "./legacyMigration";

export type AppDataStatus = "idle" | "booting" | "ready" | "error";

export interface BootstrapResult {
  status: "ready";
  schemaFrom: number;
  schemaTo: number;
  appliedMigrations: string[];
  legacy: LegacyMigrationResult;
}

/**
 * Full app data bootstrap: open SQLite → migrations → legacy import.
 * Call once from root layout. Fail closed with typed errors.
 */
export async function bootstrapAppData(): Promise<BootstrapResult> {
  try {
    const handle = await initializeDatabase();
    const legacy = await migrateLegacyTasks(handle.db);
    return {
      status: "ready",
      schemaFrom: handle.migration.fromVersion,
      schemaTo: handle.migration.toVersion,
      appliedMigrations: handle.migration.applied,
      legacy,
    };
  } catch (cause) {
    if (cause instanceof DatabaseError) throw cause;
    throw new DatabaseError("INIT_FAILED", "App data bootstrap failed.", cause);
  }
}
