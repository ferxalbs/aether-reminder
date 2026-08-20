import { describe, expect, test } from "bun:test";
import type { TaskListItem } from "@/domain/entities";
import { preserveTaskListItemIdentity } from "./taskListIdentity";

function task(id: string, completed = false): TaskListItem {
  return {
    id,
    title: `Task ${id}`,
    notes: null,
    priority: "medium",
    dueDate: "2026-08-19",
    dueTime: null,
    completed,
    aiSuggested: false,
  };
}

describe("preserveTaskListItemIdentity", () => {
  test("reuses unchanged rows after a SQLite projection refresh", () => {
    const previous = [task("a"), task("b")];
    const next = [task("a"), task("b")];

    const result = preserveTaskListItemIdentity(previous, next);

    expect(result[0]).toBe(previous[0]);
    expect(result[1]).toBe(previous[1]);
  });

  test("replaces only the row whose rendered fields changed", () => {
    const previous = [task("a"), task("b")];
    const changed = task("b", true);

    const result = preserveTaskListItemIdentity(previous, [task("a"), changed]);

    expect(result[0]).toBe(previous[0]);
    expect(result[1]).toBe(changed);
  });
});
