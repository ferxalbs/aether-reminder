# AETHER Reminder — Architecture Assessment (Phase 0)

**Date:** 2026-08-07  
**Repo:** `ferxalbs/aether-reminder`  
**Scope:** Audit only → migration plan. No deploy. No local LLM inference.  
**Branding note:** Product name **AETHER** and **AETHER Agent Runtime** are product/architecture labels. They do **not** imply membership in any AETHER Model Family. Inference is remote OpenRouter only in this phase.

> Historical document: this assessment records the pre-correction architecture
> that was audited before the current implementation pass. For the implemented
> five-surface/provider-isolated architecture, see
> [ARCHITECTURE.md](ARCHITECTURE.md). References below to shims, mock audio,
> OpenRouter STT, or the old route structure describe findings that were
> removed or superseded; they are not current runtime behavior.

---

## 1. Current architecture assessment

### Stack (keep)

| Layer | Current |
| --- | --- |
| Runtime | Expo SDK **57**, React Native **0.86**, React **19.2**, TypeScript strict |
| Routing | Expo Router (`src/app/*`), Stack, typed routes experiment |
| Package manager | Bun (`bun.lock`) |
| UI state | Zustand 5 + AsyncStorage persist |
| Secrets | Expo SecureStore for OpenRouter key (correct partialization) |
| Styling | RN `StyleSheet` + monochrome tokens (`src/theme/tokens.ts`) — no Tailwind/NativeWind |
| Motion | Reanimated 4, Gesture Handler, expo-haptics |
| Glass | `expo-blur` via `GlassSurface` (not platform Liquid Glass yet) |
| Native shells | `android/` present (dev client package `com.ferxalbs.aetherreminder`); no custom iOS project checked in (managed + EAS) |

### Routes

| Route | File | Role |
| --- | --- | --- |
| `/` | `src/app/index.tsx` | Home — today’s tasks, progress, add modal |
| `/ai` | `src/app/ai.tsx` | “AI Overview” — one-shot task summary |
| `/transcribe` | `src/app/transcribe.tsx` | Standalone voice capture tab |
| `/settings` | `src/app/settings.tsx` | BYOK OpenRouter key, model catalog, theme, haptics |

Navigation chrome: per-screen `FloatingToolbar` (not a real tab navigator). Root is a bare `Stack` in `_layout.tsx`.

### Stores

| Store | Persistence | Role |
| --- | --- | --- |
| `tasks.store` | AsyncStorage `taskflow-tasks-storage` | **Source of truth** for tasks (demo seed data) |
| `settings.store` | AsyncStorage prefs + SecureStore API key | Preferences + in-memory key |

Zustand is used for domain data — wrong long-term. Target: SQLite for domain; Zustand for UI/session only.

### AI services

| Module | Status |
| --- | --- |
| `providers.ts` | Typed `AIProviderError`, codes, `requireUserApiKey` — **preserve pattern** |
| `openrouter.ts` | Non-streaming `complete()`, models list + cache, key test — **extend heavily** |
| `models.ts` | Text-chat filter only; no tools/structured_outputs capabilities — **extend** |
| Product AI | `generateTaskSummary` dumps all tasks into prompt, free-form JSON, markdown strip + `JSON.parse` |
| Fallback | `generateFallbackSummary` pretends analysis succeeded when provider fails |

### OpenRouter integration

- Base: `https://openrouter.ai/api/v1`
- Endpoints used: `/chat/completions`, `/models`, `/key`
- Headers: `HTTP-Referer: https://taskflow.ai`, `X-Title: TaskFlow AI`
- No streaming, AbortSignal, tool calls, structured outputs, usage/cost
- Branding still “TaskFlow AI” in several places

### Transcription

- `OpenAITranscriptionProvider` posts to **`https://api.openai.com/v1/audio/transcriptions`** with the **OpenRouter** key
- On any failure / mock URI / missing key path: **random demo transcript**
- Local heuristic `parseSpeechToTasks` for title/priority extraction

### Audio lifecycle

- Screen uses `expo-audio` APIs
- **Metro always aliases `expo-audio` → `src/lib/expo-audio-shim.ts`** (permissions always denied, recorder no-op)
- Denied permission or prepare failure → still sets `isRecording = true`
- Stop uses `uri = 'mock://voice-recording'` when not actually recording

### SecureStore

- Key: `aether-reminder.openrouter-api-key`, `WHEN_UNLOCKED`
- Legacy plaintext settings key purged on load
- API key correctly excluded from Zustand `partialize`
- **Preserve this path**

### Task model (current)

```ts
{ id, title, notes?, completed, createdAt, dueDate?, priority, reminderDate?, aiSuggested? }
```

Missing: project, tags, timezone, dueTime, source/origin, events, real reminders, deterministic IDs.

### Date handling

Widespread `new Date().toISOString().split('T')[0]` for “today” / default due date (UTC calendar, not local).

### Design system

- Strong monochrome tokens, 8pt spacing, restrained radius
- Reusable: `Typography`, `Button`, `Card`, `IconButton`, `AnimatedPressable`, `TaskCard`, `GlassSurface`, `WaveformView`
- Theme bug: `theme === 'system' && true` → system always dark
- Default theme preference: `'dark'`
- Branding mix: TaskFlow AI / AETHER / aether-reminder

### Mock / fallback behavior (must die)

See §2.

### Metro hacks

`metro.config.js` unconditionally redirects `expo-audio` to shim. Comment says remove for dev builds; currently always on → real recording never runs even in native builds if Metro alias applies.

### Native / EAS

- `app.json`: name TaskFlow AI, scheme `taskflowai`, plugins router/splash/secure-store/audio/asset, EAS project under `enosislabs`
- Android: RECORD_AUDIO + media FGS; **no** notification / exact-alarm permissions yet
- `eas.json`: development (dev client), preview, production
- No `expo-sqlite`, `expo-notifications`, widgets, App Intents

### Manifesto

`MANIFESTO.md` already sketches AETHER runtime architecture aligned with this plan. Treat as design intent; **do not implement local model packs** from manifesto in this phase. Some manifesto sections describe future local providers — interface-only later; **no stubs that simulate local inference**.

### Size

~3.3k LOC under `src/`. Feasible incremental migration; no need for rewrite-from-scratch.

---

## 2. Critical correctness issues

| ID | Issue | Location | Severity |
| --- | --- | --- | --- |
| C1 | Denied mic still enters `recording` | `transcribe.tsx` | P0 |
| C2 | Audio prepare failure silently “records” | `transcribe.tsx` | P0 |
| C3 | `mock://voice-recording` enters production path | `transcribe.tsx` | P0 |
| C4 | Random/demo transcripts on failure | `transcription/index.ts` | P0 |
| C5 | OpenRouter key sent to OpenAI STT | `transcription/index.ts` | P0 |
| C6 | AI failure still shows synthetic “analysis” | `ai.tsx` + `generateFallbackSummary` | P0 |
| C7 | UTC date slicing for local calendar | tasks store, AI, modal, transcribe | P0 |
| C8 | System theme always dark | all screens/components | P1 |
| C9 | Free-form JSON scrape instead of structured outputs | `openrouter.ts` | P1 |
| C10 | Metro always shims expo-audio | `metro.config.js` | P1 |
| C11 | Non-deterministic task IDs | `tasks.store` | P1 |
| C12 | Demo tasks seeded as real data | `tasks.store` | P1 |
| C13 | No real notifications / reminder engine | — | P1 product |
| C14 | AI tab dumps entire task list into prompt | `generateTaskSummary` | P1 privacy/perf |
| C15 | No tests | — | P1 |

**Rule going forward:** no fake-success. Failures are typed, explicit, user-visible.

---

## 3. Files / subsystems to preserve

| Item | Why |
| --- | --- |
| Expo 57 + Router + Bun + TS strict | Product constraints |
| `settings.store` SecureStore BYOK pattern | Correct secret handling |
| `AIProviderError` + user-facing `getAIErrorMessage` | Typed error surface (extend codes) |
| OpenRouter models fetch + TTL cache | Good baseline |
| `normalizeOpenRouterModels` / `maskApiKey` | Extend, don’t trash |
| Theme tokens (`Colors`, `Spacing`, `Radius`, `TypographyTokens`) | Calm monochrome system |
| UI primitives: Typography, Button, Card, IconButton, AnimatedPressable, TaskCard skeleton | Native StyleSheet quality |
| Settings screen structure (key UX, model search, connection test) | Solid product surface |
| Haptics usage patterns | Keep |
| `app.json` EAS project id / package name | Don’t break native identity |
| `MANIFESTO.md` as product architecture intent | Align runtime to it (minus local LLM) |
| Dev client / android package | Keep |

---

## 4. Files / subsystems to replace or heavily redesign

| Item | Action |
| --- | --- |
| `tasks.store` as domain SoT | Replace with SQLite repos + thin UI store |
| `services/transcription/*` | Replace with STT provider abstraction (OpenRouter STT only this phase) |
| `services/ai/openrouter.ts` complete-only | Replace with streaming InferenceProvider |
| `generateTaskSummary` / free-form JSON | Delete; agent tools + structured responses |
| `generateFallbackSummary` success path | Delete as “AI success”; optional deterministic local analytics UI only |
| `/ai` tab as primary AI surface | Demote; global AssistantHost + orb |
| `/transcribe` as primary tab | Fold into assistant voice mode |
| `FloatingToolbar` 4 equal tabs | Redesign: Home · Calendar/Inbox · **Orb** · Settings |
| `expo-audio-shim` always-on | Conditional or remove; honest failure if native unavailable |
| Date helpers using UTC split | Central temporal service |
| Product branding TaskFlow | Incremental rename to AETHER product identity (careful with scheme) |

---

## 5. Proposed folder architecture

```text
src/
  app/                          # Expo Router screens only
    _layout.tsx                 # RootLayout + AssistantHost mount
    index.tsx                   # Home
    calendar.tsx                # or inbox — later
    settings.tsx
    task/[id].tsx               # later

  assistant/                    # Universal assistant surface
    AssistantHost.tsx
    AssistantOrb.tsx
    AssistantSheet.tsx
    useAssistantController.ts   # derives UI from AgentEvent stream

  domain/
    entities/                   # Task, Reminder, Project, Tag, …
    services/                   # TaskService, ReminderService, AnalyticsService
    policies/                   # pure rules (completion, ownership)
    events/                     # TaskEvent types

  db/
    client.ts                   # expo-sqlite open + migrations runner
    migrations/                 # 001_init.ts, …
    repositories/               # TaskRepository, …
    outbox/                     # OutboxProcessor

  temporal/
    types.ts
    resolve.ts                  # relative → local date/time
    localCalendar.ts            # never UTC slice for “today”

  agent/
    runtime/
      AetherAgentRuntime.ts
      types.ts                  # AgentInput, AgentEvent, budgets
      session.ts
      context.ts                # ContextSnapshot + provenance
    tools/
      registry.ts
      definitions/              # tasks.*, reminders.*, analytics.*, app.navigate
      policy.ts
      executor.ts               # schema → policy → domain → idempotency
    inference/
      types.ts                  # InferenceProvider, ModelEvent
      openrouter/
        OpenRouterProvider.ts
        sse.ts
        errors.ts
        capabilities.ts
    memory/                     # session only + structured prefs later
    observability/
      metrics.ts

  voice/
    types.ts                    # VoiceState machine
    VoiceSession.ts
    providers/
      OpenRouterSTTProvider.ts  # only remote STT this phase

  notifications/
    ReminderEngine.ts
    bindings.ts
    actions.ts                  # Done / Snooze / Open

  widgets/                      # data contracts + platform adapters later
    WidgetDataProvider.ts

  stores/                       # UI / session only
    settings.store.ts
    assistant.ui.store.ts
    ui.store.ts

  components/ui/                # preserved design system
  theme/
  types/                        # shared cross-cutting types (thin)
  lib/                          # ids, result, logging (no secrets)
```

Shared domain logic lives under `domain/`, `db/`, `agent/`, `temporal/`. Platform-specific native modules (widgets, App Intents, notification access) live under `modules/` or Expo config plugins when needed — **not** in domain.

---

## 6. SQLite schema proposal (v1)

Deterministic IDs: ULID or `uuidv7` style strings generated in app, never by LLM.

```sql
-- migrations/001_init.sql (conceptual)

PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'medium', -- low|medium|high
  project_id TEXT REFERENCES projects(id),
  due_local_date TEXT,          -- YYYY-MM-DD local calendar
  due_local_time TEXT,          -- HH:mm optional
  due_timezone TEXT,            -- IANA; null = floating local
  due_at_utc TEXT,              -- resolved instant when fixed
  source TEXT NOT NULL DEFAULT 'manual',
  creation_origin TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_tasks_due ON tasks(due_local_date, completed);
CREATE INDEX idx_tasks_project ON tasks(project_id);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  fire_at_utc TEXT,             -- fixed instant
  fire_local_date TEXT,
  fire_local_time TEXT,
  timezone TEXT,
  semantics TEXT NOT NULL DEFAULT 'fixed', -- fixed|floating
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled|fired|cancelled|snoozed
  snooze_until_utc TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_reminders_task ON reminders(task_id);
CREATE INDEX idx_reminders_status ON reminders(status, fire_at_utc);

CREATE TABLE task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  type TEXT NOT NULL,           -- created|updated|completed|reopened|rescheduled|reminder_*|deleted
  payload_json TEXT,
  source TEXT NOT NULL,         -- manual|agent|notification|widget|…
  run_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_task_events_task ON task_events(task_id, created_at);

CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  title TEXT
);

CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id),
  role TEXT NOT NULL,           -- user|assistant|system
  content TEXT NOT NULL,
  origin TEXT,                  -- text|voice
  created_at TEXT NOT NULL
);

CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES agent_sessions(id),
  status TEXT NOT NULL,         -- running|completed|failed|cancelled
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  source TEXT NOT NULL,         -- app|voice|widget|notification|shortcut
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT,
  usage_json TEXT,              -- tokens, estimated cost; no secrets
  context_snapshot_json TEXT    -- small; no full DB dump
);

CREATE TABLE agent_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id),
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, sequence)
);

CREATE TABLE tool_executions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  args_hash TEXT NOT NULL,
  status TEXT NOT NULL,         -- proposed|confirmed|running|completed|failed|rejected
  args_json TEXT,
  result_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(idempotency_key)
);
CREATE INDEX idx_tool_exec_run ON tool_executions(run_id);

CREATE TABLE notification_bindings (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL REFERENCES reminders(id),
  os_notification_id TEXT NOT NULL,
  platform TEXT NOT NULL,       -- ios|android
  status TEXT NOT NULL,         -- scheduled|delivered|cancelled|failed
  updated_at TEXT NOT NULL,
  UNIQUE(reminder_id)
);

CREATE TABLE outbox_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- schedule_notification|cancel_notification|refresh_widget|…
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|processing|done|failed
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_outbox_pending ON outbox_events(status, next_attempt_at);

-- Optional later: user_preferences, notification_candidates (untrusted), FTS
CREATE VIRTUAL TABLE tasks_fts USING fts5(
  title, notes, content='tasks', content_rowid='rowid'
);
```

**Rules:** LLM never writes SQL. Mutations only via domain services inside transactions that also append `task_events` / `outbox_events`.

---

## 7. Agent runtime contract

```ts
interface AgentInput {
  runId?: string;                 // client-generated for idempotency of start
  sessionId: string;
  text: string;
  source: 'app' | 'voice' | 'widget' | 'notification' | 'shortcut';
  context: ContextSnapshot;
  modelId: string;
  budgets: RunBudgets;
  signal?: AbortSignal;
}

interface RunBudgets {
  maxModelTurns: number;          // e.g. 8
  maxToolCalls: number;           // e.g. 12
  maxParallelReads: number;       // e.g. 4
  maxInputChars: number;
  maxOutputTokens: number;
  timeoutMs: number;
  maxEstimatedCostUsd?: number;
}

interface ContextSnapshot {
  surface: string;                // home|calendar|task_detail|settings|…
  selectedTaskId?: string;
  selectedLocalDate?: string;
  visibleTaskIds: string[];       // not full rows
  activeFilter?: string;
  locale: string;
  timezone: string;
  invocationSource: AgentInput['source'];
  provenance: ProvenanceTag;      // for any external blobs
}

type ProvenanceTag =
  | 'trusted_system'
  | 'trusted_user'
  | 'trusted_app'
  | 'untrusted_external';

type AgentEvent =
  | { type: 'run.started'; runId: string; sessionId: string }
  | { type: 'context.ready'; snapshot: ContextSnapshot }
  | { type: 'model.started'; provider: string; model: string }
  | { type: 'response.delta'; text: string }
  | { type: 'tool.proposed'; call: ToolCall }
  | { type: 'tool.confirmation_required'; call: ToolCall; reason: string }
  | { type: 'tool.started'; executionId: string; toolName: string }
  | { type: 'tool.completed'; executionId: string; result: unknown; receipt?: ActionReceipt }
  | { type: 'tool.failed'; executionId: string; error: AgentError }
  | { type: 'response.completed'; response: AgentResponse }
  | { type: 'run.cancelled'; runId: string }
  | { type: 'run.failed'; runId: string; error: AgentError };

interface AgentRuntime {
  run(input: AgentInput): AsyncIterable<AgentEvent>;
  cancel(runId: string): Promise<void>;
}

interface AgentResponse {
  text: string;
  receipts?: ActionReceipt[];
  suggestions?: SuggestedAction[];
  entities?: EntityReference[];
}

// UI assistant state is DERIVED from events — never independent booleans that drift.
type AssistantOrbState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'contextualizing'
  | 'thinking'
  | 'executing'
  | 'waiting_confirmation'
  | 'responding'
  | 'speaking'
  | 'error';
```

Single root agent: **`AetherAgentRuntime`**. Tools are deterministic. No multi-agent swarm for CRUD.

---

## 8. Tool registry proposal

| Tool ID | Risk | Notes |
| --- | --- | --- |
| `tasks.list` | READ | Parallel OK |
| `tasks.search` | READ | FTS + filters |
| `tasks.get` | READ | |
| `tasks.create` | REVERSIBLE_WRITE | Undo; idempotent |
| `tasks.update` | REVERSIBLE_WRITE | Serialize writes |
| `tasks.complete` | REVERSIBLE_WRITE | Undo |
| `tasks.reopen` | REVERSIBLE_WRITE | |
| `tasks.delete` | DESTRUCTIVE | Confirm by context / always bulk |
| `reminders.list` | READ | |
| `reminders.schedule` | REVERSIBLE_WRITE | Outbox → OS |
| `reminders.reschedule` | SENSITIVE_WRITE | Bulk → confirm |
| `reminders.cancel` | REVERSIBLE_WRITE | |
| `analytics.workload` | READ | SQL aggregates |
| `analytics.activity` | READ | |
| `analytics.completion` | READ | |
| `app.navigate` | EXTERNAL | In-app routes only |

**Never:** SQL, HTTP, FS, shell, arbitrary JS.

Flow: `Model → ToolProposal → SchemaValidation → Policy → DomainValidation → Execution → Receipt`.

---

## 9. Safety / policy matrix

| Action | Policy |
| --- | --- |
| List / search / get / analytics | Execute immediately |
| Create task / schedule reminder | Execute + Undo receipt |
| Complete / reopen / single reschedule | Execute + Undo |
| Bulk reschedule | Confirmation required |
| Delete single (recent / empty notes) | Contextual confirm or Undo window |
| Delete single (with history / notes) | Confirm |
| Bulk delete / “delete everything” | Always confirm |
| External content as instruction | Never; treat as data `untrusted_external` |
| Model without tool support | Reject as Full Agent model |

Policy Engine is code. LLM cannot lower risk.

Idempotency: unique `idempotency_key` (run_id + tool_call_id + args_hash) → return prior result.

Execution: parallelize READ; serialize all writes.

---

## 10. OpenRouter capability strategy

1. Fetch `/models` including `supported_parameters`, architecture modalities, context.
2. Classify each model:

| Tier | Criteria | Role |
| --- | --- | --- |
| Full Agent | tools + structured_outputs | Default agent model |
| Agent | tools only | Agent with runtime schema validation |
| Limited Assistant | structured_outputs, no tools | Conversation + structured forms only |
| Conversation Only | text | Chat only; no mutations |

3. Settings: only Full Agent / Agent selectable as **main Flow agent**.
4. Requests: `stream: true`, `provider.require_parameters: true`, optional privacy `data_collection: 'deny'`.
5. Structured outputs / tool calls instead of markdown JSON scrape.
6. Map errors: auth, credits, rate limit (+ Retry-After), provider unavailable, malformed.
7. Usage + estimated cost in `agent_runs`; never log key, raw prompts, notes, audio.

Interface:

```ts
interface InferenceProvider {
  id: string;
  getCapabilities(): ProviderCapabilities;
  stream(request: InferenceRequest, signal: AbortSignal): AsyncIterable<ModelEvent>;
}
```

Implement **only** `OpenRouterProvider`. No local provider stubs.

---

## 11. Assistant / orb interaction model

```text
RootLayout
├── Stack (Home, Calendar/Inbox, Settings, …)
└── AssistantHost  (persists across navigation)
      ├── AssistantOrb (center nav control — not a tab)
      └── Composer / half-sheet / full conversation
```

| Gesture | Behavior |
| --- | --- |
| Tap orb | Open compact composer |
| Hold | Start voice immediately |
| Hold + lock | Longer capture |
| Release | Finalize → STT → same AgentRuntime |
| Swipe / expand | Half-sheet → full conversation |

Orb animation = `AssistantOrbState` from events. No decorative perpetual motion.

Voice = transport: `mic → STT → AgentInput`. Same session as text.

---

## 12. Native boundaries (Android / iOS)

### Shared (TS)

Domain, agent runtime, tools, policies, temporal, SQLite, inference protocol, conversation semantics, widget **data** contracts.

### iOS-specific (later native modules)

- Liquid Glass / system materials where supported
- Native sheets, haptics, WidgetKit, App Intents
- Notification actions; no fake Notification Access parity

### Android-specific

- Material-compatible hierarchy (not iOS glass clone)
- Notification channels, exact alarm permission UX (`SCHEDULE_EXACT_ALARM` honesty)
- App widgets via Android widget APIs
- Future: Notification Access opt-in + allowlist + untrusted candidates only

### This phase native deps to introduce when needed

- `expo-sqlite`
- `expo-notifications`
- Real `expo-audio` in dev client (fix Metro alias)
- No local ML packs

---

## 13. Migration phases

| Phase | Deliverable |
| --- | --- |
| **0** | Audit + this doc |
| **1** | Remove fake AI/audio; honest failures; local calendar helper; fix system theme; STT provider interface + OpenRouter STT path only |
| **2** | SQLite + migrations + repositories; migrate tasks from AsyncStorage |
| **3** | Temporal core + domain Task/Reminder services + task_events |
| **4** | OpenRouterProvider stream + capabilities + structured errors |
| **5** | AetherAgentRuntime + ToolRegistry + Policy + idempotency (read tools first) |
| **6** | Mutation tools + outbox skeleton |
| **7** | AssistantHost + orb + text path |
| **8** | Voice path wired to same runtime |
| **9** | Real reminders + notification actions + bindings |
| **10** | Widget data architecture |
| **11** | Analytics tools (SQL) |
| **12** | Conformance tests + lint/typecheck |
| **13** | Document unresolved native-runtime requirements |

Each phase = reviewable PR-sized slice.

---

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| Scope explosion (widgets + full agent + notifications) | Strict phase order; widgets data-only first |
| Metro audio shim hides broken native path | Conditional resolve; explicit unavailable state |
| OpenRouter model variance (tools) | Capability tiers; block incompatible agent models |
| Data migration from AsyncStorage demo tasks | One-shot migrator; drop demo seeds for new installs |
| Background kill mid-run | Persist `agent_runs`/`tool_executions`; resume/cancel policy |
| Exact alarms on Android 14+ | Explicit permission UX; best-effort fallback labeled honestly |
| Secret leakage in logs/events | Structured instrumentation without content; never store key |
| Confusing AETHER branding with Model Family | Docs + in-app copy: product runtime only |
| Local LLM pressure from manifesto | Explicit non-goal this phase; no stubs |

---

## 15. Exact first implementation slice

**Slice 1 — Correctness purge (no SQLite yet, no agent runtime yet)**

Goals:

1. **Voice honesty**
   - Permission denied → typed `VoiceError: PERMISSION_DENIED`, UI not in recording
   - Recorder unavailable → `AUDIO_UNAVAILABLE`, not mock success
   - Remove `mock://voice-recording` production path
   - Transcription: no random fallbacks; throw typed errors
   - STT: OpenRouter `/api/v1/audio/transcriptions` only (same SecureStore key); never OpenAI with OpenRouter key
2. **AI honesty**
   - On AI failure, do not set synthetic `generateFallbackSummary` as if AI succeeded
   - Surface typed error; optional separate **deterministic** local stats card (not labeled as AI)
3. **Temporal micro-fix**
   - Add `src/temporal/localCalendar.ts` with `getLocalDateString(date = new Date())`
   - Replace UTC `toISOString().split('T')[0]` call sites for “today”
4. **Theme fix**
   - Resolve `system` via `Appearance.getColorScheme()` (or `useColorScheme`)
5. **Metro audio**
   - Stop unconditional shim for all environments; prefer real module when present, honest failure otherwise
6. **Tests** for local calendar + transcription error paths (if test runner light enough; else pure unit functions without Jest if not configured — prefer adding a minimal bun test for pure modules)

Out of slice 1: SQLite, agent runtime, orb, notifications, widgets, local models.

---

## Appendix A — Inventory snapshot

```
Routes:     index, ai, transcribe, settings
Stores:     tasks (domain SoT — bad), settings (OK pattern)
AI:         complete-only OpenRouter, free-form JSON summary
Voice:      shimmed audio + OpenAI STT misuse + mock transcripts
DB:         none (AsyncStorage)
Notifs:     none
Widgets:    none
Tests:      none
LOC src:    ~3305
```

## Appendix B — Preserve vs kill quick map

| Preserve | Kill / replace |
| --- | --- |
| SecureStore BYOK | Fake success paths |
| Error code taxonomy | Mock transcripts / mock URI |
| Design tokens + UI kit | UTC-as-local dates |
| Settings BYOK UX | System-always-dark |
| OpenRouter as only inference | OpenAI STT with OR key |
| Expo 57 / Bun / RN styles | TaskFlow AI-as-tab architecture (later) |
| | Zustand tasks as SoT (phase 2) |
| | Local LLM anything (all phases here) |
