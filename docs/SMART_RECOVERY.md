# Smart Recovery v1

Smart Recovery is a deterministic, local read-and-command feature for tasks
that slipped. It derives a temporary review plan from SQLite, lets the user
adjust each proposal, and applies only explicitly approved schedule changes.
It does not learn behavior, call an LLM, poll in the background, or become a
second task store.

## Candidate definition

A candidate is an active, incomplete, non-deleted task with a valid local due
date that is either:

- overdue: `dueDate < local date` in the task's effective calendar; or
- missed timed work: `dueDate == local date`, a valid `dueTime` is before the
  current wall-clock time, and at least 30 minutes have elapsed.

Date-only tasks due today are never candidates before the day ends. Completed,
deleted, malformed, and impossible schedules are ignored safely. Eligibility
does not depend on notification permission or whether an OS notification was
seen, dismissed, or ignored.

Floating tasks use the current device calendar. Fixed tasks use their stored
timezone, falling back to the device timezone when no fixed zone is stored.
The candidate query uses the existing `idx_tasks_active_due` index and reads
overdue work plus a one-calendar-day timezone window; pure domain code performs
the exact wall-clock classification.

## Derived proposal model

`RecoveryService` regenerates a `RecoveryPlan` cheaply from authoritative task
and recurrence rows. Plans are not persisted. Each proposal contains:

- a stable proposal id, task id/title/priority, and the captured `updatedAt`
  version;
- the previous date, time, timezone, and temporal semantics;
- one deterministic proposed schedule and a reason (`overdue` or `missed_time`);
- visible alternatives; and
- limited recurrence metadata for explaining that only the current occurrence
  is being changed.

The captured task version is the stale-plan guard. A changed, completed,
deleted, or independently rescheduled task is never overwritten by an old
proposal.

## Recommendation policy

The v1 policy has no personal-schedule assumptions:

- overdue date-only: today, preserving `dueTime = null`;
- overdue timed work: today at the original time when at least 30 minutes
  remain, otherwise tomorrow at that time;
- missed timed work today: tomorrow at the original time.

The review surface exposes Later today when it is possible, using a fixed
60-minute offset, plus Tomorrow, Keep current schedule, and Remove from this
recovery plan where useful. The chosen schedule is always visible before the
primary `Apply Recovery` action.

## Apply and Undo

The UI sends selections to `AetherCommandExecutor.applyRecovery`. The command
layer validates each schedule, then `TasksRepository` applies schedule-only
updates with `expectedUpdatedAt` checks inside one SQLite transaction. Valid
entries commit task rows and `rescheduled` task events together. Stale entries
are skipped without mutation; entries already at the selected schedule are
reported as `alreadyApplied` without creating another event.

The result is structured as `applied`, `skippedStale`, `alreadyApplied`,
`excluded`, `failed`, and `projectionFailures`. A successful batch creates one
`BULK_MUTATION` receipt with the previous schedule and the version written by
the batch. Explicit Undo conditionally restores each successful task and will
skip a newer user edit rather than overwrite it.

Applying the same plan again is idempotent: the first apply changes the task
version, and the retry sees the selected schedule as already applied. After an
app restart, the plan is regenerated from SQLite; recovered tasks are no longer
eligible unless a later authoritative mutation makes them eligible again.

## Recurrence handling

Recovery changes only the current occurrence task. It does not update the
recurrence rule's frequency, interval, weekdays, month days, end date, or
maximum occurrences.

For fixed recurrence, the next occurrence is now derived from the rule's
immutable `startDate` anchor and `occurrenceCount`, rather than the mutable
recovered task date. Recovering an occurrence therefore does not shift the
future cadence. For `after_completion`, the existing completion-date behavior
is preserved.

## Notification reliability

Smart Recovery never calls the OS notification API. After the SQLite task
mutation, primary reminder rows are updated through the existing reminder
service with native projection deferred. Affected reminders are marked dirty
and repaired through incremental `NotificationReconciliationService`.

Native permission, channel, exact-timing, or scheduling failures are reported
as projection failures while the authoritative task recovery remains applied.
Production Reliability can repair those disposable projections on the normal
foreground, launch, or retry paths.

## Platform-neutral UX

Home shows a compact recovery summary only when candidates exist. The review
surface uses the shared command/store path on Android, iOS, and iPadOS. It is a
full-width mobile sheet on compact windows and a bounded centered panel on
large windows. It uses `useWindowDimensions`, so rotation and reduced-width
multitasking resize the surface without phone-only platform assumptions.

`ios.supportsTablet` is enabled. `ios.requireFullScreen` remains unset, so the
configuration does not intentionally disable Split View or Slide Over. Android
uses the existing native modal/back behavior and the same translucent/flat
surface family without relying on iOS-only glass behavior.

## Performance and limitations

Candidate discovery is one indexed SQLite read followed by pure in-memory
classification and bounded recurrence metadata reads. There is no network,
LLM, notification full scan, polling loop, or continuous background execution.
Recovery refreshes on focused Home load, foreground repair, successful task
mutations, and explicit review opening.

The v1 policy does not know whether a user was available, how long work takes,
calendar availability, location, sleep/work hours, or notification engagement.
Timezone and malformed-schedule handling is intentionally conservative. Native
projection success still requires device permissions/capabilities and must be
verified on real platforms.

## Future extension points

An Adaptive Nudge Engine may later consume authoritative task history and user
choices through a separate policy boundary. It must not replace the current
SQLite authority, stale-version checks, explicit approval, recurrence anchor,
or Production Reliability projection contract.
