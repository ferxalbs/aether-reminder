import type { SqlDatabase } from "@/db/types";
import { wrapExpoDatabase } from "@/db/client";
import { getCaptureSharedDirectory } from "./nativeCapture";
import { CAPTURE_INBOX_DATABASE_NAME, CaptureInboxRepository } from "./inbox";

let database: SqlDatabase | null = null;
let inbox: CaptureInboxRepository | null = null;
let initializing: Promise<CaptureInboxRepository> | null = null;

export async function initializeCaptureInbox(): Promise<CaptureInboxRepository> {
  if (inbox) return inbox;
  if (initializing) return initializing;
  initializing = (async () => {
    const SQLite = await import("expo-sqlite");
    const directory =
      getCaptureSharedDirectory() ?? SQLite.defaultDatabaseDirectory;
    const native = await SQLite.openDatabaseAsync(
      CAPTURE_INBOX_DATABASE_NAME,
      {},
      directory,
    );
    database = wrapExpoDatabase(native);
    inbox = new CaptureInboxRepository(database);
    await inbox.initialize();
    return inbox;
  })();
  try {
    return await initializing;
  } finally {
    initializing = null;
  }
}

export function __setCaptureInboxForTests(
  value: CaptureInboxRepository | null,
): void {
  inbox = value;
  database = null;
  initializing = null;
}
