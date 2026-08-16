import type { Migration } from "./types";

/**
 * Core domain tables. Immutable once shipped — add later migrations to change.
 * Agent/runtime tables are added in 0003_agent_runtime (Slice 3).
 */
export const migration0001Core: Migration = {
  version: 1,
  name: "0001_core",
  async up(db) {
    await db.execAsync(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        notes TEXT,
        completed INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'medium'
          CHECK (priority IN ('low', 'medium', 'high')),
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        due_date TEXT,
        due_time TEXT,
        due_timezone TEXT,
        due_semantics TEXT NOT NULL DEFAULT 'floating'
          CHECK (due_semantics IN ('fixed', 'floating')),
        source TEXT NOT NULL DEFAULT 'manual',
        creation_origin TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        deleted_at TEXT
      );

      CREATE TABLE tags (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE task_tags (
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, tag_id)
      );

      CREATE TABLE reminders (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        scheduled_date TEXT,
        scheduled_time TEXT,
        timezone TEXT,
        semantics TEXT NOT NULL DEFAULT 'floating'
          CHECK (semantics IN ('fixed', 'floating')),
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE task_events (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL
          CHECK (type IN ('created', 'updated', 'completed', 'reopened', 'rescheduled', 'deleted')),
        payload_json TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL
      );

      CREATE TABLE app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
  },
};
