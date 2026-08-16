import type { SqlDatabase } from "../types";

export interface Migration {
  /** Monotonic integer version written to PRAGMA user_version after success. */
  readonly version: number;
  readonly name: string;
  up(db: SqlDatabase): Promise<void>;
}
