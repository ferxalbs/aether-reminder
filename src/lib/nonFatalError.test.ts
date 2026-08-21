import { describe, expect, test } from "bun:test";
import { reportNonFatalError, sanitizeErrorForLogging } from "./nonFatalError";

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

  test("emits bounded structured diagnostics without secrets", () => {
    const originalWarn = console.warn;
    const output: unknown[] = [];
    console.warn = (...args: unknown[]) => {
      output.push(...args);
    };

    try {
      const diagnostic = Object.assign(
        new Error("Bearer sk-test-secret-value"),
        {
          code: "NETWORK_ERROR",
          status: 503,
          requestId: "request-123",
          retryAfterSeconds: 2,
        },
      );
      reportNonFatalError("x".repeat(200), diagnostic);
    } finally {
      console.warn = originalWarn;
    }

    expect(output).toHaveLength(1);
    const line = String(output[0]);
    expect(line).not.toContain("sk-test-secret-value");
    const details = JSON.parse(line.slice(line.indexOf("] ") + 2));
    expect(details).toMatchObject({
      scope: "x".repeat(96),
      code: "NETWORK_ERROR",
      status: 503,
      requestId: "request-123",
      retryAfterSeconds: 2,
    });
  });
});
