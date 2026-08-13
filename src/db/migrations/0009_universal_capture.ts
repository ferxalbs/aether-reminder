import type { Migration } from './types';

/**
 * Authoritative capture/task linkage and minimal committed source references.
 * The external ingress journal intentionally lives in a separate SQLite file.
 */
export const migration0009UniversalCapture: Migration = {
  version: 9,
  name: '0009_universal_capture',
  async up(db) {
    await db.execAsync(`
      CREATE TABLE capture_commits (
        capture_id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
        ingress TEXT NOT NULL,
        committed_at TEXT NOT NULL
      );

      CREATE TABLE task_capture_sources (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('url', 'image')),
        url TEXT,
        asset_ref TEXT,
        mime_type TEXT,
        size_bytes INTEGER,
        display_name TEXT,
        created_at TEXT NOT NULL,
        CHECK (
          (kind = 'url' AND url IS NOT NULL AND asset_ref IS NULL AND mime_type IS NULL)
          OR
          (kind = 'image' AND url IS NULL AND asset_ref IS NOT NULL AND mime_type IS NOT NULL)
        )
      );

      CREATE INDEX idx_task_capture_sources_task
        ON task_capture_sources(task_id, position);
    `);
  },
};
