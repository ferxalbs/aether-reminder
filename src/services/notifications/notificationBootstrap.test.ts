import { describe, expect, test } from "bun:test";
import { NotificationError } from "./errors";
import { syncLocalNotifications } from "./notificationBootstrap";

describe("notification bootstrap", () => {
  test("converts configuration failures into a retryable typed error", async () => {
    let attempts = 0;
    const client = {
      configure: async () => {
        attempts += 1;
        throw new Error("native module unavailable");
      },
      reconcile: async () => ({ repaired: 0, failed: 0, failures: [] }),
    };

    await expect(syncLocalNotifications(client)).rejects.toMatchObject({
      name: "NotificationError",
      code: "CONFIGURATION_FAILED",
      retryable: true,
      message: "Local notifications could not be initialized. Try again.",
    });
    expect(attempts).toBe(1);
  });

  test("surfaces partial reconciliation as a retryable error instead of silently succeeding", async () => {
    const client = {
      configure: async () => undefined,
      reconcile: async () => ({
        repaired: 2,
        failed: 1,
        failures: [
          {
            kind: "reminder_projection" as const,
            reminderId: "reminder-1",
            error: new NotificationError(
              "PERMISSION_DENIED",
              "Notifications are disabled.",
            ),
          },
        ],
      }),
    };

    await expect(syncLocalNotifications(client)).rejects.toMatchObject({
      code: "RECONCILIATION_FAILED",
      retryable: true,
      message:
        "One reminder could not be synchronized with device notifications. Try again.",
    });
  });

  test("returns a clean reconciliation result when every reminder is synchronized", async () => {
    const result = await syncLocalNotifications({
      configure: async () => undefined,
      reconcile: async () => ({ repaired: 3, failed: 0, failures: [] }),
    });

    expect(result).toEqual({ repaired: 3, failed: 0, failures: [] });
  });
});
