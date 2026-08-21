import { describe, expect, test } from "bun:test";
import { AetherCloudError } from "@/services/cloud/errors";
import type {
  AetherSyncChange,
  AetherSyncMutation,
  AetherSyncMutationResult,
  AetherSyncNegotiation,
  AetherSyncPullResponse,
} from "@/services/cloud/syncTypes";
import { applyPragmas, runMigrations } from "@/db/migrator";
import { createBunSqliteDatabase } from "@/db/bunSqliteAdapter";
import { createRepositories } from "@/db/repositories";
import { SyncOutboxRepository } from "@/db/repositories/syncOutboxRepository";
import type { SqlDatabase } from "@/db/types";
import { SyncEngine, type SyncTransport } from "./engine";

async function readyDb(): Promise<SqlDatabase> {
  const db = createBunSqliteDatabase();
  await applyPragmas(db);
  await runMigrations(db);
  return db;
}

const negotiation: AetherSyncNegotiation = {
  protocolVersion: 1,
  protocolCapabilities: ["push", "pull", "tombstones", "conflicts"],
  collections: ["tasks", "reminders", "captures", "preferences"],
  service: { available: true },
};

class FakeSyncTransport implements SyncTransport {
  readonly pushed: AetherSyncMutation[][] = [];
  pushFailures = 0;
  pushResult: AetherSyncMutationResult = { status: "applied", version: 1 };
  pullPages: AetherSyncPullResponse[] = [];
  pullCursors: (string | null)[] = [];
  negotiateCalls = 0;

  async negotiateSync(): Promise<AetherSyncNegotiation> {
    this.negotiateCalls += 1;
    return negotiation;
  }

  async pushSync(
    mutations: readonly AetherSyncMutation[],
  ): Promise<{ results: AetherSyncMutationResult[] }> {
    this.pushed.push([...mutations]);
    if (this.pushFailures > 0) {
      this.pushFailures -= 1;
      throw new AetherCloudError("TIMEOUT", "timeout");
    }
    return { results: mutations.map(() => this.pushResult) };
  }

  async pullSync(cursor: string | null): Promise<AetherSyncPullResponse> {
    this.pullCursors.push(cursor);
    return (
      this.pullPages.shift() ?? {
        changes: [],
        nextCursor: null,
        hasMore: false,
      }
    );
  }
}

function taskPayload(
  id: string,
  title: string,
  projectId: string | null = null,
) {
  return {
    id,
    title,
    notes: null,
    completed: false,
    priority: "medium",
    projectId,
    dueDate: null,
    dueTime: null,
    dueTimezone: null,
    dueSemantics: "floating",
    source: "manual",
    creationOrigin: "manual",
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
    completedAt: null,
  };
}

describe("Mobile Sync Engine", () => {
  test("retries the same durable mutation ID and accepts already-applied acknowledgement", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    await sync.bindScope({ accountId: "account-a", deviceId: "device-a" });
    const task = await createRepositories(db).tasks.create({
      id: "task-retry",
      title: "Retry me",
    });
    const transport = new FakeSyncTransport();
    transport.pushFailures = 1;
    transport.pushResult = { status: "already_applied", version: 7 };
    transport.pullPages.push({
      changes: [
        {
          collection: "tasks",
          entityId: task.id,
          operation: "upsert",
          version: 7,
          payload: taskPayload(task.id, task.title),
          tombstone: false,
        },
      ],
      nextCursor: "cursor-7",
      hasMore: false,
    });
    const engine = new SyncEngine(db, transport);

    const first = await engine.runOnce();
    expect(first.phase).toBe("offline");
    expect(
      await sync.getOutboxDepth({
        accountId: "account-a",
        deviceId: "device-a",
      }),
    ).toBe(1);

    const second = await engine.runOnce();
    expect(second.pushedMutations).toBe(1);
    expect(transport.pushed).toHaveLength(2);
    expect(transport.pushed[0]?.[0]?.mutationId).toBe(
      transport.pushed[1]?.[0]?.mutationId,
    );
    expect(
      await sync.getOutboxDepth({
        accountId: "account-a",
        deviceId: "device-a",
      }),
    ).toBe(0);
    expect(
      await sync.getCursor({ accountId: "account-a", deviceId: "device-a" }),
    ).toBe("cursor-7");
    expect(transport.negotiateCalls).toBe(1);
    await db.closeAsync?.();
  });

  test("does not advance the cursor when page reconciliation fails, then safely replays", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    await sync.bindScope({ accountId: "account-a", deviceId: "device-a" });
    const transport = new FakeSyncTransport();
    transport.pullPages.push({
      changes: [
        {
          collection: "tasks",
          entityId: "remote-task",
          operation: "upsert",
          version: 1,
          payload: { invalid: true },
          tombstone: false,
        } as unknown as AetherSyncChange,
      ],
      nextCursor: "cursor-bad",
      hasMore: false,
    });
    const engine = new SyncEngine(db, transport);
    const failed = await engine.runOnce();
    expect(failed.phase).toBe("delayed");
    expect(
      await sync.getCursor({ accountId: "account-a", deviceId: "device-a" }),
    ).toBeNull();

    transport.pullPages.push({
      changes: [
        {
          collection: "tasks",
          entityId: "remote-task",
          operation: "upsert",
          version: 1,
          payload: taskPayload("remote-task", "Remote"),
          tombstone: false,
        },
      ],
      nextCursor: "cursor-1",
      hasMore: false,
    });
    const recovered = await engine.runOnce();
    expect(recovered.appliedChanges).toBe(1);
    expect(
      await sync.getCursor({ accountId: "account-a", deviceId: "device-a" }),
    ).toBe("cursor-1");
    expect(
      await db.getFirstAsync<{ title: string }>(
        "SELECT title FROM tasks WHERE id = ?",
        ["remote-task"],
      ),
    ).toEqual({ title: "Remote" });

    transport.pullPages.push({
      changes: [
        {
          collection: "tasks",
          entityId: "remote-task",
          operation: "upsert",
          version: 1,
          payload: taskPayload("remote-task", "Remote"),
          tombstone: false,
        },
      ],
      nextCursor: "cursor-1",
      hasMore: false,
    });
    const replay = await engine.runOnce();
    expect(replay.appliedChanges).toBe(0);
    expect(
      await sync.getCursor({ accountId: "account-a", deviceId: "device-a" }),
    ).toBe("cursor-1");
    await db.closeAsync?.();
  });

  test("resets only the scoped cursor when Cloud rejects a stale cursor", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    const scope = { accountId: "account-a", deviceId: "device-a" };
    await sync.bindScope(scope);
    await sync.saveCursorInTransaction(scope, "stale-cursor");
    const transport = new FakeSyncTransport();
    transport.pullPages.push({
      changes: [
        {
          collection: "tasks",
          entityId: "cursor-reset-task",
          operation: "upsert",
          version: 1,
          payload: taskPayload("cursor-reset-task", "Recovered"),
          tombstone: false,
        },
      ],
      nextCursor: "fresh-cursor",
      hasMore: false,
    });
    const originalPull = transport.pullSync.bind(transport);
    let rejected = false;
    transport.pullSync = async (cursor) => {
      if (!rejected) {
        rejected = true;
        transport.pullCursors.push(cursor);
        throw new AetherCloudError("SYNC_CURSOR_INVALID", "stale cursor");
      }
      return originalPull(cursor);
    };

    const result = await new SyncEngine(db, transport).runOnce();
    expect(result.appliedChanges).toBe(1);
    expect(transport.pullCursors).toEqual(["stale-cursor", null]);
    expect(await sync.getCursor(scope)).toBe("fresh-cursor");
    await db.closeAsync?.();
  });

  test("preserves local state and remote payload on conflict", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    await sync.bindScope({ accountId: "account-a", deviceId: "device-a" });
    const task = await createRepositories(db).tasks.create({
      id: "task-conflict",
      title: "Local title",
    });
    const transport = new FakeSyncTransport();
    transport.pushResult = { status: "conflict", currentVersion: 4 };
    transport.pullPages.push({
      changes: [
        {
          collection: "tasks",
          entityId: task.id,
          operation: "upsert",
          version: 4,
          payload: taskPayload(task.id, "Remote title"),
          tombstone: false,
        },
      ],
      nextCursor: "cursor-conflict",
      hasMore: false,
    });
    const result = await new SyncEngine(db, transport).runOnce();
    expect(result.conflictCount).toBeGreaterThan(0);
    expect(
      await db.getFirstAsync<{ title: string }>(
        "SELECT title FROM tasks WHERE id = ?",
        [task.id],
      ),
    ).toEqual({ title: "Local title" });
    const conflict = await db.getFirstAsync<{
      state: string;
      remote_version: number;
      remote_payload_json: string;
    }>(
      `SELECT state, remote_version, remote_payload_json
       FROM sync_outbox WHERE entity_id = ?`,
      [task.id],
    );
    expect(conflict?.state).toBe("conflict");
    expect(conflict?.remote_version).toBe(4);
    expect(JSON.parse(conflict?.remote_payload_json ?? "{}").title).toBe(
      "Remote title",
    );
    await db.closeAsync?.();
  });

  test("applies paginated tombstones without recreating deleted entities", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    await sync.bindScope({ accountId: "account-a", deviceId: "device-a" });
    const transport = new FakeSyncTransport();
    transport.pullPages.push(
      {
        changes: [
          {
            collection: "tasks",
            entityId: "remote-delete",
            operation: "upsert",
            version: 1,
            payload: taskPayload("remote-delete", "Temporary"),
            tombstone: false,
          },
        ],
        nextCursor: "cursor-1",
        hasMore: true,
      },
      {
        changes: [
          {
            collection: "tasks",
            entityId: "remote-delete",
            operation: "delete",
            version: 2,
            payload: null,
            tombstone: true,
          },
        ],
        nextCursor: "cursor-2",
        hasMore: false,
      },
    );
    const result = await new SyncEngine(db, transport).runOnce();
    expect(result.pulledChanges).toBe(2);
    const repos = createRepositories(db);
    expect(await repos.tasks.getById("remote-delete")).toBeNull();
    expect(
      await repos.tasks.getById("remote-delete", { includeDeleted: true }),
    ).not.toBeNull();
    expect(
      await sync.getCursor({ accountId: "account-a", deviceId: "device-a" }),
    ).toBe("cursor-2");
    await db.closeAsync?.();
  });

  test("preserves a local-only project association when the remote project is absent", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    await sync.bindScope({ accountId: "account-a", deviceId: "device-a" });
    const repos = createRepositories(db);
    const project = await repos.projects.create({
      id: "project-local",
      name: "Local project",
    });
    const task = await repos.tasks.create({
      id: "task-project",
      title: "Keep project",
      projectId: project.id,
    });
    const transport = new FakeSyncTransport();
    await new SyncEngine(db, transport).runOnce();
    transport.pullPages.push({
      changes: [
        {
          collection: "tasks",
          entityId: task.id,
          operation: "upsert",
          version: 2,
          payload: taskPayload(task.id, "Remote title", "project-remote-only"),
          tombstone: false,
        },
      ],
      nextCursor: "cursor-project",
      hasMore: false,
    });
    await new SyncEngine(db, transport).runOnce();
    expect(
      await db.getFirstAsync<{ project_id: string }>(
        "SELECT project_id FROM tasks WHERE id = ?",
        [task.id],
      ),
    ).toEqual({ project_id: project.id });
    await db.closeAsync?.();
  });

  test("does not materialize host-private image paths from a remote capture", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    await sync.bindScope({ accountId: "account-a", deviceId: "device-a" });
    const task = await createRepositories(db).tasks.create({
      id: "capture-remote-task",
      title: "Capture task",
    });
    const transport = new FakeSyncTransport();
    transport.pullPages.push({
      changes: [
        {
          collection: "captures",
          entityId: "capture-remote",
          operation: "upsert",
          version: 1,
          payload: {
            captureId: "capture-remote",
            taskId: task.id,
            ingress: "share",
            committedAt: "2030-01-01T00:00:00.000Z",
            sources: [
              {
                id: "remote-url",
                kind: "url",
                url: "https://example.com",
                createdAt: "2030-01-01T00:00:00.000Z",
              },
              {
                id: "remote-image",
                kind: "image",
                hasAsset: true,
                mimeType: "image/png",
                sizeBytes: 12,
                displayName: "Screenshot",
                createdAt: "2030-01-01T00:00:00.000Z",
              },
            ],
          },
          tombstone: false,
        },
      ],
      nextCursor: "cursor-capture",
      hasMore: false,
    });
    await new SyncEngine(db, transport).runOnce();
    expect(
      await db.getAllAsync<{ kind: string; asset_ref: string | null }>(
        `SELECT kind, asset_ref FROM task_capture_sources WHERE task_id = ?`,
        [task.id],
      ),
    ).toEqual([{ kind: "url", asset_ref: null }]);
    await db.closeAsync?.();
  });

  test("does not overwrite a device-global row after an account switch collision", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    const accountA = { accountId: "account-a", deviceId: "device-a" };
    const accountB = { accountId: "account-b", deviceId: "device-b" };
    await sync.bindScope(accountA);
    const repos = createRepositories(db);
    await repos.tasks.create({ id: "shared-entity", title: "Account A" });
    const transport = new FakeSyncTransport();
    await new SyncEngine(db, transport).runOnce();
    await sync.bindScope(accountB);
    transport.pullPages.push({
      changes: [
        {
          collection: "tasks",
          entityId: "shared-entity",
          operation: "upsert",
          version: 1,
          payload: taskPayload("shared-entity", "Account B"),
          tombstone: false,
        },
      ],
      nextCursor: "account-b-cursor-1",
      hasMore: false,
    });
    await new SyncEngine(db, transport).runOnce();
    expect(
      await db.getFirstAsync<{ title: string }>(
        "SELECT title FROM tasks WHERE id = ?",
        ["shared-entity"],
      ),
    ).toEqual({ title: "Account A" });
    expect(
      await db.getFirstAsync<{ ownership_blocked: number; version: number }>(
        `SELECT ownership_blocked, version FROM sync_entity_state
         WHERE account_id = ? AND collection = 'tasks' AND entity_id = ?`,
        [accountB.accountId, "shared-entity"],
      ),
    ).toEqual({ ownership_blocked: 1, version: 1 });

    await repos.tasks.update("shared-entity", { title: "Local B edit" });
    expect(
      await db.getFirstAsync<{ state: string; last_error_code: string | null }>(
        `SELECT state, last_error_code FROM sync_outbox
         WHERE account_id = ? AND collection = 'tasks' AND entity_id = ?
         ORDER BY sequence DESC LIMIT 1`,
        [accountB.accountId, "shared-entity"],
      ),
    ).toEqual({
      state: "blocked",
      last_error_code: "ACCOUNT_ENTITY_COLLISION",
    });

    transport.pullPages.push({
      changes: [
        {
          collection: "tasks",
          entityId: "shared-entity",
          operation: "upsert",
          version: 2,
          payload: taskPayload("shared-entity", "Account B v2"),
          tombstone: false,
        },
      ],
      nextCursor: "account-b-cursor-2",
      hasMore: false,
    });
    await new SyncEngine(db, transport).runOnce();
    expect(
      await db.getFirstAsync<{ title: string }>(
        "SELECT title FROM tasks WHERE id = ?",
        ["shared-entity"],
      ),
    ).toEqual({ title: "Local B edit" });
    await db.closeAsync?.();
  });

  test("remote reminder tombstones preserve cancellation state for notification projection", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    const scope = { accountId: "account-a", deviceId: "device-a" };
    await sync.bindScope(scope);
    const repos = createRepositories(db);
    const task = await repos.tasks.create({
      id: "reminder-task",
      title: "Reminder task",
    });
    const reminder = await repos.reminders.create({
      id: "reminder-tombstone",
      taskId: task.id,
      scheduledDate: "2030-01-02",
      scheduledTime: "09:00",
    });
    await db.runAsync(
      `UPDATE reminders SET native_notification_id = ?, projection_state = 'scheduled'
       WHERE id = ?`,
      ["native-1", reminder.id],
    );
    const transport = new FakeSyncTransport();
    await new SyncEngine(db, transport).runOnce();
    transport.pullPages.push({
      changes: [
        {
          collection: "reminders",
          entityId: reminder.id,
          operation: "delete",
          version: 2,
          payload: null,
          tombstone: true,
        },
      ],
      nextCursor: "reminder-tombstone-cursor",
      hasMore: false,
    });
    await new SyncEngine(db, transport).runOnce();
    expect(
      await db.getFirstAsync<{
        enabled: number;
        cancelled_at: string | null;
        native_notification_id: string | null;
        projection_dirty: number;
      }>(
        `SELECT enabled, cancelled_at, native_notification_id, projection_dirty
         FROM reminders WHERE id = ?`,
        [reminder.id],
      ),
    ).toMatchObject({
      enabled: 0,
      native_notification_id: "native-1",
      projection_dirty: 1,
    });
    expect(
      await db.getFirstAsync<{ cancelled_at: string | null }>(
        "SELECT cancelled_at FROM reminders WHERE id = ?",
        [reminder.id],
      ),
    ).toMatchObject({ cancelled_at: expect.any(String) });

    transport.pullPages.push({
      changes: [
        {
          collection: "reminders",
          entityId: reminder.id,
          operation: "upsert",
          version: 3,
          payload: {
            id: reminder.id,
            taskId: task.id,
            scheduledDate: "2030-01-02",
            scheduledTime: "10:00",
            timezone: null,
            semantics: "floating",
            enabled: true,
            timingPrecision: "normal",
            kind: "primary",
            reason: null,
            generationSource: "manual",
            policyVersion: "baseline-v1",
            idempotencyKey: null,
            createdAt: reminder.createdAt,
            updatedAt: "2030-01-02T10:00:00.000Z",
          },
          tombstone: false,
        },
      ],
      nextCursor: "reminder-upsert-cursor",
      hasMore: false,
    });
    await new SyncEngine(db, transport).runOnce();
    expect(
      await db.getFirstAsync<{
        enabled: number;
        cancelled_at: string | null;
        consumed_at: string | null;
        native_notification_id: string | null;
      }>(
        `SELECT enabled, cancelled_at, consumed_at, native_notification_id
         FROM reminders WHERE id = ?`,
        [reminder.id],
      ),
    ).toEqual({
      enabled: 1,
      cancelled_at: null,
      consumed_at: null,
      native_notification_id: "native-1",
    });
    await db.closeAsync?.();
  });

  test("reconciles recurrence entities and tombstones in the reminders collection", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    await sync.bindScope({ accountId: "account-a", deviceId: "device-a" });
    await db.runAsync(
      `INSERT INTO tasks (
        id, title, created_at, updated_at
      ) VALUES (?, ?, ?, ?)`,
      [
        "recurrence-remote-task",
        "Recurring task",
        "2030-01-01T00:00:00.000Z",
        "2030-01-01T00:00:00.000Z",
      ],
    );
    const transport = new FakeSyncTransport();
    const recurrencePayload = {
      id: "rule-remote",
      taskId: "recurrence-remote-task",
      lastCompletedTaskId: null,
      frequency: "daily",
      interval: 1,
      weekdays: null,
      monthDays: null,
      startDate: "2030-01-01",
      endDate: null,
      maxOccurrences: null,
      occurrenceCount: 1,
      mode: "fixed",
      timezone: null,
      active: true,
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:00:00.000Z",
    };
    transport.pullPages.push(
      {
        changes: [
          {
            collection: "reminders",
            entityId: "recurrence:rule-remote",
            operation: "upsert",
            version: 1,
            payload: recurrencePayload,
            tombstone: false,
          },
        ],
        nextCursor: "cursor-rule-1",
        hasMore: true,
      },
      {
        changes: [
          {
            collection: "reminders",
            entityId: "recurrence:rule-remote",
            operation: "delete",
            version: 2,
            payload: null,
            tombstone: true,
          },
        ],
        nextCursor: "cursor-rule-2",
        hasMore: false,
      },
    );
    const result = await new SyncEngine(db, transport).runOnce();
    expect(result.pulledChanges).toBe(2);
    expect(
      await db.getFirstAsync<{ c: number }>(
        "SELECT COUNT(*) AS c FROM recurrence_rules WHERE id = ?",
        ["rule-remote"],
      ),
    ).toEqual({ c: 0 });
    expect(
      await sync.getCursor({ accountId: "account-a", deviceId: "device-a" }),
    ).toBe("cursor-rule-2");
    await db.closeAsync?.();
  });
});
