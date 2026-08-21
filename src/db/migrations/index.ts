import { migration0001Core } from "./0001_core";
import { migration0002Indexes } from "./0002_indexes";
import { migration0003AgentRuntime } from "./0003_agent_runtime";
import { migration0004NotificationProjection } from "./0004_notification_projection";
import { migration0005NotificationQueryIndexes } from "./0005_notification_query_indexes";
import { migration0006RecurrenceRules } from "./0006_recurrence_rules";
import { migration0007NotificationReliability } from "./0007_notification_reliability";
import { migration0008AdaptiveNudges } from "./0008_adaptive_nudges";
import { migration0009UniversalCapture } from "./0009_universal_capture";
import { migration0010Sync } from "./0010_sync";
import type { Migration } from "./types";

/** Ordered, immutable migration list. Never edit applied migrations — append. */
export const MIGRATIONS: readonly Migration[] = [
  migration0001Core,
  migration0002Indexes,
  migration0003AgentRuntime,
  migration0004NotificationProjection,
  migration0005NotificationQueryIndexes,
  migration0006RecurrenceRules,
  migration0007NotificationReliability,
  migration0008AdaptiveNudges,
  migration0009UniversalCapture,
  migration0010Sync,
];

export const LATEST_SCHEMA_VERSION =
  MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export type { Migration };
