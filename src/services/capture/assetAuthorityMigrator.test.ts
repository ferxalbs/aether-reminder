import { describe, expect, test } from 'bun:test';
import type { LegacySharedCaptureAsset } from '@/db/repositories/captureCommitsRepository';
import { CaptureAssetAuthorityMigrator } from './assetAuthorityMigrator';

function candidate(): LegacySharedCaptureAsset {
  return {
    captureId: 'capture-asset',
    taskId: 'task-asset',
    assetRef: 'file:///app-group/capture-assets/committed/capture-asset/source.png',
  };
}

describe('CaptureAssetAuthorityMigrator', () => {
  test('updates the source reference only after host-private adoption succeeds', async () => {
    const replacements: [string, string, string][] = [];
    const repository = {
      async listLegacySharedImageAssets() { return [candidate()]; },
      async replaceImageAssetRef(taskId: string, from: string, to: string) {
        replacements.push([taskId, from, to]);
      },
    };
    const migrator = new CaptureAssetAuthorityMigrator(
      repository,
      async (_assetRef, captureId) => `file:///host-private/task-sources/${captureId}/source.png`,
    );

    expect(await migrator.migrateBatch()).toEqual({ examined: 1, migrated: 1, failed: 0 });
    expect(replacements).toEqual([[
      'task-asset',
      candidate().assetRef,
      'file:///host-private/task-sources/capture-asset/source.png',
    ]]);
  });

  test('preserves the old reference when adoption fails so the only copy is not lost', async () => {
    let replacements = 0;
    const repository = {
      async listLegacySharedImageAssets() { return [candidate()]; },
      async replaceImageAssetRef() { replacements += 1; },
    };
    const migrator = new CaptureAssetAuthorityMigrator(repository, async () => {
      throw new Error('copy interrupted');
    });

    expect(await migrator.migrateBatch()).toEqual({ examined: 1, migrated: 0, failed: 1 });
    expect(replacements).toBe(0);
  });

  test('converges when the private copy exists after a crash before SQLite acknowledgement', async () => {
    let databaseAcknowledged = false;
    let replaceAttempts = 0;
    const repository = {
      async listLegacySharedImageAssets() { return databaseAcknowledged ? [] : [candidate()]; },
      async replaceImageAssetRef() {
        replaceAttempts += 1;
        if (replaceAttempts === 1) throw new Error('crash before reference update');
        databaseAcknowledged = true;
      },
    };
    const privateRef = 'file:///host-private/task-sources/capture-asset/source.png';
    const migrator = new CaptureAssetAuthorityMigrator(repository, async () => privateRef);

    expect(await migrator.migrateBatch()).toEqual({ examined: 1, migrated: 0, failed: 1 });
    expect(await migrator.migrateBatch()).toEqual({ examined: 1, migrated: 1, failed: 0 });
    expect(await migrator.migrateBatch()).toEqual({ examined: 0, migrated: 0, failed: 0 });
  });
});
