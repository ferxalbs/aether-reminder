import { describe, expect, test } from "bun:test";
import {
  LEGACY_OPENAI_API_KEY_STORAGE_KEY,
  LEGACY_OPENROUTER_API_KEY_STORAGE_KEY,
  persistedSettingsSnapshot,
} from "./settingsPersistence";
import {
  KNOWN_LEGACY_BYOK_KEYS,
  cleanupLegacyProviderCredentials,
  resetLegacyCredentialMigrationForTests,
  type SecureStoreAdapter,
} from "./secureCredentials";

describe("settings preferences and legacy cleanup", () => {
  test("legacy storage keys are distinct and identified for cleanup", () => {
    expect(LEGACY_OPENROUTER_API_KEY_STORAGE_KEY).not.toBe(
      LEGACY_OPENAI_API_KEY_STORAGE_KEY,
    );
    expect(KNOWN_LEGACY_BYOK_KEYS).toContain(
      LEGACY_OPENROUTER_API_KEY_STORAGE_KEY,
    );
    expect(KNOWN_LEGACY_BYOK_KEYS).toContain(LEGACY_OPENAI_API_KEY_STORAGE_KEY);
  });

  test("persisted snapshot contains preferences only without provider secrets", () => {
    const snapshot = persistedSettingsSnapshot({
      theme: "dark",
      hapticsEnabled: true,
      autoSummarize: true,
      materialColorsEnabled: true,
      adaptiveNudgesEnabled: false,
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("ApiKey");
    expect(serialized).not.toContain("secret");
    expect(snapshot.theme).toBe("dark");
    expect(snapshot.materialColorsEnabled).toBe(true);
  });

  test("material colors remain opt-in and persist when enabled", () => {
    const defaults = persistedSettingsSnapshot({
      theme: "system",
      hapticsEnabled: true,
      autoSummarize: true,
    });
    expect(defaults.materialColorsEnabled).toBe(false);

    const enabled = persistedSettingsSnapshot({
      ...defaults,
      materialColorsEnabled: true,
    });
    expect(enabled.materialColorsEnabled).toBe(true);
  });

  test("cleanupLegacyProviderCredentials deletes known legacy keys idempotently and never reads values", async () => {
    resetLegacyCredentialMigrationForTests();
    const deletedKeys: string[] = [];
    const adapter: SecureStoreAdapter = {
      isAvailableAsync: async () => true,
      deleteItemAsync: async (key) => {
        deletedKeys.push(key);
      },
    };

    await cleanupLegacyProviderCredentials(adapter);
    expect(deletedKeys).toEqual([
      LEGACY_OPENROUTER_API_KEY_STORAGE_KEY,
      LEGACY_OPENAI_API_KEY_STORAGE_KEY,
    ]);

    // Second call is a no-op (idempotent migration)
    await cleanupLegacyProviderCredentials(adapter);
    expect(deletedKeys).toHaveLength(2);
  });

  test("cleanup is safe when SecureStore is unavailable", async () => {
    resetLegacyCredentialMigrationForTests();
    const deletedKeys: string[] = [];
    const adapter: SecureStoreAdapter = {
      isAvailableAsync: async () => false,
      deleteItemAsync: async (key) => {
        deletedKeys.push(key);
      },
    };

    await cleanupLegacyProviderCredentials(adapter);
    expect(deletedKeys).toHaveLength(0);
  });
});
