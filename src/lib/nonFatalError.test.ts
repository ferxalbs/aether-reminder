import { describe, expect, test } from "bun:test";
import { sanitizeErrorForLogging } from "./nonFatalError";

describe("non-fatal error logging", () => {
  test("redacts credentials before they reach logs", () => {
    const message = sanitizeErrorForLogging(
      new Error("Bearer sk-test-secret-value apiKey=pk_test_secret_value"),
    );

    expect(message).not.toContain("sk-test-secret-value");
    expect(message).not.toContain("pk_test_secret_value");
    expect(message).toContain("[redacted]");
  });

  test("redacts ephemeral OpenAI client secrets", () => {
    const message = sanitizeErrorForLogging(
      new Error("clientSecret=ek_live_secret_value leftover"),
    );
    expect(message).not.toContain("ek_live_secret_value");
    expect(message).toContain("[redacted]");
  });
});
