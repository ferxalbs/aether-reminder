# Production Reliability v1

## Status

Current implementation classification: **READY FOR DEVICE VALIDATION**.

SQLite remains authoritative. OS notifications remain disposable projections. Core capture, scheduling, recurrence, completion, Undo, and recovery stay local and network-free.

Unit and static validation do not establish production readiness. Physical Android validation remains required before any higher classification.

## Invariants

- Reminder and task state lives in SQLite.
- Native notification identifiers are projection metadata, not domain identity.
- Native scheduling failure never deletes a domain reminder or task.
- UI, agent tools, and notification actions cross `AetherCommandExecutor` before mutation.
- Native callbacks do not write SQLite directly.
- Deterministic temporal and recurrence logic does not call an LLM.
- Failed recovery remains visible through typed state, local diagnostics, and retry paths.
- No background polling loop or automatic destructive database reset exists.

## Projection state

Each reminder stores durable projection metadata:

- `projection_state`: `pending`, `scheduled`, `stale`, `failed`, `missing`, `not_required`, or `blocked`.
- `projection_dirty`: whether native state needs work.
- `projection_revision`: guards against stale native work overwriting newer SQLite state.
- Attempt count and last attempt/success timestamps.
- Typed `projection_error_code` plus a concise user-facing error.
- `timing_precision`: `exact`, `normal`, or `flexible`.
- Last-known `native_notification_id`, retained when a new projection attempt fails.

Successful scheduling writes `scheduled` and clears dirty state. Successful cancellation writes `not_required` and clears the native ID. Permission, channel, and exact-timing limitations become `blocked`; missing native identifiers become `missing`; other failures remain retryable `failed` rows.

Migration `0007_notification_reliability` adds this metadata and the append-only `notification_action_receipts` table. Existing migrations are not edited.

## Reconciliation

`NotificationReconciliationService` exposes two modes:

- **Incremental**: processes dirty reminders or an explicitly affected task. Used after domain mutations, notification actions, and ordinary foreground repair.
- **Full**: reads all reminders and all native schedules. Used on cold launch, timezone changes, inconsistency, prior repair failure, restart repair, and explicit diagnostics/manual repair.

Full repair:

- Schedules missing required projections.
- Cancels orphan native schedules.
- Cancels duplicate native schedules for one reminder.
- Repairs stale or missing native state.
- Continues after per-reminder failure.
- Limits native work to eight reminders per batch.

Normal route changes do not trigger full-table reconciliation. Results persist in `app_meta` under `reliability.last_reconciliation_*`.

## Lifecycle triggers

- Cold launch: configure notifications and run full repair.
- Foreground: run incremental dirty repair.
- Foreground timezone mismatch, missing prior timezone, or non-`NONE` prior error category: upgrade to full repair.
- Notification action success: refresh UI and run incremental repair.
- Database recovery success: configure and run full repair.

Observed device timezone persists as `reliability.device_timezone`. A failed repair does not advance this marker, so the next lifecycle pass can retry full repair.

## Android capabilities and timing

Android reminder channel: `aether-reminders`.

Notification permission is inspected and requested only through normal notification APIs when scheduling requires it. Exact-alarm permission is not added or requested blindly.

On Android API 31+, Expo SDK 57 does not expose enough runtime information to prove exact-alarm delivery. Exact reminders therefore require an explicit `available` capability; `unknown` is reported as unavailable for exact scheduling. `normal` and `flexible` reminders use date triggers with platform-defined delivery deferral.

This limitation avoids falsely claiming exact timing and avoids introducing manifest or Play policy changes without a demonstrated product requirement.

## Temporal semantics

- `fixed`: resolve local calendar values in stored IANA timezone. Snooze and Tomorrow retain fixed semantics and stored timezone.
- `floating`: resolve local calendar values in device timezone. Snooze and Tomorrow retain floating semantics.
- Local dates use `YYYY-MM-DD`; local times use `HH:mm`.
- DST gaps and invalid timezone values fail typed validation instead of silently shifting.
- Calendar-day arithmetic is separate from UTC instant arithmetic.
- Persistent action receipts store Snooze/Tomorrow target values. Retry after process death reuses original target instead of applying another offset.

## Notification actions

Complete, Snooze, and Tomorrow use command-layer mutations. A response is claimed in SQLite before mutation and marked completed only after command success. A claimed-but-incomplete response remains retryable. Completed responses are idempotent across process restart and duplicate delivery.

Native dismissal happens only after domain mutation success. Dismissal failure is reported as non-fatal operational telemetry; it does not erase domain state.

## Diagnostics

`ReliabilityDiagnosticsService` returns operational data only:

- Database readiness and schema version.
- SQLite quick-check and foreign-key-check status.
- Reminder projection counts.
- Notification permission/channel/exact capability state.
- Native scheduled count when readable.
- Device timezone.
- Last reconciliation timestamp, bounded counters, duration, and error category.

Diagnostics exclude task titles, notes, notification bodies, provider credentials, API keys, and secrets.

## Database integrity

Startup remains fail-closed on migration/bootstrap failure. Explicit database checks validate:

- `PRAGMA quick_check`.
- `PRAGMA foreign_key_check`.
- Expected latest schema version.
- Reminder-to-task relationship integrity.

Only explicit, user-confirmed database recreation is destructive.

## Validation gates

Automated validation target:

```text
bun test
bun run typecheck
bun run lint
```

Focused coverage includes migration v7, projection state transitions, incremental/full reconciliation, duplicate/orphan native cleanup, bounded failure continuation, persistent action receipts, fixed/floating action targets, and diagnostics redaction.

Physical-device validation still required on representative Android environments:

- Pixel/stock Android.
- Samsung One UI.
- Motorola Android.
- Xiaomi/HyperOS or equivalent OEM behavior.

Exercise permission grant/revoke, channel recreation, process kill/force-stop/reopen, reboot, timezone and clock changes, DST boundaries, recurring reminders, Complete/Snooze/Tomorrow, duplicate responses, native cancellation, persistence failures, battery restrictions, and repair after restart. Capture `adb logcat` around `AndroidRuntime`, React Native, Hermes, Reanimated, and the app process when available.

No physical-device or OEM result is implied by this document. Until those checks complete, classification stays **READY FOR DEVICE VALIDATION**.
