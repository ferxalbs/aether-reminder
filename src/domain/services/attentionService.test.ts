import { describe, expect, test } from "bun:test";
import { createBunSqliteDatabase } from "@/db/bunSqliteAdapter";
import { applyPragmas, runMigrations } from "@/db/migrator";
import { createDomainServices } from "./index";

async function readyDb() {
  const db = createBunSqliteDatabase();
  await applyPragmas(db);
  await runMigrations(db);
  return db;
}

describe("AttentionService", () => {
  test("persists only explicit focus and clears it after the focused task completes", async () => {
    const db = await readyDb();
    const services = createDomainServices(db);
    const now = new Date("2030-01-02T10:00:00.000Z");
    const created = await services.tasks.createTask({
      title: "Write proposal",
      priority: "low",
      dueDate: "2030-01-04",
      dueTime: "09:00",
    });

    await services.attention.focusNow(created.value.id, now);
    const plan = await services.attention.plan({ now });
    expect(plan.now?.taskId).toBe(created.value.id);
    expect(plan.now?.reasonCodes).toContain("manual_focus");
    expect((await services.tasks.getTask(created.value.id))?.dueDate).toBe(
      "2030-01-04",
    );
    expect((await services.tasks.getTask(created.value.id))?.dueTime).toBe(
      "09:00",
    );

    await services.tasks.completeTask(created.value.id);
    const afterCompletion = await services.attention.plan({ now });
    expect(afterCompletion.now).toBeNull();
    expect(await services.attention.getFocus()).toBeNull();
    await db.closeAsync?.();
  });
});
