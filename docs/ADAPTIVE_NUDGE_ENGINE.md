# Adaptive Nudge Engine v1

## Product boundary

AETHER keeps three concerns separate:

1. The task schedule (`Task.dueDate`, `dueTime`, `dueTimezone`, and
   `dueSemantics`) is the user's intent.
2. Smart Recovery proposes explicit changes to that schedule after a meaningful
   miss. It remains the only owner of overdue replanning.
3. Adaptive Nudge proposes a derived opportunity to surface an unfinished task
   again. It never changes task dates, times, recurrence cadence, deadlines, or
   recurrence rules.

The durable path is:

`task/reminder mutation -> NudgeService -> pure NudgePlanner -> SQLite nudge intent -> existing notification reliability projection`

SQLite remains authoritative. An OS notification is only a disposable
projection and is repaired by `NotificationReconciliationService`.

## Nudge model and lifecycle

Adaptive follow-ups use the existing `reminders` table with `kind` set to
`adaptive_followup`. Primary user reminders use `kind = primary`. This keeps
adaptive notifications inside the Phase 1 projection, reconciliation, action
receipt, and Undo boundaries without presenting an adaptive nudge as a task.

Each derived row has:

- `id`, `task_id`, and the scheduled local date/time;
- `kind`, `reason`, `generation_source`, and `policy_version`;
- an idempotency key for one policy slot;
- `cancelled_at` and `consumed_at` lifecycle timestamps;
- the existing projection revision, dirty, native identifier, and failure
  fields.

The engine creates at most one pending adaptive row for a task/policy slot.
It cancels derived rows when the task completes, is deleted, is rescheduled,
enters Smart Recovery, or Adaptive Nudges are disabled. A primary reminder is
never duplicated by a follow-up. Adaptive Snooze/Tomorrow changes only the
adaptive reminder row; it does not reschedule the task.

## Behavioral event model

`nudge_events` stores only compact local behavioral data:

| Event | Reliable signal used |
| --- | --- |
| `task_completed` | completion and bounded completion delay |
| `notification_action_complete` | Complete action, including cold action responses |
| `notification_opened` | explicit notification tap only |
| `notification_action_snooze` | explicit Snooze and bounded effective minutes |
| `notification_action_tomorrow` | explicit Tomorrow, kept distinct from Snooze |
| `smart_recovery_accepted` / `smart_recovery_rejected` | explicit Recovery choice |
| `task_rescheduled` | explicit manual schedule change |

Every event contains an event type, local task/nudge reference, timestamp,
weekday, bounded time bucket, source, optional bounded number, policy version,
and an optional local dedupe key. Titles, notes, transcripts, and other task
content are not stored in this table. A notification that produces no explicit
tap or action produces no behavioral event; dismissal/absence is deliberately
not treated as “seen and ignored.”

Notification action receipts remain the idempotency boundary. The event table
also has a unique dedupe key so a retry cannot double-count learning.

## Local learning model

`nudge_profiles` contains one aggregate JSON profile, updated transactionally
with each newly inserted event. It tracks:

- samples, confidence, and counts by morning/midday/afternoon/evening;
- completion counts and explicit deferrals by time bucket;
- an exponentially weighted average of explicit Snooze minutes;
- Tomorrow count, repeated short deferrals, manual reschedules;
- bounded completion delay relative to the task due time and, when a nudge
  exists, relative to the last nudge;
- adaptive completion/deferral counts.

The profile is deterministic and explainable. Snooze values are clamped to
1–240 minutes, and the planner clamps personalized follow-up delays to
10–25 minutes. No embeddings, neural model, LLM, remote provider, or network
request is involved.

Confidence is explicit:

- `insufficient`: fewer than 5 explicit behavioral samples;
- `emerging`: 5–9 samples;
- `confident`: 10 or more samples.

The baseline is used below the minimum threshold. A preferred time bucket is
considered only at `confident`; a learned Snooze delay additionally requires
five explicit Snooze samples and is considered at `emerging` and above. These
signals are correlations, not causal claims that a notification caused
completion.

## Pure planner

`src/domain/nudgePlanner.ts` exposes `NudgePlanner.plan(task, reminderState,
profile, settings, now)` and has no React Native, Expo, SQLite, or notification
dependency.

The planner evaluates, in order:

1. opt-in setting, task completion/deletion, and schedule validity;
2. pending duplicate nudge and explicit-deferral cooldown;
3. per-task and global daily budgets;
4. adaptive cooldown and the Smart Recovery handoff boundary;
5. fixed/floating temporal semantics and the bounded planning horizon;
6. baseline delay versus a bounded learned delay and preferred time window.

Timed tasks preserve the primary reminder and may receive one flexible follow-up
roughly 20 minutes later. A recent miss can receive one follow-up within the
shared 30-minute Recovery grace window. A meaningfully overdue task returns
`delegated_to_smart_recovery` instead of being nudged repeatedly.

Date-only tasks can receive an engine-owned flexible evening opportunity at
18:00 while the task itself remains date-only. This is a derived nudge time,
not an invented task due time. Invalid or malformed temporal data fails closed.

Explainability reasons include `baseline_followup`,
`insufficient_learning_data`, `learned_snooze_delay`,
`preferred_time_window`, `suppressed_daily_budget`,
`suppressed_task_complete`, `explicit_deferral_cooldown`,
`delegated_to_smart_recovery`, and `negative_timing_feedback`.

## Anti-annoyance policy

The v1 defaults are intentionally conservative:

- at most 1 adaptive nudge per task per scheduled day;
- at most 3 adaptive nudges globally per scheduled day;
- 120-minute adaptive cooldown;
- no new follow-up immediately after explicit Snooze/Tomorrow;
- no duplicate pending policy slot;
- completion cancels the current occurrence's adaptive rows.

Budget suppression is a normal planner result (`suppressed_by_budget`), not an
error. Candidate reads are indexed and limited to a seven-day planning horizon
and a bounded task count. Within the same date, high-priority work is considered
before medium and low priority work, so a large overdue set does not become a
notification storm. Smart Recovery remains the preferred mechanism for
meaningful overdue work.

## Projection and presentation adapters

`presentationPolicy.ts` defines shared semantic policies: `gentle`, `standard`,
and `attention_required`. Adaptive follow-ups use `gentle`; primary reminders
use `standard`.

Android maps these to stable channels. Adaptive follow-ups use
`aether-adaptive-reminders` with low importance; ordinary reminders use the
existing `aether-reminders` channel. The app does not create a channel per
nudge or escalate an existing channel. Android user channel settings remain
authoritative.

Apple mapping uses `passive` for gentle and `active` for standard/attention.
Adaptive follow-ups are silent and do not use Time Sensitive or Critical Alerts.
The same business planner and budgets apply on iPhone and iPad; only native
presentation is adapted.

## Smart Recovery and recurrence

The shared `RECOVERY_MISSED_GRACE_MINUTES` constant is 30 minutes. Adaptive
Nudge returns the Recovery handoff reason at that boundary and does not mutate
the schedule. Applying Recovery records an explicit local Recovery event,
cancels stale adaptive rows, and replans against the new schedule. Recovery
mutations are never counted as notification success.

On recurring completion, the current occurrence's derived rows are cancelled.
The recurrence service copies only non-adaptive reminder definitions to the
new occurrence. The new occurrence can receive a newly evaluated adaptive
plan, with a new task id and idempotency key; an old adaptive offset is never
blindly cloned.

## Lifecycle and background strategy

Replanning runs on task create/update/complete/reopen/delete/restore, primary
reminder scheduling, notification Snooze/Tomorrow, Smart Recovery apply/Undo,
settings changes, cold start, foreground transition, and timezone change.
AppState is used at the root lifecycle boundary; navigation events do not drive
planning. Floating nudge rows are invalidated and regenerated after a timezone
change. No periodic background task is required for correctness, so
`expo-background-task` is not added in v1.

The projection horizon is seven days. Plans are persisted before native
projection. If native scheduling fails, the desired nudge remains in SQLite as
dirty/failed and Phase 1 reconciliation repairs it later.

## Privacy, reset, and performance

Behavioral data stays in SQLite on the device. It is not sent to analytics,
AI providers, crash reporting, or a backend. Diagnostics expose counts and
confidence only. The settings action “Reset learned nudge behavior” deletes
events and the aggregate profile and cancels only derived adaptive rows; it
does not delete tasks, recurrence rules, or primary reminders.

Profile updates are incremental. Planning uses indexed event/reminder queries,
a bounded task read, and no Zustand history mirror. The interface separates
the planner from persistence so a more sophisticated local scoring model can
replace the deterministic statistics later without changing task, recovery, or
projection ownership.
