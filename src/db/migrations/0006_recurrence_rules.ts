import type { Migration } from './types';

/** First-class local recurrence rules. Appended schema; never edits shipped migrations. */
export const migration0006RecurrenceRules: Migration = {
  version: 6,
  name: '0006_recurrence_rules',
  async up(db) {
    await db.execAsync(`
      CREATE TABLE recurrence_rules (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        frequency TEXT NOT NULL
          CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
        interval INTEGER NOT NULL DEFAULT 1 CHECK (interval >= 1),
        weekdays_json TEXT,
        month_days_json TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        max_occurrences INTEGER CHECK (max_occurrences IS NULL OR max_occurrences >= 1),
        occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
        mode TEXT NOT NULL DEFAULT 'fixed'
          CHECK (mode IN ('fixed', 'after_completion')),
        timezone TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX recurrence_rules_active_task_idx
        ON recurrence_rules(task_id)
        WHERE active = 1;

      CREATE INDEX recurrence_rules_active_idx
        ON recurrence_rules(active, updated_at);
    `);
  },
};
