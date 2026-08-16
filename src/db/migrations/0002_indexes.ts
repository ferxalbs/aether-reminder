import type { Migration } from "./types";

/**
 * Indexes for common task queries. Each index is intentional:
 * - tasks_active_due: today / overdue / upcoming filters on local due_date
 * - tasks_active_completed: completion toggles and completed lists
 * - tasks_active_project: project-scoped lists
 * - tasks_active_priority: priority filters
 * - tasks_active_title: cheap prefix/search support via title ordering
 * - task_events_task_created: history by task
 * - reminders_task: lookup by task
 */
export const migration0002Indexes: Migration = {
  version: 2,
  name: "0002_indexes",
  async up(db) {
    await db.execAsync(`
      CREATE INDEX idx_tasks_active_due
        ON tasks (due_date, completed)
        WHERE deleted_at IS NULL;

      CREATE INDEX idx_tasks_active_completed
        ON tasks (completed, updated_at)
        WHERE deleted_at IS NULL;

      CREATE INDEX idx_tasks_active_project
        ON tasks (project_id)
        WHERE deleted_at IS NULL AND project_id IS NOT NULL;

      CREATE INDEX idx_tasks_active_priority
        ON tasks (priority)
        WHERE deleted_at IS NULL;

      CREATE INDEX idx_task_events_task_created
        ON task_events (task_id, created_at);

      CREATE INDEX idx_reminders_task
        ON reminders (task_id);

      CREATE INDEX idx_reminders_enabled_date
        ON reminders (enabled, scheduled_date)
        WHERE enabled = 1;
    `);
  },
};
