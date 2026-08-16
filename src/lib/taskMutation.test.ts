import { describe, expect, test } from "bun:test";
import { DatabaseError } from "@/db/errors";
import { runTaskMutation } from "./taskMutation";

describe("runTaskMutation", () => {
  test("returns a visible, retryable failure instead of rejecting silently", async () => {
    const messages: string[] = [];
    const result = await runTaskMutation(
      async () => {
        throw new DatabaseError("QUERY_FAILED", "query failed");
      },
      "task-create",
      (message) => messages.push(message),
    );

    expect(result).toEqual({
      ok: false,
      message: "A database error occurred.",
    });
    expect(messages).toEqual(["A database error occurred."]);
  });

  test("returns the created value on success", async () => {
    const result = await runTaskMutation(
      async () => "task-id",
      "task-create",
      () => {},
    );

    expect(result).toEqual({ ok: true, value: "task-id" });
  });
});
