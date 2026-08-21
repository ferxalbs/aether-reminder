import type { Migration } from "./types";

/**
 * Durable local state for AETHER Sync v1.
 *
 * The empty account/device scope is intentional. Local-first mutations can
 * happen before Cloud identity bootstrap; bindScope claims only those rows
 * that have not already been associated with another account.
 */
export const migration0010Sync: Migration = {
  version: 10,
  name: "0010_sync",
  async up(db) {
    await db.execAsync(`
      CREATE TABLE sync_runtime (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        account_id TEXT,
        device_id TEXT,
        last_account_id TEXT,
        last_device_id TEXT,
        backfill_version INTEGER NOT NULL DEFAULT 0 CHECK (backfill_version >= 0),
        next_outbox_sequence INTEGER NOT NULL DEFAULT 0 CHECK (next_outbox_sequence >= 0),
        updated_at TEXT NOT NULL
      );

      INSERT INTO sync_runtime (
        id, account_id, device_id, last_account_id, last_device_id,
        backfill_version, next_outbox_sequence, updated_at
      ) VALUES (1, NULL, NULL, NULL, NULL, 0, 0, CURRENT_TIMESTAMP);

      CREATE TABLE sync_outbox (
        mutation_id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL DEFAULT '',
        device_id TEXT NOT NULL DEFAULT '',
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        collection TEXT NOT NULL CHECK (
          collection IN ('tasks', 'reminders', 'captures', 'preferences')
        ),
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
        base_version INTEGER CHECK (base_version IS NULL OR base_version >= 0),
        payload_json TEXT NOT NULL,
        client_modified_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        last_attempt_at TEXT,
        last_error_code TEXT,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (
          state IN ('pending', 'conflict', 'blocked')
        ),
        conflict_current_version INTEGER,
        remote_version INTEGER,
        remote_payload_json TEXT,
        remote_tombstone INTEGER CHECK (
          remote_tombstone IS NULL OR remote_tombstone IN (0, 1)
        )
      );

      CREATE INDEX idx_sync_outbox_pending
        ON sync_outbox(account_id, device_id, state, sequence, mutation_id);

      CREATE INDEX idx_sync_outbox_entity
        ON sync_outbox(account_id, collection, entity_id, state, created_at);

      CREATE TABLE sync_cursors (
        account_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        cursor TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, device_id)
      );

      CREATE TABLE sync_entity_state (
        account_id TEXT NOT NULL,
        collection TEXT NOT NULL CHECK (
          collection IN ('tasks', 'reminders', 'captures', 'preferences')
        ),
        entity_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 0),
        tombstone INTEGER NOT NULL CHECK (tombstone IN (0, 1)),
        ownership_blocked INTEGER NOT NULL DEFAULT 0 CHECK (ownership_blocked IN (0, 1)),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, collection, entity_id)
      );

      CREATE INDEX idx_sync_entity_lookup
        ON sync_entity_state(collection, entity_id, account_id);

      CREATE TABLE sync_preferences (
        account_id TEXT NOT NULL DEFAULT '',
        device_id TEXT NOT NULL DEFAULT '',
        id TEXT NOT NULL CHECK (id = 'settings'),
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, device_id, id)
      );

      CREATE INDEX idx_sync_preferences_scope
        ON sync_preferences(account_id, device_id, id);
    `);
  },
};
