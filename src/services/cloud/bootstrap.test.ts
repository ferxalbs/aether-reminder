import { describe, expect, test } from "bun:test";
import { bootstrapCloudIdentity } from "./bootstrap";
import {
  DeviceIdentityStore,
  type SecureStringStore,
} from "@/services/identity/device";
import type { AetherCloudClient } from "./client";

function makeStore(): SecureStringStore {
  const values = new Map<string, string>();
  return {
    isAvailableAsync: async () => true,
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => void values.set(key, value),
    deleteItemAsync: async (key) => void values.delete(key),
  };
}

describe("Cloud identity and device bootstrap", () => {
  test("resolves the account before registering and persists the canonical device", async () => {
    let registration: Record<string, unknown> | null = null;
    const client = {
      async getMe() {
        return { account: { id: "account-1" } };
      },
      async registerDevice(body: Record<string, unknown>) {
        registration = body;
        return {
          device: {
            id: "cloud-device-1",
            installationId: body.installationId,
            platform: "android",
            appVersion: "1.0.0",
            buildVersion: "42",
            syncProtocolVersion: 1,
            createdAt: "2026-08-19T00:00:00.000Z",
            lastSeenAt: "2026-08-19T00:00:00.000Z",
            revokedAt: null,
          },
        };
      },
    } as unknown as AetherCloudClient;
    const deviceStore = new DeviceIdentityStore(makeStore());

    const result = await bootstrapCloudIdentity(client, deviceStore, {
      platform: "android",
      appVersion: "1.0.0",
      buildVersion: "42",
    });

    expect(result.accountId).toBe("account-1");
    expect(result.device.id).toBe("cloud-device-1");
    expect(registration).toMatchObject({
      platform: "android",
      appVersion: "1.0.0",
      buildVersion: "42",
      syncProtocolVersion: 1,
    });
    await expect(deviceStore.getCanonicalDeviceId()).resolves.toBe(
      "cloud-device-1",
    );
  });
});
