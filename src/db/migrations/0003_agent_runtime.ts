import type { Migration } from "./types";

/**
 * Minimal durable agent runtime schema (Slice 3).
 * Immutable once shipped — never store API keys, auth headers, or raw audio.
 */
export const migration0003AgentRuntime: Migration = {
  version: 3,
  name: "0003_agent_runtime",
  async up(db) {
    await db.execAsync(`
      CREATE TABLE agent_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        surface TEXT,
        locale TEXT,
        timezone TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE agent_runs (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        status TEXT NOT NULL
          CHECK (status IN (
            'running', 'waiting_confirmation', 'completed', 'cancelled', 'failed'
          )),
        model_id TEXT,
        invocation_source TEXT,
        user_message TEXT,
        semantic_state TEXT NOT NULL DEFAULT 'idle',
        error_code TEXT,
        error_message TEXT,
        usage_json TEXT,
        budget_json TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE agent_events (
        id TEXT PRIMARY KEY NOT NULL,
        run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (run_id, seq)
      );

      CREATE TABLE tool_executions (
        id TEXT PRIMARY KEY NOT NULL,
        run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
        tool_call_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        tool_id TEXT NOT NULL,
        args_hash TEXT NOT NULL,
        status TEXT NOT NULL
          CHECK (status IN (
            'proposed', 'awaiting_confirmation', 'running', 'completed', 'failed', 'skipped'
          )),
        risk TEXT,
        policy_decision TEXT,
        args_json TEXT,
        result_json TEXT,
        error_message TEXT,
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (run_id, tool_call_id),
        UNIQUE (idempotency_key)
      );

      CREATE INDEX idx_agent_runs_session ON agent_runs(session_id, created_at);
      CREATE INDEX idx_agent_events_run_seq ON agent_events(run_id, seq);
      CREATE INDEX idx_tool_executions_run ON tool_executions(run_id, created_at);
      CREATE INDEX idx_tool_executions_idempotency ON tool_executions(idempotency_key);
    `);
  },
};
