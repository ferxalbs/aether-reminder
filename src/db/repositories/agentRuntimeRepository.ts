import { createId } from "@/lib/id";
import { DatabaseError } from "../errors";
import type { SqlDatabase } from "../types";

export type AgentRunStatus =
  "running" | "waiting_confirmation" | "completed" | "cancelled" | "failed";

export type ToolExecutionStatus =
  | "proposed"
  | "awaiting_confirmation"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface AgentSessionRow {
  id: string;
  surface: string | null;
  locale: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRunRow {
  id: string;
  session_id: string;
  status: AgentRunStatus;
  model_id: string | null;
  invocation_source: string | null;
  user_message: string | null;
  semantic_state: string;
  error_code: string | null;
  error_message: string | null;
  usage_json: string | null;
  budget_json: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ToolExecutionRow {
  id: string;
  run_id: string;
  tool_call_id: string;
  idempotency_key: string;
  tool_id: string;
  args_hash: string;
  status: ToolExecutionStatus;
  risk: string | null;
  policy_decision: string | null;
  args_json: string | null;
  result_json: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  return JSON.stringify(value);
}

/** FNV-1a 32-bit hex hash for args identity (idempotency). */
export function hashArgs(args: unknown): string {
  const s = stableJson(args);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function buildIdempotencyKey(parts: {
  runId: string;
  toolCallId: string;
  toolId: string;
  argsHash: string;
}): string {
  return `${parts.runId}:${parts.toolCallId}:${parts.toolId}:${parts.argsHash}`;
}

/**
 * Persistence for agent sessions, runs, events, and tool executions.
 * Never stores API keys or authorization headers.
 */
export class AgentRuntimeRepository {
  constructor(private readonly db: SqlDatabase) {}

  async createSession(input: {
    id?: string;
    surface?: string;
    locale?: string;
    timezone?: string;
  }): Promise<string> {
    const id = input.id ?? createId();
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO agent_sessions (id, surface, locale, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.surface ?? null,
        input.locale ?? null,
        input.timezone ?? null,
        now,
        now,
      ],
    );
    return id;
  }

  async createRun(input: {
    id?: string;
    sessionId: string;
    modelId?: string | null;
    invocationSource?: string | null;
    userMessage?: string | null;
    budget?: unknown;
  }): Promise<string> {
    const id = input.id ?? createId();
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO agent_runs (
        id, session_id, status, model_id, invocation_source, user_message,
        semantic_state, error_code, error_message, usage_json, budget_json,
        started_at, finished_at, created_at, updated_at
      ) VALUES (?, ?, 'running', ?, ?, ?, 'contextualizing', NULL, NULL, NULL, ?, ?, NULL, ?, ?)`,
      [
        id,
        input.sessionId,
        input.modelId ?? null,
        input.invocationSource ?? null,
        input.userMessage ?? null,
        input.budget != null ? stableJson(input.budget) : null,
        now,
        now,
        now,
      ],
    );
    return id;
  }

  async updateRun(
    runId: string,
    patch: {
      status?: AgentRunStatus;
      semanticState?: string;
      modelId?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      usage?: unknown;
      finished?: boolean;
    },
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.getRun(runId);
    if (!existing) throw new DatabaseError("NOT_FOUND", "Agent run not found.");

    await this.db.runAsync(
      `UPDATE agent_runs SET
        status = ?,
        semantic_state = ?,
        model_id = ?,
        error_code = ?,
        error_message = ?,
        usage_json = ?,
        finished_at = ?,
        updated_at = ?
       WHERE id = ?`,
      [
        patch.status ?? existing.status,
        patch.semanticState ?? existing.semantic_state,
        patch.modelId !== undefined ? patch.modelId : existing.model_id,
        patch.errorCode !== undefined ? patch.errorCode : existing.error_code,
        patch.errorMessage !== undefined
          ? patch.errorMessage
          : existing.error_message,
        patch.usage !== undefined
          ? stableJson(patch.usage)
          : existing.usage_json,
        patch.finished ? now : existing.finished_at,
        now,
        runId,
      ],
    );
  }

  async getRun(runId: string): Promise<AgentRunRow | null> {
    return this.db.getFirstAsync<AgentRunRow>(
      `SELECT * FROM agent_runs WHERE id = ?`,
      [runId],
    );
  }

  async appendEvent(input: {
    runId: string;
    seq: number;
    type: string;
    payload?: unknown;
  }): Promise<string> {
    const id = createId();
    const now = new Date().toISOString();
    // Strip any accidental secret-looking keys from payloads before persist
    const safePayload = sanitizeEventPayload(input.payload);
    await this.db.runAsync(
      `INSERT INTO agent_events (id, run_id, seq, type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.runId,
        input.seq,
        input.type,
        safePayload != null ? stableJson(safePayload) : null,
        now,
      ],
    );
    return id;
  }

  async listEvents(
    runId: string,
  ): Promise<{ seq: number; type: string; payload: unknown }[]> {
    const rows = await this.db.getAllAsync<{
      seq: number;
      type: string;
      payload_json: string | null;
    }>(
      `SELECT seq, type, payload_json FROM agent_events WHERE run_id = ? ORDER BY seq ASC`,
      [runId],
    );
    return rows.map((r) => ({
      seq: r.seq,
      type: r.type,
      payload: r.payload_json ? (JSON.parse(r.payload_json) as unknown) : null,
    }));
  }

  /**
   * Begin or reuse a tool execution by idempotency key.
   * Returns existing completed/failed result when the same key was already executed.
   */
  async beginToolExecution(input: {
    runId: string;
    toolCallId: string;
    toolId: string;
    args: unknown;
    risk?: string;
    policyDecision?: string;
  }): Promise<
    | {
        kind: "fresh";
        executionId: string;
        idempotencyKey: string;
        argsHash: string;
      }
    | { kind: "replay"; row: ToolExecutionRow }
  > {
    const argsHash = hashArgs(input.args);
    const idempotencyKey = buildIdempotencyKey({
      runId: input.runId,
      toolCallId: input.toolCallId,
      toolId: input.toolId,
      argsHash,
    });

    const existing = await this.db.getFirstAsync<ToolExecutionRow>(
      `SELECT * FROM tool_executions WHERE idempotency_key = ?`,
      [idempotencyKey],
    );
    if (existing) {
      return { kind: "replay", row: existing };
    }

    const byCall = await this.db.getFirstAsync<ToolExecutionRow>(
      `SELECT * FROM tool_executions WHERE run_id = ? AND tool_call_id = ?`,
      [input.runId, input.toolCallId],
    );
    if (byCall) {
      return { kind: "replay", row: byCall };
    }

    const id = createId();
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO tool_executions (
        id, run_id, tool_call_id, idempotency_key, tool_id, args_hash, status,
        risk, policy_decision, args_json, result_json, error_message,
        started_at, finished_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
      [
        id,
        input.runId,
        input.toolCallId,
        idempotencyKey,
        input.toolId,
        argsHash,
        input.risk ?? null,
        input.policyDecision ?? null,
        stableJson(input.args),
        now,
        now,
      ],
    );
    return { kind: "fresh", executionId: id, idempotencyKey, argsHash };
  }

  async updateToolExecution(
    executionId: string,
    patch: {
      status?: ToolExecutionStatus;
      policyDecision?: string;
      result?: unknown;
      errorMessage?: string | null;
      started?: boolean;
      finished?: boolean;
    },
  ): Promise<void> {
    const now = new Date().toISOString();
    const row = await this.db.getFirstAsync<ToolExecutionRow>(
      `SELECT * FROM tool_executions WHERE id = ?`,
      [executionId],
    );
    if (!row) throw new DatabaseError("NOT_FOUND", "Tool execution not found.");

    await this.db.runAsync(
      `UPDATE tool_executions SET
        status = ?,
        policy_decision = ?,
        result_json = ?,
        error_message = ?,
        started_at = ?,
        finished_at = ?,
        updated_at = ?
       WHERE id = ?`,
      [
        patch.status ?? row.status,
        patch.policyDecision ?? row.policy_decision,
        patch.result !== undefined ? stableJson(patch.result) : row.result_json,
        patch.errorMessage !== undefined
          ? patch.errorMessage
          : row.error_message,
        patch.started ? (row.started_at ?? now) : row.started_at,
        patch.finished ? now : row.finished_at,
        now,
        executionId,
      ],
    );
  }

  /** Atomically grants one caller ownership of a pending execution. */
  async claimToolExecution(
    executionId: string,
    expectedStatus: ToolExecutionStatus,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db.runAsync(
      `UPDATE tool_executions
       SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = ? AND status = ?`,
      [now, now, executionId, expectedStatus],
    );
    return result.changes === 1;
  }

  async getToolExecutionByIdempotencyKey(
    key: string,
  ): Promise<ToolExecutionRow | null> {
    return this.db.getFirstAsync<ToolExecutionRow>(
      `SELECT * FROM tool_executions WHERE idempotency_key = ?`,
      [key],
    );
  }

  async getToolExecution(id: string): Promise<ToolExecutionRow | null> {
    return this.db.getFirstAsync<ToolExecutionRow>(
      `SELECT * FROM tool_executions WHERE id = ?`,
      [id],
    );
  }
}

const SECRET_KEY_RE = /api[_-]?key|authorization|password|secret|token|bearer/i;

function sanitizeEventPayload(payload: unknown): unknown {
  if (payload == null) return payload;
  if (Array.isArray(payload)) return payload.map(sanitizeEventPayload);
  if (typeof payload !== "object") return payload;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = sanitizeEventPayload(v);
  }
  return out;
}
