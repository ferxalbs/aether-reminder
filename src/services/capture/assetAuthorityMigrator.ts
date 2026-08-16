import type {
  CaptureCommitsRepository,
  LegacySharedCaptureAsset,
} from "@/db/repositories/captureCommitsRepository";

export interface CaptureAssetAuthorityMigrationResult {
  examined: number;
  migrated: number;
  failed: number;
}

type CaptureAssetAuthorityRepository = Pick<
  CaptureCommitsRepository,
  "listLegacySharedImageAssets" | "replaceImageAssetRef"
>;

export class CaptureAssetAuthorityMigrator {
  constructor(
    private readonly repository: CaptureAssetAuthorityRepository,
    private readonly adoptIntoHostStorage: (
      assetRef: string,
      captureId: string,
    ) => Promise<string>,
  ) {}

  async migrateBatch(
    limit = 16,
  ): Promise<CaptureAssetAuthorityMigrationResult> {
    const candidates = await this.repository.listLegacySharedImageAssets(limit);
    const result: CaptureAssetAuthorityMigrationResult = {
      examined: candidates.length,
      migrated: 0,
      failed: 0,
    };
    for (const candidate of candidates) {
      try {
        await this.migrate(candidate);
        result.migrated += 1;
      } catch {
        // Leave the database reference unchanged so the next bounded pass can retry.
        result.failed += 1;
      }
    }
    return result;
  }

  private async migrate(candidate: LegacySharedCaptureAsset): Promise<void> {
    const adoptedRef = await this.adoptIntoHostStorage(
      candidate.assetRef,
      candidate.captureId,
    );
    if (!adoptedRef || adoptedRef === candidate.assetRef) {
      throw new Error("Capture asset did not move into host-private storage.");
    }
    await this.repository.replaceImageAssetRef(
      candidate.taskId,
      candidate.assetRef,
      adoptedRef,
    );
  }
}
