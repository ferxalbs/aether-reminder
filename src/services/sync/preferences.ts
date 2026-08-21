import { getDatabase, isDatabaseReady } from "@/db/client";
import { SyncOutboxRepository } from "@/db/repositories/syncOutboxRepository";
import type { UserSettings } from "@/types";
import {
  fromSyncPreferencesPayload,
  SyncPayloadError,
  toSyncPreferencesPayload,
} from "./mappers";
import type { PersistedSettings } from "@/stores/settingsPersistence";

function repository(): SyncOutboxRepository {
  return new SyncOutboxRepository(getDatabase());
}

export async function persistLocalPreferences(
  settings: UserSettings | PersistedSettings,
): Promise<void> {
  await repository().writePreferencesAndEnqueue(
    toSyncPreferencesPayload(settings),
  );
}

export async function hydratePreferencesFromSqlite(
  fallback: UserSettings | PersistedSettings,
): Promise<PersistedSettings> {
  if (!isDatabaseReady()) return toSyncPreferencesPayload(fallback);
  const sync = repository();
  const stored = await sync.readPreferencesInTransaction();
  if (!stored) {
    const initial = toSyncPreferencesPayload(fallback);
    await sync.writePreferencesAndEnqueue(initial);
    return initial;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored) as unknown;
  } catch {
    throw new SyncPayloadError("Stored Sync preferences are invalid JSON.");
  }
  return fromSyncPreferencesPayload(parsed);
}
