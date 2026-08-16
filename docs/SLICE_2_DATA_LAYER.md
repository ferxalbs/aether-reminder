# Slice 2 — SQLite data layer

## ID strategy

**UUIDv7** via `src/lib/id.ts` (`createId()`).

- 48-bit Unix ms timestamp + random bits
- Sortable, no coordination, no large dependency
- Used for tasks, reminders, projects, tags, task_events

## Migration strategy

- Ordered migrations in `src/db/migrations/`
- Version source of truth: **`PRAGMA user_version`**
- Each migration runs in its own transaction
- Failure → rollback → version not advanced (fail closed)
- Never edit shipped migrations; append new files

## Demo data handling (contamination filter — not product seeds)

**There is no seed system.** Production and development must never insert demo tasks, sample productivity data, fake AI output, fake voice transcripts, or mock successful operations.

The legacy migration retains narrowly scoped knowledge of historical `demo-*` records **only** to **prevent** those records from entering SQLite during one-time AsyncStorage import:

- Known seed IDs `demo-1`…`demo-4` and known demo titles are **excluded** (contamination filter)
- This is **not** product seed data and must not be extended into a demo catalog
- Test-only fixtures may exist **only** inside test code
- No demo seed CLI, no runtime sample tasks, no development sample dataset

## Legacy import

- Key: `taskflow-tasks-storage`
- One-time flag in `app_meta.legacy_tasks_migrated_v1`
- Idempotent; preserves safe IDs; leaves AsyncStorage until success then clears

## Indexes

| Index                          | Why                        |
| ------------------------------ | -------------------------- |
| `idx_tasks_active_due`         | today / overdue / upcoming |
| `idx_tasks_active_completed`   | completion filters         |
| `idx_tasks_active_project`     | project lists              |
| `idx_tasks_active_priority`    | priority filters           |
| `idx_task_events_task_created` | history                    |
| `idx_reminders_task`           | task reminders             |
| `idx_reminders_enabled_date`   | future scheduling queries  |
