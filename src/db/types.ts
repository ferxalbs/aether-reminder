/**
 * Narrow SQL executor surface.
 * Production: expo-sqlite. Tests: bun:sqlite adapter.
 * Screens never import either driver directly.
 */

export type SqlValue = string | number | null | boolean | Uint8Array;

export type SqlBindParams = SqlValue[] | Record<string, SqlValue>;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: SqlBindParams): Promise<SqlRunResult>;
  getFirstAsync<T>(source: string, params?: SqlBindParams): Promise<T | null>;
  getAllAsync<T>(source: string, params?: SqlBindParams): Promise<T[]>;
  /**
   * Run task inside a transaction. On throw → ROLLBACK.
   * Nested transactions are not supported; callers must not nest.
   */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync?(): Promise<void>;
}
