import { describe, expect, test } from "bun:test";
import { decodeCloudErrorEnvelope } from "./errors";

describe("AETHER Cloud error decoding", () => {
  test("preserves device and Sync error codes for actionable UX", () => {
    const revoked = decodeCloudErrorEnvelope(
      { error: { code: "DEVICE_REVOKED" } },
      403,
    );
    const syncUnavailable = decodeCloudErrorEnvelope(
      { error: { code: "SYNC_PROVIDER_UNAVAILABLE" } },
      503,
    );

    expect(revoked.code).toBe("DEVICE_REVOKED");
    expect(revoked.message).toBe("This device is no longer authorized.");
    expect(syncUnavailable.code).toBe("SYNC_PROVIDER_UNAVAILABLE");
    expect(syncUnavailable.message).toBe(
      "AETHER Sync is temporarily unavailable.",
    );
  });
});
