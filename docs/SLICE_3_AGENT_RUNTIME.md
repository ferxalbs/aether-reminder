# Slice 3 — Domain Services + OpenRouter Streaming + Minimum Agent Runtime

## Boundaries

```text
UI / Agent Tools / Notifications / Widgets
        ↓
Domain Services (TaskService, ReminderService, AnalyticsService)
        ↓
Repositories
        ↓
SQLite
```

- Repositories own SQL + Slice 2 transaction/event guarantees
- Services own domain validation (including temporal) + ActionReceipts
- Tools never touch SQL directly

## OpenRouter streaming

- `InferenceProvider.stream()` is the production inference path
- `OpenRouterProvider` only (no local / on-device models)
- Real SSE parsing, incremental deltas, AbortSignal, Retry-After, typed errors
- Capability registry from OpenRouter model metadata → `FULL_AGENT | AGENT | LIMITED_ASSISTANT | CONVERSATION_ONLY`

## Agent runtime

- Single root `AetherAgentRuntime` (not multi-agent)
- Events: `run.*`, `context.ready`, `model.started`, `response.*`, `tool.*`, `state.changed`
- Semantic states for Orb (Slice 4): idle, contextualizing, thinking, executing, waiting_confirmation, responding, error
- Policy engine owns confirmation (not the LLM)
- Tool idempotency via `tool_executions.idempotency_key`
- Persistence: `agent_sessions`, `agent_runs`, `agent_events`, `tool_executions` (migration `0003_agent_runtime`)

## Explicit non-goals (this slice)

No Orb UI, no nav redesign, no voice, no notifications, no widgets, no local LLM.

## Demo data

No seed system. Legacy migration demo filters are contamination guards only — see `docs/SLICE_2_DATA_LAYER.md`.
