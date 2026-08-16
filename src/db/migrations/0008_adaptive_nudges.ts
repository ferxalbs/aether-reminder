import type { Migration } from "./types";

/** Durable adaptive nudge intent plus local-only behavioral learning state. */
export const migration0008AdaptiveNudges: Migration = {
  version: 8,
  name: "0008_adaptive_nudges",
  async up(db) {
    await db.execAsync(`
      ALTER TABLE reminders ADD COLUMN kind TEXT NOT NULL DEFAULT 'primary'
        CHECK (kind IN ('primary', 'adaptive_followup'));
      ALTER TABLE reminders ADD COLUMN reason TEXT;
      ALTER TABLE reminders ADD COLUMN generation_source TEXT NOT NULL DEFAULT 'manual';
      ALTER TABLE reminders ADD COLUMN policy_version TEXT NOT NULL DEFAULT 'baseline-v1';
      ALTER TABLE reminders ADD COLUMN idempotency_key TEXT;
      ALTER TABLE reminders ADD COLUMN cancelled_at TEXT;
      ALTER TABLE reminders ADD COLUMN consumed_at TEXT;

      CREATE UNIQUE INDEX idx_reminders_idempotency_key
        ON reminders(idempotency_key)
        WHERE idempotency_key IS NOT NULL;
      CREATE INDEX idx_reminders_task_kind_schedule
        ON reminders(task_id, kind, scheduled_date, scheduled_time);
      CREATE INDEX idx_reminders_nudge_day
        ON reminders(kind, scheduled_date, enabled, updated_at);

      CREATE TABLE nudge_events (
        id TEXT PRIMARY KEY NOT NULL,
        event_type TEXT NOT NULL,
        task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        nudge_id TEXT REFERENCES reminders(id) ON DELETE SET NULL,
        occurred_at TEXT NOT NULL,
        local_weekday INTEGER NOT NULL CHECK (local_weekday BETWEEN 0 AND 6),
        time_bucket TEXT NOT NULL
          CHECK (time_bucket IN ('morning', 'midday', 'afternoon', 'evening')),
        source TEXT NOT NULL,
        numeric_value REAL,
        secondary_numeric_value REAL,
        policy_version TEXT NOT NULL,
        dedupe_key TEXT UNIQUE
      );

      CREATE INDEX idx_nudge_events_task_time
        ON nudge_events(task_id, occurred_at DESC);
      CREATE INDEX idx_nudge_events_type_time
        ON nudge_events(event_type, occurred_at DESC);
      CREATE INDEX idx_nudge_events_nudge_time
        ON nudge_events(nudge_id, occurred_at DESC);

      CREATE TABLE nudge_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        profile_json TEXT NOT NULL,
        policy_version TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  },
};
