# AETHER Reminder v1.1 — Local-First Performance Architecture

## Product thesis

AETHER is a reminder engine first and an AI product second. Core capture, scheduling, search, completion, recurrence, notification delivery, and recovery must remain useful without network access or an AI provider. AI is reserved for ambiguity, planning, summarization, and multi-step tool execution.

The target interaction model is:

`capture -> deterministic local interpretation -> domain command -> SQLite -> projection -> optional agent escalation`

The common path should not require a model request.

## Non-negotiable invariants

- SQLite remains authoritative for domain state.
- API keys remain in SecureStore only.
- Local reminder creation works offline.
- A model failure cannot block manual task operations.
- Notification state remains a projection of SQLite state, not a second source of truth.
- Mutations remain receipt-backed and reversible where the current policy permits it.
- Time calculations use local-calendar/timezone semantics rather than UTC string slicing.
- Expensive cross-surface reloads must be coalesced or incrementally invalidated.
- UI motion must remain interruptible and respect Reduce Motion.

## Phase 1 — Fast capture and hot-path cleanup

Implemented in `agent/aether-v1-1-local-fast-path`:

1. `LocalIntentParser`
   - deterministic, network-free parsing
   - English and Spanish high-confidence tokens
   - `today` / `hoy`
   - `tomorrow` / `mañana`
   - `in 20 minutes` / `en 20 minutos`
   - 12-hour and 24-hour time forms
   - explicit priority markers such as `!high`, `!alta`, `!low`, `!baja`
   - conservative fallback to the existing Today / any-time behavior
2. Quick Capture previews the interpreted date, time, and priority before commit.
3. Cold start blocks only on local database bootstrap; the focused route owns its task query.
4. Post-mutation Today, Upcoming, and All projections are loaded concurrently and committed to Zustand as one coherent snapshot rather than three sequential refreshes.

### Phase 1 acceptance criteria

- No network request is required for deterministic Quick Capture.
- `Buy milk tomorrow at 8am !high` becomes a tomorrow 08:00 high-priority reminder while storing `Buy milk` as the title.
- `Llamar a mamá en 20 minutos !alta` resolves against the device clock locally.
- Home does not flash an empty state before its first task query resolves.
- Cold start no longer performs the same Today query in both RootLayout and Home.

## Phase 2 — Recurrence engine

Add recurrence as a first-class local domain concept rather than an opaque natural-language string.

Proposed schema:

```text
recurrence_rules
  id
  task_id
  frequency            daily | weekly | monthly | yearly
  interval             integer >= 1
  weekdays_json        nullable
  month_days_json      nullable
  start_date
  end_date              nullable
  max_occurrences       nullable
  mode                  fixed | after_completion
  timezone              nullable
  created_at
  updated_at
```

Required behavior:

- calculate the next occurrence locally
- support fixed schedules and after-completion schedules
- preserve timezone/floating semantics
- generate the next occurrence idempotently
- never require a model to execute a known recurrence rule
- add tools such as `tasks.create_recurring`, `tasks.update_recurrence`, and `tasks.stop_recurrence`

## Phase 3 — Actionable notifications

Register notification categories and support direct OS actions:

- Complete
- Snooze 10m
- Tomorrow

The action handler must route through domain commands so receipts, task events, and notification projection stay consistent. Notification actions must not write raw SQLite state directly.

Projection repair should evolve from broad reconciliation toward dirty-entity reconciliation:

`domain mutation -> mark reminder dirty -> project affected reminder -> foreground repair pass`

Full reconciliation remains a repair mechanism, not the normal mutation path.

## Phase 4 — Native scheduling UX

Replace ISO date/time text entry in the commercial UI with native controls and fast presets.

Date presets:

- Today
- Tomorrow
- Next week
- Pick date
- No date

Time presets:

- Morning
- Afternoon
- Evening
- Pick time
- Any time

Use Expo UI native controls where stable for the target platforms, with explicit fallbacks when a native surface is unavailable. Keep the domain representation unchanged.

## Phase 5 — Search and organization

Add local organization without making the primary UI heavier.

Planned capabilities:

- tags
- saved smart views
- FTS5 search over title, notes, tags, and project metadata
- timeline grouping: Today, Tomorrow, This Week, Next Week, Later

Avoid embeddings for the default search path until measured product requirements justify the storage and inference cost.

## Phase 6 — Device surfaces

Opt-in extensions after the core engine is stable:

- iOS Home/Lock Screen widgets
- Share to AETHER
- calendar context overlay
- location reminders
- biometric app lock

These features must remain adapters over the same local domain and command layer.

## Agent routing

Introduce a lightweight local intent router before the current agent runtime.

```text
User input
  |
  +-- deterministic reminder grammar? -> LocalIntentParser -> command
  |
  +-- explicit manual editor? --------> command
  |
  +-- ambiguous / planning request? --> AETHER Agent Runtime -> tools -> command
```

Do not send trivial reminders to the LLM only to recover fields that can be parsed locally.

The existing agent runtime remains responsible for:

- planning
- ambiguous requests
- multi-task operations
- contextual explanation
- tool selection
- confirmation policy

## Projection strategy

Today, Upcoming, and All are views over SQLite, not independent stores. The near-term optimization is concurrent coherent refresh. The later target is receipt-driven invalidation:

```text
receipt
  -> determine affected task ids
  -> patch safe local state immediately
  -> invalidate only projections whose membership may have changed
  -> reconcile from SQLite in the background
```

This preserves correctness while reducing repeated reads after every mutation.

## Performance budgets

Initial engineering budgets for physical-device validation:

- database bootstrap: target < 150 ms on a representative mid-range Android device after first-run migrations
- deterministic capture parsing: target < 2 ms for normal input
- tap-to-visible optimistic task state: target < 100 ms
- task list interaction: maintain 60 fps on representative devices
- navigation transition JS work: avoid synchronous DB scans on transition
- agent UI first feedback: immediate local state change before network completion

These are product budgets, not claims, until measured on physical devices.

## Commercial boundary

Free/core should remain useful without AI:

- manual reminders
- basic recurrence
- local notifications
- Today / Upcoming / All
- offline use

Premium should sell leverage rather than basic reliability:

- managed AETHER inference
- advanced planning/reasoning
- advanced recurrence and smart views
- calendar/location intelligence
- richer widgets and personalization
- optional privacy features

AETHER Cloud provides hosted capabilities; BYOK is not supported in AETHER Reminder.

## Validation gates

Every phase must pass:

- `bun test`
- `bun run typecheck`
- `bun run lint`
- native export/build validation where the change touches Expo/native configuration
- physical-device checks for notifications, haptics, background behavior, widgets, calendar, location, or biometric APIs

No phase is production-ready based only on simulator or unit-test success when it changes OS-managed behavior.
