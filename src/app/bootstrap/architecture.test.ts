import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "../../..");

function readProjectFile(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("mobile bootstrap architecture", () => {
  test("keeps release-time sync orchestration out of the root composition", () => {
    const layout = readProjectFile("src/app/_layout.tsx");
    const hosted = readProjectFile(
      "src/app/bootstrap/HostedServicesBootstrap.tsx",
    );

    expect(layout).toContain("<AppBootstrap>");
    expect(layout).not.toMatch(
      /SyncEngine|runOnce|bindScope|clearActiveScope|hydratePreferencesFromSqlite|setInterval|cloud-sync-interval/,
    );
    expect(hosted).not.toMatch(
      /SyncEngine|runOnce|bindScope|clearActiveScope|hydratePreferencesFromSqlite|setInterval/,
    );
  });

  test("keeps local readiness and hosted identity as separate boundaries", () => {
    const local = readProjectFile("src/app/bootstrap/LocalAppBootstrap.tsx");
    const hosted = readProjectFile(
      "src/app/bootstrap/HostedServicesBootstrap.tsx",
    );

    expect(local).toContain("bootstrapAppData");
    expect(local).toContain("syncLocalNotifications");
    expect(local).toContain("drainCaptureInbox");
    expect(local).not.toContain("bootstrapCloudIdentity");

    expect(hosted).toContain("bootstrapCloudIdentity");
    expect(hosted).toContain("bindRevenueCatAccount");
    expect(hosted).toContain("getAetherCloudClient");
  });
});
