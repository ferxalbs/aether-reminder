/**
 * In-memory SQL adapter for unit tests (Bun's built-in sqlite).
 * Not used in the app runtime — production uses expo-sqlite via client.ts.
 */
import { Database } from "bun:sqlite";
import type {
  SqlBindParams,
  SqlDatabase,
  SqlRunResult,
  SqlValue,
} from "./types";

function normalizeParams(
  params?: SqlBindParams,
): SqlValue[] | Record<string, SqlValue> | undefined {
  if (params === undefined) return undefined;
  if (Array.isArray(params)) {
    return params.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v));
  }
  const out: Record<string, SqlValue> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
  }
  return out;
}

export function createBunSqliteDatabase(filename = ":memory:"): SqlDatabase {
  const db = new Database(filename, { create: true });
  db.exec("PRAGMA foreign_keys = ON;");

  let txDepth = 0;

  const api: SqlDatabase = {
    async execAsync(source: string) {
      db.exec(source);
    },

    async runAsync(
      source: string,
      params?: SqlBindParams,
    ): Promise<SqlRunResult> {
      const stmt = db.prepare(source);
      const bound = normalizeParams(params);
      const result =
        bound === undefined
          ? stmt.run()
          : Array.isArray(bound)
            ? stmt.run(...bound)
            : stmt.run(
                bound as Record<
                  string,
                  string | number | null | Uint8Array | boolean
                >,
              );
      return {
        changes: result.changes,
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },

    async getFirstAsync<T>(
      source: string,
      params?: SqlBindParams,
    ): Promise<T | null> {
      const stmt = db.prepare(source);
      const bound = normalizeParams(params);
      const row =
        bound === undefined
          ? stmt.get()
          : Array.isArray(bound)
            ? stmt.get(...bound)
            : stmt.get(
                bound as Record<
                  string,
                  string | number | null | Uint8Array | boolean
                >,
              );
      return (row as T) ?? null;
    },

    async getAllAsync<T>(source: string, params?: SqlBindParams): Promise<T[]> {
      const stmt = db.prepare(source);
      const bound = normalizeParams(params);
      const rows =
        bound === undefined
          ? stmt.all()
          : Array.isArray(bound)
            ? stmt.all(...bound)
            : stmt.all(
                bound as Record<
                  string,
                  string | number | null | Uint8Array | boolean
                >,
              );
      return rows as T[];
    },

    async withTransactionAsync(task: () => Promise<void>) {
      if (txDepth === 0) {
        db.exec("BEGIN IMMEDIATE");
      } else {
        db.exec(`SAVEPOINT sp_${txDepth}`);
      }
      txDepth += 1;
      try {
        await task();
        txDepth -= 1;
        if (txDepth === 0) {
          db.exec("COMMIT");
        } else {
          db.exec(`RELEASE sp_${txDepth}`);
        }
      } catch (error) {
        txDepth -= 1;
        if (txDepth === 0) {
          db.exec("ROLLBACK");
        } else {
          db.exec(`ROLLBACK TO sp_${txDepth}`);
          db.exec(`RELEASE sp_${txDepth}`);
        }
        throw error;
      }
    },

    async closeAsync() {
      db.close();
    },
  };

  return api;
}
