import { describe, expect, test } from "bun:test";
import { createBunSqliteDatabase } from "@/db/bunSqliteAdapter";
import { applyPragmas, runMigrations } from "@/db/migrator";
import { createAgentRuntime } from "./runtime";
import type { AgentEvent } from "./types";

const apiKey = process.env.AETHER_OPENROUTER_SMOKE_KEY?.trim();
const modelId = process.env.AETHER_OPENROUTER_SMOKE_MODEL?.trim();
const smoke = apiKey && modelId ? describe : describe.skip;

smoke("manual OpenRouter agent smoke path", () => {
  test("streams text, executes a task tool, and receives model continuation", async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);

    const events: AgentEvent[] = [];
    const runtime = createAgentRuntime({ db });
    for await (const event of runtime.run({
      message:
        "Create a task titled Smoke test task for tomorrow, then tell me what you did.",
      context: {
        surface: "home",
        selectedDate: new Date().toISOString().slice(0, 10),
        visibleTaskIds: [],
        locale: "en-US",
        timezone: "UTC",
        invocationSource: "assistant",
      },
      modelId: modelId!,
      apiKey: apiKey!,
    })) {
      events.push(event);
    }

    const toolIndex = events.findIndex(
      (event) =>
        event.type === "tool.completed" && event.toolId === "tasks.create",
    );
    const responseIndex = events.findIndex(
      (event) => event.type === "response.completed",
    );
    expect(events.some((event) => event.type === "response.delta")).toBe(true);
    expect(toolIndex).toBeGreaterThanOrEqual(0);
    expect(responseIndex).toBeGreaterThan(toolIndex);
    await db.closeAsync?.();
  }, 120_000);
});
