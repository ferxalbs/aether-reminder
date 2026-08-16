import { reportNonFatalError } from "@/lib/nonFatalError";

export const LEGACY_OPENROUTER_API_KEY_STORAGE_KEY =
  "aether-reminder.openrouter-api-key";
export const LEGACY_OPENAI_API_KEY_STORAGE_KEY =
  "aether-reminder.openai-api-key";

export const KNOWN_LEGACY_BYOK_KEYS: readonly string[] = [
  LEGACY_OPENROUTER_API_KEY_STORAGE_KEY,
  LEGACY_OPENAI_API_KEY_STORAGE_KEY,
] as const;

export interface SecureStoreAdapter {
  isAvailableAsync: () => Promise<boolean>;
  deleteItemAsync: (key: string) => Promise<void>;
}

export async function isSecureStoreAvailable(
  adapter: SecureStoreAdapter,
): Promise<boolean> {
  try {
    return await adapter.isAvailableAsync();
  } catch (error) {
    reportNonFatalError("secure-store-availability", error);
    return false;
  }
}

let migrationRan = false;

/**
 * Bounded, idempotent one-time cleanup of legacy BYOK provider keys from SecureStore.
 * Deletes only known legacy keys, never enumerates or reads them into memory, analytics, or logs.
 */
export async function cleanupLegacyProviderCredentials(
  adapter: SecureStoreAdapter,
): Promise<void> {
  if (migrationRan) return;
  const available = await isSecureStoreAvailable(adapter);
  if (!available) return;

  for (const key of KNOWN_LEGACY_BYOK_KEYS) {
    try {
      await adapter.deleteItemAsync(key);
    } catch (error) {
      reportNonFatalError("legacy-byok-cleanup", error);
    }
  }
  migrationRan = true;
}

export function resetLegacyCredentialMigrationForTests(): void {
  migrationRan = false;
}
