import { describe, expect, test } from "bun:test";
import { applyPragmas, runMigrations } from "../migrator";
import { createBunSqliteDatabase } from "../bunSqliteAdapter";
import type { SqlBindParams, SqlDatabase } from "../types";
import { createRepositories } from ".";

async function readyDb(): Promise<SqlDatabase> {
  const db = createBunSqliteDatabase();
  await applyPragmas(db);
  await runMigrations(db);
  return db;
}

describe("RecurrenceRulesRepository Sync v1 integration", () => {
  test("rule lifecycle writes typed reminder mutations atomically", async () => {
    const db = await readyDb();
    const repos = createRepositories(db);
    const task = await repos.tasks.create({
      id: "recurrence-task",
      title: "Review",
    });
    await repos.sync.bindScope({
      accountId: "account-a",
      deviceId: "device-a",
    });

    const rule = await repos.recurrenceRules.create({
      id: "rule-1",
      taskId: task.id,
      frequency: "weekly",
      weekdays: [1],
      startDate: "2030-01-01",
      mode: "fixed",
    });
    await repos.recurrenceRules.update(rule.id, { interval: 2 });
    await repos.recurrenceRules.stop(rule.id);

    const rows = await db.getAllAsync<{
      collection: string;
      entity_id: string;
      operation: string;
      payload_json: string;
    }>(
      `SELECT collection, entity_id, operation, payload_json
       FROM sync_outbox WHERE entity_id = ? ORDER BY sequence, mutation_id`,
      [`recurrence:${rule.id}`],
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.collection === "reminders")).toBe(true);
    expect(rows.every((row) => row.operation === "upsert")).toBe(true);
    expect(JSON.parse(rows.at(-1)!.payload_json)).toMatchObject({
      id: rule.id,
      interval: 2,
      active: false,
    });
    await db.closeAsync?.();
  });

  test("outbox failure rolls back recurrence creation", async () => {
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
    await createRepositories(base).tasks.create({
      id: "recurrence-rollback-task",
      title: "Review",
    });

    await expect(
      repos.recurrenceRules.create({
        id: "rule-rollback",
        taskId: "recurrence-rollback-task",
        frequency: "daily",
        startDate: "2030-01-01",
      }),
    ).rejects.toThrow("forced outbox failure");
    expect(
      await base.getFirstAsync<{ c: number }>(
        "SELECT COUNT(*) AS c FROM recurrence_rules WHERE id = ?",
        ["rule-rollback"],
      ),
    ).toEqual({ c: 0 });
    await base.closeAsync?.();
  });
});
