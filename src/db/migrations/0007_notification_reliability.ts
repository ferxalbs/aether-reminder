import type { Migration } from './types';

/** Durable reminder projection and notification-action recovery state. */
export const migration0007NotificationReliability: Migration = {
  version: 7,
  name: '0007_notification_reliability',
  async up(db) {
    await db.execAsync(`
      ALTER TABLE reminders ADD COLUMN projection_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (projection_state IN ('pending', 'scheduled', 'stale', 'failed', 'missing', 'not_required', 'blocked'));
      ALTER TABLE reminders ADD COLUMN projection_dirty INTEGER NOT NULL DEFAULT 1
        CHECK (projection_dirty IN (0, 1));
      ALTER TABLE reminders ADD COLUMN projection_revision INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE reminders ADD COLUMN projection_attempt_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE reminders ADD COLUMN projection_last_attempt_at TEXT;
      ALTER TABLE reminders ADD COLUMN projection_last_success_at TEXT;
      ALTER TABLE reminders ADD COLUMN projection_error_code TEXT;
      ALTER TABLE reminders ADD COLUMN timing_precision TEXT NOT NULL DEFAULT 'normal'
        CHECK (timing_precision IN ('exact', 'normal', 'flexible'));

      CREATE INDEX idx_reminders_projection_dirty
        ON reminders(projection_dirty, projection_state, updated_at);
      CREATE INDEX idx_reminders_projection_error
        ON reminders(projection_state, projection_error_code);

      CREATE TABLE notification_action_receipts (
        response_key TEXT PRIMARY KEY NOT NULL,
        native_notification_id TEXT NOT NULL,
        action_identifier TEXT NOT NULL,
        reminder_id TEXT REFERENCES reminders(id) ON DELETE SET NULL,
        target_date TEXT,
        target_time TEXT,
        target_timezone TEXT,
        target_semantics TEXT
          CHECK (target_semantics IS NULL OR target_semantics IN ('fixed', 'floating')),
        status TEXT NOT NULL DEFAULT 'claimed'
          CHECK (status IN ('claimed', 'completed')),
        attempt_count INTEGER NOT NULL DEFAULT 1,
        claimed_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE INDEX notification_action_receipts_reminder_idx
        ON notification_action_receipts(reminder_id, status, claimed_at);
    `);
  },
};
