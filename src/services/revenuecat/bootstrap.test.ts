import { describe, expect, test } from "bun:test";
import {
  bindRevenueCatAccount,
  resetRevenueCatForTests,
  type RevenueCatClient,
} from "./bootstrap";

function makeClient(current = "$RCAnonymousID:anonymous"): {
  client: RevenueCatClient;
  calls: { configure: string[]; logIn: string[] };
} {
  const calls = { configure: [] as string[], logIn: [] as string[] };
  const client: RevenueCatClient = {
    configure: ({ apiKey }) => calls.configure.push(apiKey),
    getAppUserID: async () => current,
    logIn: async (appUserId) => void calls.logIn.push(appUserId),
  };
  return { client, calls };
}

describe("RevenueCat account correlation", () => {
  test("binds only the canonical AETHER account after identity resolution", async () => {
    resetRevenueCatForTests();
    const { client, calls } = makeClient();
    await expect(
      bindRevenueCatAccount("account-123", {
        platform: "android",
        apiKey: "goog_test_public_key",
        loadClient: async () => client,
      }),
    ).resolves.toBe(true);
    expect(calls.configure).toEqual(["goog_test_public_key"]);
    expect(calls.logIn).toEqual(["account-123"]);
  });

  test("does not initialize RevenueCat on non-Android platforms", async () => {
    resetRevenueCatForTests();
    let loaded = false;
    await expect(
      bindRevenueCatAccount("account-123", {
        platform: "ios",
        apiKey: "unused",
        loadClient: async () => {
          loaded = true;
          return makeClient().client;
        },
      }),
    ).resolves.toBe(false);
    expect(loaded).toBe(false);
  });

  test("billing failure does not fabricate or alter an AETHER account", async () => {
    resetRevenueCatForTests();
    await expect(
      bindRevenueCatAccount("account-123", {
        platform: "android",
        apiKey: "goog_test_public_key",
        loadClient: async () => {
          throw new Error("RevenueCat unavailable");
        },
      }),
    ).resolves.toBe(false);
  });
});
