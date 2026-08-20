import { describe, expect, test } from "bun:test";
import { DeviceIdentityStore, type SecureStringStore } from "./device";

function makeStore(): SecureStringStore {
  const values = new Map<string, string>();
  return {
    isAvailableAsync: async () => true,
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => void values.set(key, value),
    deleteItemAsync: async (key) => void values.delete(key),
  };
}

describe("AETHER installation and canonical device storage", () => {
  test("keeps one installation ID and persists the Cloud device ID", async () => {
    const store = new DeviceIdentityStore(makeStore());
    const first = await store.getOrCreateInstallationId();
    const second = await store.getOrCreateInstallationId();
    expect(first).toBe(second);

    await store.setActiveAccount("account-a");
    await store.setCanonicalDeviceId("device-a");
    await expect(store.getCanonicalDeviceId()).resolves.toBe("device-a");
  });

  test("does not carry a canonical device across account changes", async () => {
    const store = new DeviceIdentityStore(makeStore());
    await store.setActiveAccount("account-a");
    await store.setCanonicalDeviceId("device-a");
    await store.setActiveAccount("account-b");
    await expect(store.getCanonicalDeviceId()).resolves.toBeNull();
  });

  test("rejects malformed canonical device IDs", async () => {
    const store = new DeviceIdentityStore(makeStore());
    await expect(store.setCanonicalDeviceId("bad id")).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
  });
});
