import type { SqlDatabase } from "@/db/types";
import { createId } from "@/lib/id";
import { normalizeCaptureEnvelope } from "./normalization";
import type {
  CaptureDiagnostics,
  CaptureEnvelope,
  CaptureEventName,
  CaptureFailureCategory,
  CaptureIngress,
  CaptureState,
} from "./types";

export const CAPTURE_INBOX_DATABASE_NAME = "aether_capture_ingress.sqlite";
export const CAPTURE_INBOX_SCHEMA_VERSION = 1;

interface CaptureRow {
  id: string;
  ingress: CaptureIngress;
  parts_json: string;
  created_at: string;
  idempotency_key: string;
  state: CaptureState;
  review_required: number;
  committed_task_id: string | null;
  attempts: number;
  claim_token: string | null;
  claimed_at: string | null;
  last_error_category: CaptureFailureCategory | null;
  updated_at: string;
}

export interface ClaimedCapture {
  envelope: CaptureEnvelope;
  claimToken: string;
  attempts: number;
}

function mapRow(row: CaptureRow): CaptureEnvelope {
  return normalizeCaptureEnvelope({
    id: row.id,
    ingress: row.ingress,
    parts: JSON.parse(row.parts_json),
    createdAt: row.created_at,
    idempotencyKey: row.idempotency_key,
    state: row.state,
    reviewRequired: row.review_required === 1,
    ...(row.committed_task_id
      ? { committedTaskId: row.committed_task_id }
      : {}),
  });
}

export class CaptureInboxRepository {
  constructor(private readonly db: SqlDatabase) {}

  async initialize(): Promise<void> {
    await this.db.execAsync("PRAGMA journal_mode = WAL;");
    await this.db.execAsync("PRAGMA busy_timeout = 3000;");
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS capture_envelopes (
        id TEXT PRIMARY KEY NOT NULL,
        ingress TEXT NOT NULL,
        parts_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL CHECK (state IN (
          'pending', 'processing', 'committed', 'discarded',
          'failed_retryable', 'failed_terminal'
        )),
        review_required INTEGER NOT NULL DEFAULT 0 CHECK (review_required IN (0, 1)),
        committed_task_id TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        claim_token TEXT,
        claimed_at TEXT,
        last_error_category TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_capture_envelopes_drain
        ON capture_envelopes(state, review_required, created_at);
      CREATE TABLE IF NOT EXISTS capture_events (
        id TEXT PRIMARY KEY NOT NULL,
        capture_id TEXT NOT NULL,
        name TEXT NOT NULL,
        ingress TEXT NOT NULL,
        payload_kind TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
      PRAGMA user_version = ${CAPTURE_INBOX_SCHEMA_VERSION};
    `);
  }

  async accept(rawEnvelope: CaptureEnvelope): Promise<CaptureEnvelope> {
    const envelope = normalizeCaptureEnvelope(rawEnvelope);
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT OR IGNORE INTO capture_envelopes (
        id, ingress, parts_json, created_at, idempotency_key, state,
        review_required, committed_task_id, attempts, claim_token,
        claimed_at, last_error_category, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, 0, NULL, NULL, NULL, ?)`,
      [
        envelope.id,
        envelope.ingress,
        JSON.stringify(envelope.parts),
        envelope.createdAt,
        envelope.idempotencyKey,
        envelope.reviewRequired ? 1 : 0,
        now,
      ],
    );
    const stored = await this.getByIdOrKey(
      envelope.id,
      envelope.idempotencyKey,
    );
    if (!stored) throw new Error("Capture inbox insert verification failed.");
    await this.recordEvent("capture_received", stored);
    return stored;
  }

  async get(id: string): Promise<CaptureEnvelope | null> {
    const row = await this.db.getFirstAsync<CaptureRow>(
      "SELECT * FROM capture_envelopes WHERE id = ?",
      [id],
    );
    return row ? mapRow(row) : null;
  }

  private async getByIdOrKey(
    id: string,
    key: string,
  ): Promise<CaptureEnvelope | null> {
    const row = await this.db.getFirstAsync<CaptureRow>(
      "SELECT * FROM capture_envelopes WHERE id = ? OR idempotency_key = ? LIMIT 1",
      [id, key],
    );
    return row ? mapRow(row) : null;
  }

  async markReviewed(id: string): Promise<void> {
    const envelope = await this.get(id);
    if (!envelope) return;
    await this.db.runAsync(
      `UPDATE capture_envelopes SET review_required = 0, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id],
    );
    await this.recordEvent("capture_reviewed", envelope);
  }

  async claim(
    id: string,
    now = new Date(),
    staleAfterMs = 120_000,
  ): Promise<ClaimedCapture | null> {
    const token = createId();
    const nowIso = now.toISOString();
    const staleIso = new Date(now.getTime() - staleAfterMs).toISOString();
    const result = await this.db.runAsync(
      `UPDATE capture_envelopes
       SET state = 'processing', claim_token = ?, claimed_at = ?, attempts = attempts + 1,
           last_error_category = NULL, updated_at = ?
       WHERE id = ? AND review_required = 0 AND (
         state IN ('pending', 'failed_retryable')
         OR (state = 'processing' AND claimed_at < ?)
       )`,
      [token, nowIso, nowIso, id, staleIso],
    );
    if (result.changes !== 1) return null;
    const row = await this.db.getFirstAsync<CaptureRow>(
      "SELECT * FROM capture_envelopes WHERE id = ? AND claim_token = ?",
      [id, token],
    );
    return row
      ? { envelope: mapRow(row), claimToken: token, attempts: row.attempts }
      : null;
  }

  async listDrainable(
    limit: number,
    now = new Date(),
    staleAfterMs = 120_000,
  ): Promise<string[]> {
    const staleIso = new Date(now.getTime() - staleAfterMs).toISOString();
    const rows = await this.db.getAllAsync<{ id: string }>(
      `SELECT id FROM capture_envelopes
       WHERE review_required = 0 AND (
         state IN ('pending', 'failed_retryable')
         OR (state = 'processing' AND claimed_at < ?)
       )
       ORDER BY created_at ASC, id ASC LIMIT ?`,
      [staleIso, limit],
    );
    return rows.map((row) => row.id);
  }

  async markCommitted(
    id: string,
    token: string,
    taskId: string,
    now = new Date(),
  ): Promise<void> {
    await this.db.runAsync(
      `UPDATE capture_envelopes SET state = 'committed', committed_task_id = ?,
       claim_token = NULL, claimed_at = NULL, updated_at = ?
       WHERE id = ? AND claim_token = ?`,
      [taskId, now.toISOString(), id, token],
    );
  }

  async markFailure(
    id: string,
    token: string,
    category: CaptureFailureCategory,
    retryable: boolean,
    now = new Date(),
  ): Promise<void> {
    await this.db.runAsync(
      `UPDATE capture_envelopes SET state = ?, last_error_category = ?,
       claim_token = NULL, claimed_at = NULL, updated_at = ?
       WHERE id = ? AND claim_token = ?`,
      [
        retryable ? "failed_retryable" : "failed_terminal",
        category,
        now.toISOString(),
        id,
        token,
      ],
    );
  }

  async discard(id: string): Promise<void> {
    const envelope = await this.get(id);
    if (!envelope) return;
    await this.db.runAsync(
      `UPDATE capture_envelopes SET state = 'discarded', claim_token = NULL,
       claimed_at = NULL, updated_at = ? WHERE id = ? AND state != 'committed'`,
      [new Date().toISOString(), id],
    );
    await this.recordEvent("capture_discarded", envelope);
  }

  async recordEvent(
    name: CaptureEventName,
    envelope: CaptureEnvelope,
    metadata: Record<string, string> = {},
  ): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO capture_events (
        id, capture_id, name, ingress, payload_kind, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        createId(),
        envelope.id,
        name,
        envelope.ingress,
        envelope.parts.map((part) => part.kind).join("+"),
        Object.keys(metadata).length ? JSON.stringify(metadata) : null,
        new Date().toISOString(),
      ],
    );
  }

  async diagnostics(orphanTemporaryAssets = 0): Promise<CaptureDiagnostics> {
    const counts = await this.db.getFirstAsync<{
      pending: number;
      failed: number;
    }>(
      `SELECT
         SUM(CASE WHEN state IN ('pending', 'processing', 'failed_retryable') THEN 1 ELSE 0 END) pending,
         SUM(CASE WHEN state IN ('failed_retryable', 'failed_terminal') THEN 1 ELSE 0 END) failed
       FROM capture_envelopes`,
    );
    const last = await this.db.getFirstAsync<{
      ingress: CaptureIngress;
      last_error_category: CaptureFailureCategory | null;
    }>(
      "SELECT ingress, last_error_category FROM capture_envelopes ORDER BY updated_at DESC LIMIT 1",
    );
    const drain = await this.db.getFirstAsync<{ created_at: string }>(
      `SELECT created_at FROM capture_events
       WHERE name = 'capture_committed' ORDER BY created_at DESC LIMIT 1`,
    );
    return {
      pendingCaptures: counts?.pending ?? 0,
      failedCaptures: counts?.failed ?? 0,
      lastCaptureIngress: last?.ingress ?? null,
      lastCaptureFailureCategory: last?.last_error_category ?? null,
      lastSuccessfulDrainAt: drain?.created_at ?? null,
      orphanTemporaryAssets,
    };
  }
}
