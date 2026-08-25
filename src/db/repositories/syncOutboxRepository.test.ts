import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPragmas, runMigrations } from "../migrator";
import { createBunSqliteDatabase } from "../bunSqliteAdapter";
import type { SqlBindParams, SqlDatabase } from "../types";
import { createRepositories } from ".";
import { SyncOutboxRepository } from "./syncOutboxRepository";

async function readyDb(filename = ":memory:"): Promise<SqlDatabase> {
  const db = createBunSqliteDatabase(filename);
  await applyPragmas(db);
  await runMigrations(db);
  return db;
}

describe("SyncOutboxRepository", () => {
  test("task write and outbox intent commit together", async () => {
    const db = await readyDb();
    const repos = createRepositories(db);
    const task = await repos.tasks.create({
      id: "task-atomic",
      title: "Atomic",
    });

    const row = await db.getFirstAsync<{
      mutation_id: string;
      collection: string;
      entity_id: string;
      operation: string;
    }>(
      `SELECT mutation_id, collection, entity_id, operation
       FROM sync_outbox WHERE entity_id = ?`,
      [task.id],
    );
    expect(row?.mutation_id).toBeTruthy();
    expect(row?.collection).toBe("tasks");
    expect(row?.operation).toBe("upsert");
    await db.closeAsync?.();
  });

  test("outbox failure rolls back the domain mutation", async () => {
    const base = await readyDb();
    const wrapped: SqlDatabase = {
      execAsync: (source) => base.execAsync(source),
      getFirstAsync: (source, params) => base.getFirstAsync(source, params),
      getAllAsync: (source, params) => base.getAllAsync(source, params),
      closeAsync: () => base.closeAsync?.(),
      runAsync: async (source: string, params?: SqlBindParams) => {
        if (source.includes("INSERT INTO sync_outbox")) {
          throw new Error("forced outbox failure");
        }
        return base.runAsync(source, params);
      },
      withTransactionAsync: (task) => base.withTransactionAsync(task),
    };
    const repos = createRepositories(wrapped);

    await expect(
      repos.tasks.create({ id: "task-rollback", title: "Rollback" }),
    ).rejects.toThrow("forced outbox failure");
    expect(
      await base.getFirstAsync<{ c: number }>(
        "SELECT COUNT(*) AS c FROM tasks WHERE id = ?",
        ["task-rollback"],
      ),
    ).toEqual({ c: 0 });
    expect(
      await base.getFirstAsync<{ c: number }>(
        "SELECT COUNT(*) AS c FROM sync_outbox",
      ),
    ).toEqual({ c: 0 });
    await base.closeAsync?.();
  });

  test("domain failure rolls back before creating a sync intent", async () => {
    const base = await readyDb();
    const wrapped: SqlDatabase = {
      execAsync: (source) => base.execAsync(source),
      getFirstAsync: (source, params) => base.getFirstAsync(source, params),
      getAllAsync: (source, params) => base.getAllAsync(source, params),
      closeAsync: () => base.closeAsync?.(),
      runAsync: async (source: string, params?: SqlBindParams) => {
        if (source.includes("INSERT INTO task_events")) {
          throw new Error("forced domain failure");
        }
        return base.runAsync(source, params);
      },
      withTransactionAsync: (task) => base.withTransactionAsync(task),
    };
    const repos = createRepositories(wrapped);

    await expect(
      repos.tasks.create({ id: "task-domain-failure", title: "Rollback" }),
    ).rejects.toThrow("forced domain failure");
    expect(
      await base.getFirstAsync<{ c: number }>(
        "SELECT COUNT(*) AS c FROM tasks WHERE id = ?",
        ["task-domain-failure"],
      ),
    ).toEqual({ c: 0 });
    expect(
      await base.getFirstAsync<{ c: number }>(
        "SELECT COUNT(*) AS c FROM sync_outbox",
      ),
    ).toEqual({ c: 0 });
    await base.closeAsync?.();
  });

  test("local task and reminder deletes retain durable tombstone intents", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    await sync.bindScope({ accountId: "account-a", deviceId: "device-a" });
    const repos = createRepositories(db);
    const task = await repos.tasks.create({
      id: "delete-task",
      title: "Delete",
    });
    await repos.tasks.softDelete(task.id);
    const reminder = await repos.reminders.create({
      id: "delete-reminder",
      taskId: task.id,
    });
    await repos.reminders.delete(reminder.id);

    const rows = await db.getAllAsync<{
      collection: string;
      entity_id: string;
      operation: string;
      payload_json: string;
    }>(
      `SELECT collection, entity_id, operation, payload_json
       FROM sync_outbox
       WHERE entity_id IN (?, ?)
       ORDER BY sequence ASC, mutation_id ASC`,
      [task.id, reminder.id],
    );
    expect(rows.filter((row) => row.entity_id === task.id).at(-1)).toEqual({
      collection: "tasks",
      entity_id: task.id,
      operation: "delete",
      payload_json: "null",
    });
    expect(rows.filter((row) => row.entity_id === reminder.id).at(-1)).toEqual({
      collection: "reminders",
      entity_id: reminder.id,
      operation: "delete",
      payload_json: "null",
    });
    expect(
      await db.getFirstAsync<{ deleted_at: string | null }>(
        "SELECT deleted_at FROM tasks WHERE id = ?",
        [task.id],
      ),
    ).toMatchObject({ deleted_at: expect.any(String) });
    expect(
      await db.getFirstAsync<{ enabled: number; cancelled_at: string | null }>(
        "SELECT enabled, cancelled_at FROM reminders WHERE id = ?",
        [reminder.id],
      ),
    ).toMatchObject({ enabled: 0, cancelled_at: expect.any(String) });
    await db.closeAsync?.();
  });

  test("pre-auth mutations bind once and remain account/device scoped", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    const repos = createRepositories(db);
    const local = await repos.tasks.create({
      id: "pre-auth",
      title: "Offline",
    });
    await sync.bindScope({ accountId: "account-a", deviceId: "device-a" });

    const bound = await db.getFirstAsync<{
      account_id: string;
      device_id: string;
    }>("SELECT account_id, device_id FROM sync_outbox WHERE entity_id = ?", [
      local.id,
    ]);
    expect(bound).toEqual({ account_id: "account-a", device_id: "device-a" });

    await sync.bindScope({ accountId: "account-b", deviceId: "device-b" });
    const old = await db.getFirstAsync<{
      account_id: string;
      device_id: string;
    }>("SELECT account_id, device_id FROM sync_outbox WHERE entity_id = ?", [
      local.id,
    ]);
    expect(old).toEqual({ account_id: "account-a", device_id: "device-a" });

    const next = await repos.tasks.create({ id: "account-b-task", title: "B" });
    const nextScope = await db.getFirstAsync<{
      account_id: string;
      device_id: string;
    }>("SELECT account_id, device_id FROM sync_outbox WHERE entity_id = ?", [
      next.id,
    ]);
    expect(nextScope).toEqual({
      account_id: "account-b",
      device_id: "device-b",
    });
    await db.closeAsync?.();
  });

  test("cursors are isolated by canonical account and device", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    await db.withTransactionAsync(async () => {
      await sync.saveCursorInTransaction(
        { accountId: "account-a", deviceId: "device-a" },
        "cursor-a",
      );
      await sync.saveCursorInTransaction(
        { accountId: "account-b", deviceId: "device-b" },
        "cursor-b",
      );
    });
    expect(
      await sync.getCursor({ accountId: "account-a", deviceId: "device-a" }),
    ).toBe("cursor-a");
    expect(
      await sync.getCursor({ accountId: "account-b", deviceId: "device-b" }),
    ).toBe("cursor-b");
    await db.closeAsync?.();
  });

  test("pending outbox mutations survive a database reopen", async () => {
    const directory = mkdtempSync(join(tmpdir(), "aether-sync-restart-"));
    const filename = join(directory, "aether.db");
    try {
      const firstDb = await readyDb(filename);
      const firstRepos = createRepositories(firstDb);
      await firstRepos.sync.bindScope({
        accountId: "account-restart",
        deviceId: "device-restart",
      });
      await firstRepos.tasks.create({
        id: "restart-task",
        title: "Survive restart",
      });
      await firstDb.closeAsync?.();

      const reopenedDb = await readyDb(filename);
      const reopenedSync = new SyncOutboxRepository(reopenedDb);
      await expect(
        reopenedSync.listPending({
          accountId: "account-restart",
          deviceId: "device-restart",
        }),
      ).resolves.toHaveLength(1);
      await reopenedDb.closeAsync?.();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("account transition quarantines mutations created while identity is unresolved", async () => {
    const db = await readyDb();
    const repos = createRepositories(db);
    const sync = repos.sync;
    const task = await repos.tasks.create({ id: "switch-task", title: "A" });
    await sync.bindScope({ accountId: "account-a", deviceId: "device-a" });
    await sync.clearActiveScope();
    await repos.tasks.update(task.id, { title: "Unresolved" });
    await sync.bindScope({ accountId: "account-b", deviceId: "device-b" });

    const rows = await db.getAllAsync<{
      account_id: string;
      device_id: string;
      state: string;
      last_error_code: string | null;
    }>(
      `SELECT account_id, device_id, state, last_error_code
       FROM sync_outbox WHERE entity_id = ? ORDER BY sequence, mutation_id`,
      [task.id],
    );
    expect(rows.at(-1)).toEqual({
      account_id: "account-b",
      device_id: "device-b",
      state: "blocked",
      last_error_code: "ACCOUNT_SCOPE_CHANGED",
    });
    await db.closeAsync?.();
  });

  test("preferences are persisted and read within the exact account/device scope", async () => {
    const db = await readyDb();
    const sync = new SyncOutboxRepository(db);
    await sync.bindScope({ accountId: "account-a", deviceId: "device-a" });
    await sync.writePreferencesAndEnqueue({
      theme: "dark",
      materialColorsEnabled: false,
      hapticsEnabled: true,
      autoSummarize: true,
      adaptiveNudgesEnabled: false,
    });
    await sync.clearActiveScope();
    await sync.bindScope({ accountId: "account-b", deviceId: "device-b" });
    expect(
      await sync.readPreferencesInTransaction({
        accountId: "account-a",
        deviceId: "device-a",
      }),
    ).toBeTruthy();
    expect(
      await sync.readPreferencesInTransaction({
        accountId: "account-b",
        deviceId: "device-b",
      }),
    ).toBeNull();
    await db.closeAsync?.();
  });
});
