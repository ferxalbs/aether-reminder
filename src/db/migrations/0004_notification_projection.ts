import type { Migration } from "./types";

export const migration0004NotificationProjection: Migration = {
  version: 4,
  name: "0004_notification_projection",
  async up(db) {
    await db.execAsync(`
      ALTER TABLE reminders ADD COLUMN native_notification_id TEXT;
      ALTER TABLE reminders ADD COLUMN projection_error TEXT;
      CREATE INDEX idx_reminders_native_notification ON reminders(native_notification_id);
    `);
  },
};
