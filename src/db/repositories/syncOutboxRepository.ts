import { createId } from "@/lib/id";
import type {
  AetherSyncCollection,
  AetherSyncMutation,
  AetherSyncMutationResult,
  AetherSyncOperation,
} from "@/services/cloud/syncTypes";
import type { SqlDatabase } from "../types";

export const SYNC_PULL_LIMIT = 500;
export const SYNC_PUSH_BATCH_LIMIT = 100;
export const SYNC_MUTATION_PAYLOAD_LIMIT_BYTES = 64 * 1024;
export const SYNC_REQUEST_LIMIT_BYTES = 512 * 1024;

export type SyncScope = {
  accountId: string;
  deviceId: string;
};

export type SyncEntityState = {
  accountId: string;
  collection: AetherSyncCollection;
  entityId: string;
  version: number;
  tombstone: boolean;
  ownershipBlocked: boolean;
};

export type SyncOutboxRow = AetherSyncMutation & {
  accountId: string;
  deviceId: string;
  sequence: number;
  createdAt: string;
  attemptCount: number;
  state: "pending" | "conflict" | "blocked";
};

type RuntimeRow = {
  account_id: string | null;
  device_id: string | null;
  last_account_id: string | null;
  last_device_id: string | null;
};

type OutboxDbRow = {
  mutation_id: string;
  account_id: string;
  device_id: string;
  sequence: number;
  collection: AetherSyncCollection;
  entity_id: string;
  operation: AetherSyncOperation;
  base_version: number | null;
  payload_json: string;
  client_modified_at: string;
  created_at: string;
  attempt_count: number;
  state: "pending" | "conflict" | "blocked";
};

type EntityStateDbRow = {
  account_id: string;
  collection: AetherSyncCollection;
  entity_id: string;
  version: number;
  tombstone: number;
  ownership_blocked: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function payloadJson(payload: unknown): string {
  let encoded: string;
  try {
    encoded = JSON.stringify(payload);
  } catch (error) {
    throw new Error("Sync payload must be JSON serializable.", {
      cause: error,
    });
  }
  if (encoded === undefined) {
    throw new Error("Sync payload must be JSON serializable.");
  }
  if (
    new TextEncoder().encode(encoded).byteLength >
    SYNC_MUTATION_PAYLOAD_LIMIT_BYTES
  ) {
    throw new Error("Sync payload exceeds the 64 KiB v1 limit.");
  }
  return encoded;
}

function mapOutboxRow(row: OutboxDbRow): SyncOutboxRow {
  return {
    mutationId: row.mutation_id,
    accountId: row.account_id,
    deviceId: row.device_id,
    sequence: row.sequence,
    collection: row.collection,
    entityId: row.entity_id,
    operation: row.operation,
    baseVersion: row.base_version,
    payload: JSON.parse(row.payload_json) as unknown,
    clientModifiedAt: row.client_modified_at,
    createdAt: row.created_at,
    attemptCount: row.attempt_count,
    state: row.state,
  };
}

export class SyncOutboxRepository {
  constructor(private readonly db: SqlDatabase) {}

  async getActiveScope(): Promise<SyncScope | null> {
    const row = await this.db.getFirstAsync<RuntimeRow>(
      `SELECT account_id, device_id, last_account_id, last_device_id
       FROM sync_runtime WHERE id = 1`,
    );
    if (!row?.account_id || !row.device_id) return null;
    return { accountId: row.account_id, deviceId: row.device_id };
  }

  /**
   * Bind the local pre-auth scope after canonical account/device bootstrap.
   * Rows owned by a previous account remain untouched and therefore cannot be
   * sent under the new account.
   */
  async bindScope(scope: SyncScope): Promise<void> {
    if (!scope.accountId || !scope.deviceId) {
      throw new Error("Sync scope requires canonical account and device IDs.");
    }
    await this.db.withTransactionAsync(async () => {
      const previous = await this.db.getFirstAsync<RuntimeRow>(
        `SELECT account_id, device_id, last_account_id, last_device_id
         FROM sync_runtime WHERE id = 1`,
      );
      const previousAccount =
        previous?.account_id ?? previous?.last_account_id ?? null;
      const previousDevice =
        previous?.device_id ?? previous?.last_device_id ?? null;

      if (
        previousAccount === scope.accountId &&
        previousDevice !== scope.deviceId
      ) {
        await this.db.runAsync(
          `UPDATE sync_outbox
           SET device_id = ?
           WHERE account_id = ? AND (device_id = ? OR device_id = '')`,
          [scope.deviceId, scope.accountId, previousDevice ?? ""],
        );
        await this.db.runAsync(
          `UPDATE sync_preferences
           SET device_id = ?
           WHERE account_id = ? AND (device_id = ? OR device_id = '')`,
          [scope.deviceId, scope.accountId, previousDevice ?? ""],
        );
      }

      const unbound = await this.db.getAllAsync<{
        mutation_id: string;
        collection: AetherSyncCollection;
        entity_id: string;
      }>(
        `SELECT mutation_id, collection, entity_id
         FROM sync_outbox
         WHERE account_id = '' AND device_id = ''`,
      );
      for (const row of unbound) {
        const existingOwner = await this.db.getFirstAsync<{
          account_id: string;
        }>(
          `SELECT account_id
           FROM sync_entity_state
           WHERE collection = ? AND entity_id = ? AND account_id != ''
           ORDER BY account_id = ? DESC
           LIMIT 1`,
          [row.collection, row.entity_id, scope.accountId],
        );
        if (existingOwner && existingOwner.account_id !== scope.accountId) {
          await this.db.runAsync(
            `UPDATE sync_outbox
             SET account_id = ?, device_id = ?, state = 'blocked',
                 last_error_code = 'ACCOUNT_SCOPE_CHANGED'
             WHERE mutation_id = ?`,
            [scope.accountId, scope.deviceId, row.mutation_id],
          );
          continue;
        }
        await this.db.runAsync(
          `UPDATE sync_outbox
           SET account_id = ?, device_id = ?
           WHERE mutation_id = ?`,
          [scope.accountId, scope.deviceId, row.mutation_id],
        );
      }

      const unboundPreferences = await this.db.getFirstAsync<{ c: number }>(
        `SELECT COUNT(*) AS c FROM sync_preferences
         WHERE account_id = '' AND device_id = ''`,
      );
      if (unboundPreferences?.c) {
        if (previousAccount && previousAccount !== scope.accountId) {
          await this.db.runAsync(
            `UPDATE sync_outbox
             SET account_id = ?, device_id = ?, state = 'blocked',
                 last_error_code = 'ACCOUNT_SCOPE_CHANGED'
             WHERE account_id = '' AND device_id = ''
               AND collection = 'preferences' AND entity_id = 'settings'
               AND state = 'pending'`,
            [scope.accountId, scope.deviceId],
          );
          await this.db.runAsync(
            `DELETE FROM sync_preferences
             WHERE account_id = '' AND device_id = ''`,
          );
        } else {
          await this.db.runAsync(
            `UPDATE sync_preferences
             SET account_id = ?, device_id = ?
             WHERE account_id = '' AND device_id = ''`,
            [scope.accountId, scope.deviceId],
          );
        }
      }

      const unboundStates = await this.db.getAllAsync<{
        collection: AetherSyncCollection;
        entity_id: string;
      }>(
        `SELECT collection, entity_id
         FROM sync_entity_state
         WHERE account_id = ''`,
      );
      for (const row of unboundStates) {
        const existing = await this.db.getFirstAsync<{ account_id: string }>(
          `SELECT account_id
           FROM sync_entity_state
           WHERE collection = ? AND entity_id = ? AND account_id = ?`,
          [row.collection, row.entity_id, scope.accountId],
        );
        if (existing) {
          await this.db.runAsync(
            `DELETE FROM sync_entity_state
             WHERE account_id = '' AND collection = ? AND entity_id = ?`,
            [row.collection, row.entity_id],
          );
        } else {
          await this.db.runAsync(
            `UPDATE sync_entity_state SET account_id = ?
             WHERE account_id = '' AND collection = ? AND entity_id = ?`,
            [scope.accountId, row.collection, row.entity_id],
          );
        }
      }

      await this.db.runAsync(
        `UPDATE sync_runtime
         SET account_id = ?, device_id = ?, last_account_id = ?,
             last_device_id = ?, updated_at = ?
         WHERE id = 1`,
        [
          scope.accountId,
          scope.deviceId,
          scope.accountId,
          scope.deviceId,
          nowIso(),
        ],
      );
    });
  }

  async clearActiveScope(): Promise<void> {
    await this.db.runAsync(
      `UPDATE sync_runtime
       SET account_id = NULL, device_id = NULL,
           last_account_id = account_id, last_device_id = device_id,
           updated_at = ?
       WHERE id = 1`,
      [nowIso()],
    );
  }

  async enqueueMutation(input: {
    collection: AetherSyncCollection;
    entityId: string;
    operation: AetherSyncOperation;
    payload: unknown;
    clientModifiedAt: string;
    mutationId?: string;
  }): Promise<string> {
    let mutationId = "";
    await this.db.withTransactionAsync(async () => {
      mutationId = await this.enqueueMutationInTransaction(input);
    });
    return mutationId;
  }

  /** Must be called from the caller's existing domain transaction. */
  async enqueueMutationInTransaction(input: {
    collection: AetherSyncCollection;
    entityId: string;
    operation: AetherSyncOperation;
    payload: unknown;
    clientModifiedAt: string;
    mutationId?: string;
  }): Promise<string> {
    if (input.operation === "delete" && input.payload !== null) {
      throw new Error("Sync delete mutations must have a null payload.");
    }
    const encodedPayload = payloadJson(input.payload);
    const runtime = await this.db.getFirstAsync<RuntimeRow>(
      `SELECT account_id, device_id, last_account_id, last_device_id
       FROM sync_runtime WHERE id = 1`,
    );
    const exactState = runtime?.account_id
      ? await this.db.getFirstAsync<EntityStateDbRow>(
          `SELECT * FROM sync_entity_state
           WHERE account_id = ? AND collection = ? AND entity_id = ?`,
          [runtime.account_id, input.collection, input.entityId],
        )
      : null;
    const anyState = exactState
      ? null
      : await this.db.getFirstAsync<EntityStateDbRow>(
          `SELECT * FROM sync_entity_state
           WHERE collection = ? AND entity_id = ?
           ORDER BY account_id = '' ASC, updated_at DESC
           LIMIT 1`,
          [input.collection, input.entityId],
        );
    const owner = exactState ?? anyState;
    const accountId = runtime?.account_id ?? "";
    const deviceId = runtime?.device_id ?? "";
    const accountScopeChanged = Boolean(
      runtime?.account_id &&
      owner?.account_id &&
      owner.account_id !== runtime.account_id,
    );
    const ownershipBlocked = Boolean(owner?.ownership_blocked);
    const baseVersion = owner && owner.version > 0 ? owner.version : null;
    const mutationId = input.mutationId ?? createId();
    const createdAt = nowIso();

    await this.db.runAsync(
      `UPDATE sync_runtime
       SET next_outbox_sequence = next_outbox_sequence + 1, updated_at = ?
       WHERE id = 1`,
      [createdAt],
    );
    const sequenceRow = await this.db.getFirstAsync<{
      next_outbox_sequence: number;
    }>(`SELECT next_outbox_sequence FROM sync_runtime WHERE id = 1`);
    const sequence = sequenceRow?.next_outbox_sequence;
    if (!sequence || sequence < 1) {
      throw new Error("Sync outbox sequence could not be allocated.");
    }

    if (!owner) {
      await this.db.runAsync(
        `INSERT INTO sync_entity_state (
          account_id, collection, entity_id, version, tombstone, updated_at
        ) VALUES (?, ?, ?, 0, 0, ?)`,
        [accountId, input.collection, input.entityId, createdAt],
      );
    }

    await this.db.runAsync(
      `INSERT INTO sync_outbox (
        mutation_id, account_id, device_id, sequence, collection, entity_id, operation,
        base_version, payload_json, client_modified_at, created_at,
        state, last_error_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mutationId,
        accountId,
        deviceId,
        sequence,
        input.collection,
        input.entityId,
        input.operation,
        baseVersion,
        encodedPayload,
        input.clientModifiedAt,
        createdAt,
        accountScopeChanged || ownershipBlocked ? "blocked" : "pending",
        accountScopeChanged
          ? "ACCOUNT_SCOPE_CHANGED"
          : ownershipBlocked
            ? "ACCOUNT_ENTITY_COLLISION"
            : null,
      ],
    );
    return mutationId;
  }

  async listPending(
    scope: SyncScope,
    limit = SYNC_PUSH_BATCH_LIMIT,
  ): Promise<SyncOutboxRow[]> {
    const rows = await this.db.getAllAsync<OutboxDbRow>(
      `SELECT o.*
       FROM sync_outbox o
       WHERE o.account_id = ?
         AND o.device_id = ?
         AND o.state = 'pending'
         AND NOT EXISTS (
           SELECT 1 FROM sync_outbox c
           WHERE c.account_id = o.account_id
             AND c.collection = o.collection
             AND c.entity_id = o.entity_id
             AND c.state = 'conflict'
         )
         AND NOT EXISTS (
           SELECT 1 FROM sync_outbox earlier
           WHERE earlier.account_id = o.account_id
             AND earlier.device_id = o.device_id
             AND earlier.collection = o.collection
             AND earlier.entity_id = o.entity_id
             AND earlier.state = 'pending'
            AND earlier.sequence < o.sequence
         )
       ORDER BY o.sequence ASC, o.mutation_id ASC
       LIMIT ?`,
      [
        scope.accountId,
        scope.deviceId,
        Math.max(1, Math.min(limit, SYNC_PUSH_BATCH_LIMIT)),
      ],
    );
    return rows.map(mapOutboxRow);
  }

  async markAttempt(mutationIds: readonly string[]): Promise<void> {
    if (mutationIds.length === 0) return;
    await this.db.withTransactionAsync(async () => {
      const now = nowIso();
      for (const mutationId of mutationIds) {
        await this.db.runAsync(
          `UPDATE sync_outbox
           SET attempt_count = attempt_count + 1, last_attempt_at = ?
           WHERE mutation_id = ?`,
          [now, mutationId],
        );
      }
    });
  }

  async recordFailure(
    mutationIds: readonly string[],
    code: string,
  ): Promise<void> {
    if (mutationIds.length === 0) return;
    await this.db.withTransactionAsync(async () => {
      for (const mutationId of mutationIds) {
        await this.db.runAsync(
          `UPDATE sync_outbox SET last_error_code = ? WHERE mutation_id = ?`,
          [code.slice(0, 64), mutationId],
        );
      }
    });
  }

  async acknowledge(
    rows: readonly SyncOutboxRow[],
    results: readonly AetherSyncMutationResult[],
  ): Promise<void> {
    if (rows.length !== results.length) {
      throw new Error("Sync push response count did not match the request.");
    }
    await this.db.withTransactionAsync(async () => {
      for (const [index, result] of results.entries()) {
        const row = rows[index];
        const exists = await this.db.getFirstAsync<{ mutation_id: string }>(
          "SELECT mutation_id FROM sync_outbox WHERE mutation_id = ?",
          [row.mutationId],
        );
        if (!exists) continue;

        if (result.status === "conflict") {
          await this.db.runAsync(
            `UPDATE sync_outbox
             SET state = 'conflict', conflict_current_version = ?,
                 last_error_code = 'CONFLICT'
             WHERE mutation_id = ?`,
            [result.currentVersion, row.mutationId],
          );
          await this.db.runAsync(
            `UPDATE sync_outbox
             SET state = 'blocked', last_error_code = 'CONFLICT_BLOCKED'
             WHERE account_id = ? AND collection = ? AND entity_id = ?
               AND state = 'pending' AND mutation_id != ?`,
            [row.accountId, row.collection, row.entityId, row.mutationId],
          );
          continue;
        }

        await this.db.runAsync(
          "DELETE FROM sync_outbox WHERE mutation_id = ?",
          [row.mutationId],
        );
        await this.upsertEntityStateInTransaction({
          accountId: row.accountId,
          collection: row.collection,
          entityId: row.entityId,
          version: result.version,
          tombstone: row.operation === "delete",
        });
        await this.db.runAsync(
          `UPDATE sync_outbox
           SET base_version = ?, last_error_code = NULL
           WHERE account_id = ? AND device_id = ? AND collection = ?
             AND entity_id = ? AND state = 'pending'`,
          [
            result.version,
            row.accountId,
            row.deviceId,
            row.collection,
            row.entityId,
          ],
        );
      }
    });
  }

  async getCursor(scope: SyncScope): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ cursor: string | null }>(
      `SELECT cursor FROM sync_cursors WHERE account_id = ? AND device_id = ?`,
      [scope.accountId, scope.deviceId],
    );
    return row?.cursor ?? null;
  }

  async clearCursor(scope: SyncScope): Promise<void> {
    await this.db.runAsync(
      `DELETE FROM sync_cursors WHERE account_id = ? AND device_id = ?`,
      [scope.accountId, scope.deviceId],
    );
  }

  async saveCursorInTransaction(
    scope: SyncScope,
    cursor: string | null,
  ): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO sync_cursors (account_id, device_id, cursor, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id, device_id) DO UPDATE SET
         cursor = excluded.cursor, updated_at = excluded.updated_at`,
      [scope.accountId, scope.deviceId, cursor, nowIso()],
    );
  }

  async getScopedEntityStateInTransaction(
    scope: SyncScope,
    collection: AetherSyncCollection,
    entityId: string,
  ): Promise<SyncEntityState | null> {
    const row = await this.db.getFirstAsync<EntityStateDbRow>(
      `SELECT * FROM sync_entity_state
       WHERE account_id = ? AND collection = ? AND entity_id = ?`,
      [scope.accountId, collection, entityId],
    );
    return row ? mapEntityState(row) : null;
  }

  async getOtherAccountEntityStateInTransaction(
    scope: SyncScope,
    collection: AetherSyncCollection,
    entityId: string,
  ): Promise<SyncEntityState | null> {
    const row = await this.db.getFirstAsync<EntityStateDbRow>(
      `SELECT * FROM sync_entity_state
       WHERE account_id != '' AND account_id != ?
         AND collection = ? AND entity_id = ?
       ORDER BY updated_at DESC, account_id ASC
       LIMIT 1`,
      [scope.accountId, collection, entityId],
    );
    return row ? mapEntityState(row) : null;
  }

  async upsertEntityStateInTransaction(
    state: Omit<SyncEntityState, "ownershipBlocked"> & {
      ownershipBlocked?: boolean;
    },
  ): Promise<void> {
    const updatedAt = nowIso();
    if (state.ownershipBlocked === undefined) {
      await this.db.runAsync(
        `INSERT INTO sync_entity_state (
          account_id, collection, entity_id, version, tombstone, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id, collection, entity_id) DO UPDATE SET
          version = excluded.version,
          tombstone = excluded.tombstone,
          updated_at = excluded.updated_at`,
        [
          state.accountId,
          state.collection,
          state.entityId,
          state.version,
          state.tombstone ? 1 : 0,
          updatedAt,
        ],
      );
      return;
    }
    await this.db.runAsync(
      `INSERT INTO sync_entity_state (
        account_id, collection, entity_id, version, tombstone,
        ownership_blocked, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, collection, entity_id) DO UPDATE SET
        version = excluded.version,
        tombstone = excluded.tombstone,
        ownership_blocked = excluded.ownership_blocked,
        updated_at = excluded.updated_at`,
      [
        state.accountId,
        state.collection,
        state.entityId,
        state.version,
        state.tombstone ? 1 : 0,
        state.ownershipBlocked ? 1 : 0,
        updatedAt,
      ],
    );
  }

  async hasOpenMutationInTransaction(
    scope: SyncScope,
    collection: AetherSyncCollection,
    entityId: string,
  ): Promise<boolean> {
    const row = await this.db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM sync_outbox
       WHERE account_id = ? AND collection = ? AND entity_id = ?
         AND state IN ('pending', 'conflict', 'blocked')`,
      [scope.accountId, collection, entityId],
    );
    return (row?.c ?? 0) > 0;
  }

  async recordRemoteConflictInTransaction(input: {
    scope: SyncScope;
    collection: AetherSyncCollection;
    entityId: string;
    version: number;
    payload: unknown;
    tombstone: boolean;
  }): Promise<void> {
    const encoded = payloadJson(input.payload);
    const row = await this.db.getFirstAsync<{ mutation_id: string }>(
      `SELECT mutation_id FROM sync_outbox
       WHERE account_id = ? AND collection = ? AND entity_id = ?
         AND state IN ('pending', 'conflict', 'blocked')
       ORDER BY sequence ASC, mutation_id ASC LIMIT 1`,
      [input.scope.accountId, input.collection, input.entityId],
    );
    if (row) {
      await this.db.runAsync(
        `UPDATE sync_outbox
         SET state = 'conflict', conflict_current_version = ?,
             remote_version = ?, remote_payload_json = ?, remote_tombstone = ?,
             last_error_code = 'CONFLICT'
         WHERE mutation_id = ?`,
        [
          input.version,
          input.version,
          encoded,
          input.tombstone ? 1 : 0,
          row.mutation_id,
        ],
      );
      await this.db.runAsync(
        `UPDATE sync_outbox
         SET state = 'blocked', last_error_code = 'CONFLICT_BLOCKED'
         WHERE account_id = ? AND collection = ? AND entity_id = ?
           AND state = 'pending' AND mutation_id != ?`,
        [
          input.scope.accountId,
          input.collection,
          input.entityId,
          row.mutation_id,
        ],
      );
    }
    await this.upsertEntityStateInTransaction({
      accountId: input.scope.accountId,
      collection: input.collection,
      entityId: input.entityId,
      version: input.version,
      tombstone: input.tombstone,
    });
  }

  async getOutboxDepth(scope: SyncScope): Promise<number> {
    const row = await this.db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM sync_outbox
       WHERE account_id = ? AND device_id = ? AND state IN ('pending', 'conflict', 'blocked')`,
      [scope.accountId, scope.deviceId],
    );
    return row?.c ?? 0;
  }

  async getConflictCount(scope: SyncScope): Promise<number> {
    const row = await this.db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM sync_outbox
       WHERE account_id = ? AND state = 'conflict'`,
      [scope.accountId],
    );
    return row?.c ?? 0;
  }

  async readPreferencesInTransaction(
    scope?: SyncScope | null,
  ): Promise<string | null> {
    const resolvedScope = scope ?? (await this.getActiveScope());
    const accountId = resolvedScope?.accountId ?? "";
    const deviceId = resolvedScope?.deviceId ?? "";
    const row = await this.db.getFirstAsync<{ payload_json: string }>(
      `SELECT payload_json FROM sync_preferences
       WHERE account_id = ? AND device_id = ? AND id = 'settings'`,
      [accountId, deviceId],
    );
    return row?.payload_json ?? null;
  }

  async writePreferencesInTransaction(
    payload: unknown,
    updatedAt = nowIso(),
    scope?: SyncScope | null,
  ): Promise<void> {
    const encoded = payloadJson(payload);
    const resolvedScope = scope ?? (await this.getActiveScope());
    const accountId = resolvedScope?.accountId ?? "";
    const deviceId = resolvedScope?.deviceId ?? "";
    await this.db.runAsync(
      `INSERT INTO sync_preferences (
        account_id, device_id, id, payload_json, updated_at
      ) VALUES (?, ?, 'settings', ?, ?)
       ON CONFLICT(account_id, device_id, id) DO UPDATE SET
         payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
      [accountId, deviceId, encoded, updatedAt],
    );
  }

  /** Local preference write: SQLite snapshot and sync intent share one commit. */
  async writePreferencesAndEnqueue(
    payload: unknown,
    clientModifiedAt = nowIso(),
  ): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const scope = await this.getActiveScope();
      await this.writePreferencesInTransaction(
        payload,
        clientModifiedAt,
        scope,
      );
      await this.enqueueMutationInTransaction({
        collection: "preferences",
        entityId: "settings",
        operation: "upsert",
        payload,
        clientModifiedAt,
      });
    });
  }
}

function mapEntityState(row: EntityStateDbRow): SyncEntityState {
  return {
    accountId: row.account_id,
    collection: row.collection,
    entityId: row.entity_id,
    version: row.version,
    tombstone: row.tombstone === 1,
    ownershipBlocked: row.ownership_blocked === 1,
  };
}
