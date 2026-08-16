# NOW/NEXT Attention Engine

Phase 4 introduces a small, local-first attention read model for Home. It
selects what deserves attention; it does not rewrite the user's schedule.

> **NOW/NEXT decides what AETHER should surface, not what the user's schedule secretly becomes.**

## Product responsibility

NOW/NEXT is an execution surface, not a second task database. It answers:

> Given the local task, temporal, recovery, nudge, and reminder-reliability
> facts already available, what deserves attention now and what is likely to
> matter immediately after?

The ownership boundaries are:

| Concern                        | Owner                                   | NOW/NEXT behavior                                            |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------ |
| Task/reminder/recurrence truth | SQLite repositories and domain services | Reads bounded facts                                          |
| Native notification projection | Production Reliability                  | Exposes a separate degraded-delivery alert                   |
| Missed/overdue replanning      | Smart Recovery                          | Exposes one recovery intervention, not an overdue task queue |
| Follow-up timing and learning  | Adaptive Nudge                          | Exposes a semantic `nudge_due` signal                        |
| Attention selection            | Attention Planner                       | Produces `AttentionPlan` only                                |
| Presentation                   | Home and `AttentionSurface`             | Renders the plan and dispatches commands                     |

NOW/NEXT never changes `dueDate`, `dueTime`, recurrence cadence, reminder
projection state, or native notifications. Focus selection is explicit intent,
not a task mutation.

## AttentionPlan

`src/domain/attentionPlanner.ts` defines the pure read model:

```ts
interface AttentionPlan {
  generatedAt: string;
  policyVersion: number;
  now: AttentionItem | null;
  next: AttentionItem[];
  choices: AttentionItem[];
  alerts: AttentionAlert[];
  selectionMode: "recommended" | "choose" | "clear";
  nextRefreshAt: string | null;
}
```

`now` contains at most one item. `next` is capped at four items and is the
small set of candidates immediately following NOW; it is not an Upcoming
query. `choices` is populated only when evidence is genuinely ambiguous.

An item contains UI-facing identity and explanation data: task ID/title,
structured reason codes, rank tier, scheduled context, priority, confidence,
and the minimum schedule fields needed for factual display. It does not copy
the complete `Task` entity.

The planner has no React, Expo, SQLite, native notification, network, or model
dependency. `AttentionService` gathers facts and persists only explicit focus
intent; `AttentionPlanner` makes the deterministic decision.

## Candidate facts and bounded querying

`AttentionCandidateFacts` normalizes temporal state, priority, explicit focus,
recovery ownership, and the Adaptive Nudge semantic state before ranking. This
keeps future signals such as calendar availability or duration estimations at
an explicit boundary rather than adding them directly to UI code.

`TasksRepository.listAttentionCandidates()` performs one bounded SQL read:

- active incomplete tasks whose due date is from one local calendar day before
  today through two days after today;
- tasks with an active, unconsumed Adaptive Nudge;
- the explicitly focused task, when present;
- deterministic SQL ordering and a limit of 32.

Adaptive-nudge candidates are ordered ahead of ordinary window candidates, and
the focused task is defensively fetched and merged if the bounded query cannot
include it. Results are de-duplicated in memory. The query uses the existing
active due-date task index and the Phase 3 adaptive-nudge indexes; no new
migration was necessary.

Recovery state is passed as a small set of proposal IDs. Recovery-owned tasks
are not allowed to flood ranking. An explicitly focused recovery-owned task is
preserved because direct user intent remains stronger than ordinary automation.

## Ranking policy

The policy is versioned in `ATTENTION_POLICY` (`policyVersion: 1`). The current
tiers are:

1. **Tier A — explicit focus.** A valid `Focus now` intent is strongest.
2. **Tier B — temporally imminent.** A timed task due within 30 minutes, or
   just arrived within the shared 30-minute handoff boundary.
3. **Tier C — Adaptive Nudge due.** The planner consumes the Nudge service's
   semantic result; it does not recompute behavioral timing.
4. **Tier D — scheduled today.** Temporal presence comes before static
   priority; high priority is an additional reason, not a replacement for
   urgency.
5. **Tier E — near-future relevant.** Only a two-day bounded window is
   considered, and it is exposed as NEXT unless a stronger signal exists.

Undated work has no temporal tier. High priority alone cannot arbitrarily make
an undated task NOW. Invalid dates or timezones degrade to conservative
date-only facts rather than creating a false imminent recommendation.

Tie-breaking is deterministic:

1. rank tier;
2. relevant due proximity;
3. priority (`high`, `medium`, `low`);
4. due date;
5. due time;
6. creation instant;
7. task ID.

The final task ID fallback means identical facts never depend on SQLite return
order.

## Confidence and uncertainty

Confidence is a bounded evidence label, not a probability:

- `high`: explicit focus or imminent timed work;
- `medium`: a valid Adaptive Nudge or strongly supported scheduled-today timed
  task;
- `low`: date-only or near-future evidence without a decisive distinction.

When the first two ordinary candidates are effectively equivalent, the planner
returns `selectionMode: 'choose'` with at most three choices. No percentage or
opaque score is shown to the user. With no evidence, it returns `clear`.

Every automatic item is explainable from reason codes such as `due_now`,
`due_imminent`, `due_today`, `high_priority_today`,
`adaptive_followup_due`, and `next_scheduled`. The Home surface translates
those codes into factual copy such as “Due now”, “Due at 10:30”, “Scheduled
today”, or “Good follow-up time”.

## User focus, rejection, and conflicts

`Focus now` is routed through `AetherCommandExecutor` to
`AttentionService.focusNow()`. The minimal intent is stored in `app_meta` under
`attention.focus`:

```json
{ "taskId": "...", "createdAt": "...", "source": "manual" }
```

This state is cleared when the user clears focus or when the task is no longer
valid. It is not copied to recurrence successors. A normal candidate cannot
silently displace valid explicit focus.

If another timed task becomes due immediately, the plan preserves NOW and adds
a `focus_conflict` alert with “Switch focus?”. The user chooses whether to
switch. `Not now` is session-level attention suppression for an automatic
candidate; it does not change due dates and is not a second reminder system.

Automatic NOW uses 15 minutes of hysteresis. A current valid automatic choice
survives a small proximity or priority change; a materially stronger tier or
unambiguous due-now candidate can replace it. Repeated planning with identical
facts and clock values is idempotent.

## Recovery integration

Home already derives the Smart Recovery plan. The store passes its proposal
count and task IDs into the attention service. The planner emits one
`recovery_available` alert such as “4 things slipped — Review your recovery
plan” and excludes those tasks from ordinary ranking.

Applying Recovery continues through the existing command boundary. The command
mutates authoritative schedules, keeps recurrence ownership intact, updates
notification projection, and replans Adaptive Nudges. Home then refreshes the
Recovery plan and invalidates/recomputes AttentionPlan from the new state.

## Adaptive Nudge integration

`NudgeService.getAttentionSignals()` reads only active, unconsumed adaptive
intents and returns `nudge_due` when the derived slot has arrived. It does not
expose or reinterpret raw profile history, preferred time buckets, confidence
calculation, budgets, or cooldowns. Those remain Adaptive Nudge ownership.

Disabled, cancelled, consumed, or not-yet-due intents do not raise the
candidate. The pure planner also accepts `nudge_suppressed` for deterministic
tests and future semantic suppression without coupling itself to nudge
internals.

## Reliability alerts

`ReliabilityDiagnosticsService.collectAttentionState()` is a lightweight read;
it checks reminder capability/permission state but intentionally avoids
native-notification enumeration and full integrity diagnostics on every Home
render. If active reminders exist and projection states are materially degraded
(`failed`, `blocked`, `missing`, disabled permission/channel, or a recorded
delivery error), AttentionPlan emits one separate `reliability_degraded` alert.
This does not affect task ranking and uses user-facing language rather than
projection terminology.

## Recurrence behavior

The planner sees the current occurrence as the current task row. Completing NOW
uses the existing command flow: task completion, reliability projection,
recurrence advancement, Adaptive Nudge replanning, then Home recomputation.
The completed row disappears naturally, and the successor is evaluated from
its own schedule. No focus intent is propagated to the next occurrence.

## Invalidation and temporal refresh

Meaningful task mutations already refresh Home surfaces and Recovery; Recovery
refresh now also recomputes AttentionPlan. Explicit focus, task completion,
reopen, delete, create, editor updates, Recovery Apply/Undo, and Adaptive Nudge
setting changes all invalidate the derived plan. Root foreground recovery
refreshes it after notification/timezone reconciliation.

The planner returns `nextRefreshAt`, calculated from the next imminent-window
boundary, due-time boundary, or local date boundary. Home schedules one
low-frequency in-app timeout while active. Background timers are not required
for correctness: foreground refresh recomputes from the authoritative clock.
There is no one-second polling loop.

## Platform and accessibility strategy

The decision logic and plan are identical on Android, iOS, and iPadOS. Home
uses a normal elevated `Card` for route-local attention content, avoiding a
recursive Android blur hierarchy. Existing navigation and composer behavior
remain unchanged.

- Compact phone widths use vertical NOW, NEXT, and alert sections.
- Widths of 720 points and above use a bounded two-column NOW/NEXT composition.
- The breakpoint is based on window width, not `Platform.OS`, so iPad
  multitasking and resizing can adapt naturally.
- NOW remains visually dominant; NEXT uses quieter outline surfaces.
- Buttons retain platform minimum touch targets, labels are accessible, text
  can scale, and selection is not communicated by color alone.
- Existing reduced-motion handling remains in Home; the attention surface does
  not add an animation loop.

Physical-device behavior is tracked separately in
`docs/VALIDATION_NOW_NEXT.md`; no device result is inferred from static checks.

## Privacy, performance, and extension points

Planning is local-only and does not call an LLM or network. Focus intent is
minimal local app metadata. No new behavioral event table was added; existing
Adaptive Nudge events remain the owner of nudge learning and do not contain
task titles or notes. The plan is derived and not persisted as a ranked task
snapshot.

The normal path is one bounded repository query plus small local reads and
pure in-memory ranking. It does not scan task history, enumerate native
notifications, reconcile reminders, or render a full task inventory.

Future signals such as calendar availability, estimated duration, location, or
semantic importance may be added as explicit candidate facts/providers. They
are intentionally not implemented here, and none is needed for the core plan.

## Explicitly rejected approaches

- opaque weighted scores as the initial policy;
- treating NOW as a renamed Today or Upcoming list;
- ranking every overdue task individually;
- silently rescheduling or reprioritizing a task to make it NOW;
- letting high priority permanently dominate temporal reality;
- selecting arbitrary undated work to avoid an empty state;
- using an LLM or network for ordinary ordering;
- creating a second bottom-navigation destination;
- adding a generic plugin framework before a concrete signal needs it;
- using native blur or a full-screen overlay for route-local attention content.
