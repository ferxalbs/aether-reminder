import type { CaptureSource, TaskCaptureSource } from '@/domain/entities';
import type { SqlDatabase } from '@/db/types';

interface CaptureCommitRow {
  capture_id: string;
  task_id: string;
  position: number;
  ingress: string;
  committed_at: string;
}

interface CaptureSourceRow {
  id: string;
  task_id: string;
  kind: 'url' | 'image';
  url: string | null;
  asset_ref: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  display_name: string | null;
  created_at: string;
}

export interface CaptureCommit {
  captureId: string;
  taskId: string;
  ingress: string;
  committedAt: string;
}

function mapSource(row: CaptureSourceRow): TaskCaptureSource {
  const common = { id: row.id, taskId: row.task_id, createdAt: row.created_at };
  if (row.kind === 'url') return { ...common, kind: 'url', url: row.url! };
  return {
    ...common,
    kind: 'image',
    assetRef: row.asset_ref!,
    mimeType: row.mime_type!,
    ...(row.size_bytes === null ? {} : { sizeBytes: row.size_bytes }),
    ...(row.display_name === null ? {} : { displayName: row.display_name }),
  };
}

export class CaptureCommitsRepository {
  constructor(private readonly db: SqlDatabase) {}

  async get(captureId: string): Promise<CaptureCommit | null> {
    const row = await this.db.getFirstAsync<CaptureCommitRow>(
      'SELECT * FROM capture_commits WHERE capture_id = ?',
      [captureId],
    );
    return row ? {
      captureId: row.capture_id,
      taskId: row.task_id,
      ingress: row.ingress,
      committedAt: row.committed_at,
    } : null;
  }

  async listSources(taskId: string): Promise<TaskCaptureSource[]> {
    const rows = await this.db.getAllAsync<CaptureSourceRow>(
      `SELECT * FROM task_capture_sources
       WHERE task_id = ? ORDER BY position ASC`,
      [taskId],
    );
    return rows.map(mapSource);
  }

  async replaceImageAssetRef(taskId: string, from: string, to: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE task_capture_sources SET asset_ref = ?
       WHERE task_id = ? AND kind = 'image' AND asset_ref = ?`,
      [to, taskId, from],
    );
  }
}

export type { CaptureSource };
