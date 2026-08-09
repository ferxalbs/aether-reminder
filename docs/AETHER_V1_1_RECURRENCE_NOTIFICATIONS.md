# AETHER v1.1 — Recurrence and Actionable Notifications

This slice is stacked on `agent/aether-v1-1-local-fast-path`.

## Implemented

- First-class `recurrence_rules` SQLite schema (migration v6).
- Local recurrence calculation for daily, weekly, monthly, and yearly schedules.
- Fixed cadence and after-completion modes.
- End-date and maximum-occurrence constraints.
- Deterministic occurrence task IDs for retry-safe advancement.
- Completed occurrences remain in history; the next occurrence is a new task.
- Existing enabled reminder semantics are copied to the next occurrence.
- Undo of the latest recurring completion rolls the rule pointer back, removes the generated next occurrence, and reopens the completed occurrence.
- Agent tools for create/get/update/stop recurrence.
- Recurring agent tasks with a start time create an initial reminder projection.
- Notification category with direct `Complete`, `Snooze 10m`, and `Tomorrow` actions.
- Notification actions route through `AetherCommandExecutor`; no raw SQLite mutation path was introduced.
- Completed task reminders are suppressed during notification projection/reconciliation.
- Cold-launch and live notification responses are both handled and task surfaces are refreshed after a mutation.

## Invariants

- SQLite remains authoritative.
- OS notifications remain a projection.
- Recurrence date calculation is local and deterministic.
- The agent is not required to advance a known recurrence rule.
- Notification actions execute the same domain commands as UI/agent operations.
- Recurrence completion is retry-safe through deterministic IDs plus compare-and-swap rule advancement.

## Validation gates

- `bun test`
- `bun run typecheck`
- `bun run lint`
- Physical-device checks on iOS and Android for action visibility, background response delivery, permission behavior, notification dismissal, and recurrence advancement from an OS action.

The native notification behavior must not be declared production-ready until physical-device validation passes.
