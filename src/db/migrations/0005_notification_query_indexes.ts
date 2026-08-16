import type { Migration } from "./types";

/**
 * Covers notification projection reads without changing the shipped schema:
 * - schedule ordering for full reconciliation/list reads
 * - enabled/status + schedule ordering for active reminder reads
 * - task-scoped reminder ordering
 * - timezone lookups used by fixed/floating projection decisions
 *
 * Reminder `id` is already indexed by its PRIMARY KEY constraint.
 */
export const migration0005NotificationQueryIndexes: Migration = {
  version: 5,
  name: "0005_notification_query_indexes",
  async up(db) {
    await db.execAsync(`
      DROP INDEX IF EXISTS idx_reminders_enabled_date;
      DROP INDEX IF EXISTS idx_reminders_task;

      CREATE INDEX idx_reminders_schedule
        ON reminders (scheduled_date, scheduled_time, id);

      CREATE INDEX idx_reminders_enabled_schedule
        ON reminders (enabled, scheduled_date, scheduled_time, id)
        WHERE enabled = 1;

      CREATE INDEX idx_reminders_task_schedule
        ON reminders (task_id, scheduled_date, scheduled_time, id);

      CREATE INDEX idx_reminders_timezone
        ON reminders (timezone)
        WHERE timezone IS NOT NULL;
    `);
  },
};
