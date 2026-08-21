import type {
  RecurrenceFrequency,
  RecurrenceMode,
  RecurrenceRule,
  Reminder,
  ReminderTimingPrecision,
  Task,
  TaskCaptureSource,
  TaskPriority,
  TaskSource,
  TemporalSemantics,
} from "@/domain/entities";
import type { PersistedSettings } from "@/stores/settingsPersistence";

export class SyncPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncPayloadError";
  }
}

export const SYNC_RECURRENCE_ENTITY_PREFIX = "recurrence:";

export function toSyncRecurrenceEntityId(ruleId: string): string {
  const id = nonEmptyString(ruleId, "recurrence rule id");
  return `${SYNC_RECURRENCE_ENTITY_PREFIX}${id}`;
}

export function recurrenceRuleIdFromSyncEntityId(
  entityId: string,
): string | null {
  if (!entityId.startsWith(SYNC_RECURRENCE_ENTITY_PREFIX)) return null;
  const id = entityId.slice(SYNC_RECURRENCE_ENTITY_PREFIX.length).trim();
  return id || null;
}

export type SyncTaskPayload = {
  id: string;
  title: string;
  notes: string | null;
  completed: boolean;
  priority: TaskPriority;
  projectId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  dueTimezone: string | null;
  dueSemantics: TemporalSemantics;
  source: TaskSource;
  creationOrigin: TaskSource;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type SyncReminderPayload = {
  id: string;
  taskId: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  timezone: string | null;
  semantics: TemporalSemantics;
  enabled: boolean;
  timingPrecision: ReminderTimingPrecision;
  kind: "primary";
  reason: string | null;
  generationSource: string | null;
  policyVersion: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncRecurrencePayload = {
  id: string;
  taskId: string;
  lastCompletedTaskId: string | null;
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: number[] | null;
  monthDays: number[] | null;
  startDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
  occurrenceCount: number;
  mode: RecurrenceMode;
  timezone: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SyncCaptureSourcePayload =
  | {
      id: string;
      kind: "url";
      url: string;
      createdAt: string;
    }
  | {
      id: string;
      kind: "image";
      /** Image bytes and local asset references remain device-local in Sync v1. */
      hasAsset: boolean;
      mimeType: string;
      sizeBytes: number | null;
      displayName: string | null;
      createdAt: string;
    };

export type SyncCapturePayload = {
  captureId: string;
  taskId: string;
  ingress: string;
  committedAt: string;
  sources: SyncCaptureSourcePayload[];
};

export function toSyncTaskPayload(task: Task): SyncTaskPayload {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    completed: task.completed,
    priority: task.priority,
    projectId: task.projectId,
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    dueTimezone: task.dueTimezone,
    dueSemantics: task.dueSemantics,
    source: task.source,
    creationOrigin: task.creationOrigin,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
  };
}

export function fromSyncTaskPayload(
  value: unknown,
  entityId: string,
): SyncTaskPayload {
  const record = object(value, "task");
  const task: SyncTaskPayload = {
    id: matchingId(record.id, entityId, "task id"),
    title: nonEmptyString(record.title, "task title"),
    notes: nullableString(record.notes, "task notes"),
    completed: boolean(record.completed, "task completed"),
    priority: enumValue(
      record.priority,
      ["low", "medium", "high"],
      "task priority",
    ),
    projectId: nullableString(record.projectId, "task projectId"),
    dueDate: nullableString(record.dueDate, "task dueDate"),
    dueTime: nullableString(record.dueTime, "task dueTime"),
    dueTimezone: nullableString(record.dueTimezone, "task dueTimezone"),
    dueSemantics: enumValue(
      record.dueSemantics,
      ["fixed", "floating"],
      "task dueSemantics",
    ),
    source: enumValue(
      record.source,
      [
        "manual",
        "voice",
        "agent",
        "recurrence",
        "notification_candidate",
        "widget",
        "shortcut",
        "android_share",
        "android_quick_settings",
        "android_shortcut",
        "ios_share_extension",
        "ios_app_intent",
        "ios_app_shortcut",
        "deep_link",
        "import",
      ],
      "task source",
    ),
    creationOrigin: enumValue(
      record.creationOrigin,
      [
        "manual",
        "voice",
        "agent",
        "recurrence",
        "notification_candidate",
        "widget",
        "shortcut",
        "android_share",
        "android_quick_settings",
        "android_shortcut",
        "ios_share_extension",
        "ios_app_intent",
        "ios_app_shortcut",
        "deep_link",
        "import",
      ],
      "task creationOrigin",
    ),
    createdAt: isoString(record.createdAt, "task createdAt"),
    updatedAt: isoString(record.updatedAt, "task updatedAt"),
    completedAt: nullableString(record.completedAt, "task completedAt"),
  };
  return task;
}

export function toSyncReminderPayload(
  reminder: Reminder,
): SyncReminderPayload | null {
  if ((reminder.kind ?? "primary") !== "primary") return null;
  return {
    id: reminder.id,
    taskId: reminder.taskId,
    scheduledDate: reminder.scheduledDate,
    scheduledTime: reminder.scheduledTime,
    timezone: reminder.timezone,
    semantics: reminder.semantics,
    enabled: reminder.enabled,
    timingPrecision: reminder.timingPrecision,
    kind: "primary",
    reason: reminder.reason ?? null,
    generationSource: reminder.generationSource ?? null,
    policyVersion: reminder.policyVersion ?? null,
    idempotencyKey: reminder.idempotencyKey ?? null,
    createdAt: reminder.createdAt,
    updatedAt: reminder.updatedAt,
  };
}

export function fromSyncReminderPayload(
  value: unknown,
  entityId: string,
): SyncReminderPayload {
  const record = object(value, "reminder");
  const kind = enumValue(record.kind, ["primary"], "reminder kind");
  if (kind !== "primary")
    throw new SyncPayloadError("Only primary reminders are syncable.");
  return {
    id: matchingId(record.id, entityId, "reminder id"),
    taskId: nonEmptyString(record.taskId, "reminder taskId"),
    scheduledDate: nullableString(
      record.scheduledDate,
      "reminder scheduledDate",
    ),
    scheduledTime: nullableString(
      record.scheduledTime,
      "reminder scheduledTime",
    ),
    timezone: nullableString(record.timezone, "reminder timezone"),
    semantics: enumValue(
      record.semantics,
      ["fixed", "floating"],
      "reminder semantics",
    ),
    enabled: boolean(record.enabled, "reminder enabled"),
    timingPrecision: enumValue(
      record.timingPrecision,
      ["exact", "normal", "flexible"],
      "reminder timingPrecision",
    ),
    kind: "primary",
    reason: nullableString(record.reason, "reminder reason"),
    generationSource: nullableString(
      record.generationSource,
      "reminder generationSource",
    ),
    policyVersion: nullableString(
      record.policyVersion,
      "reminder policyVersion",
    ),
    idempotencyKey: nullableString(
      record.idempotencyKey,
      "reminder idempotencyKey",
    ),
    createdAt: isoString(record.createdAt, "reminder createdAt"),
    updatedAt: isoString(record.updatedAt, "reminder updatedAt"),
  };
}

export function toSyncRecurrencePayload(
  rule: RecurrenceRule,
): SyncRecurrencePayload {
  return {
    id: rule.id,
    taskId: rule.taskId,
    lastCompletedTaskId: rule.lastCompletedTaskId ?? null,
    frequency: rule.frequency,
    interval: rule.interval,
    weekdays: rule.weekdays ? [...rule.weekdays] : null,
    monthDays: rule.monthDays ? [...rule.monthDays] : null,
    startDate: rule.startDate,
    endDate: rule.endDate,
    maxOccurrences: rule.maxOccurrences,
    occurrenceCount: rule.occurrenceCount,
    mode: rule.mode,
    timezone: rule.timezone,
    active: rule.active,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

export function fromSyncRecurrencePayload(
  value: unknown,
  entityId: string,
): SyncRecurrencePayload {
  const recurrenceId = recurrenceRuleIdFromSyncEntityId(entityId);
  if (!recurrenceId)
    throw new SyncPayloadError("Invalid recurrence entity id.");
  const record = object(value, "recurrence");
  return {
    id: matchingId(record.id, recurrenceId, "recurrence id"),
    taskId: nonEmptyString(record.taskId, "recurrence taskId"),
    lastCompletedTaskId: nullableString(
      record.lastCompletedTaskId,
      "recurrence lastCompletedTaskId",
    ),
    frequency: enumValue(
      record.frequency,
      ["daily", "weekly", "monthly", "yearly"],
      "recurrence frequency",
    ),
    interval: positiveInteger(record.interval, "recurrence interval"),
    weekdays: nullableIntegerArray(record.weekdays, "recurrence weekdays"),
    monthDays: nullableIntegerArray(record.monthDays, "recurrence monthDays"),
    startDate: nonEmptyString(record.startDate, "recurrence startDate"),
    endDate: nullableString(record.endDate, "recurrence endDate"),
    maxOccurrences: nullablePositiveInteger(
      record.maxOccurrences,
      "recurrence maxOccurrences",
    ),
    occurrenceCount: positiveInteger(
      record.occurrenceCount,
      "recurrence occurrenceCount",
    ),
    mode: enumValue(
      record.mode,
      ["fixed", "after_completion"],
      "recurrence mode",
    ),
    timezone: nullableString(record.timezone, "recurrence timezone"),
    active: boolean(record.active, "recurrence active"),
    createdAt: isoString(record.createdAt, "recurrence createdAt"),
    updatedAt: isoString(record.updatedAt, "recurrence updatedAt"),
  };
}

export function toSyncCapturePayload(input: {
  captureId: string;
  taskId: string;
  ingress: string;
  committedAt: string;
  sources: readonly TaskCaptureSource[];
}): SyncCapturePayload {
  return {
    captureId: input.captureId,
    taskId: input.taskId,
    ingress: input.ingress,
    committedAt: input.committedAt,
    sources: input.sources.map((source) =>
      source.kind === "url"
        ? {
            id: source.id,
            kind: "url",
            url: source.url,
            createdAt: source.createdAt,
          }
        : {
            id: source.id,
            kind: "image",
            hasAsset: Boolean(source.assetRef),
            mimeType: source.mimeType,
            sizeBytes: source.sizeBytes ?? null,
            displayName: source.displayName ?? null,
            createdAt: source.createdAt,
          },
    ),
  };
}

export function fromSyncCapturePayload(
  value: unknown,
  entityId: string,
): SyncCapturePayload {
  const record = object(value, "capture");
  const captureId = matchingId(record.captureId, entityId, "capture id");
  const sourcesValue = array(record.sources, "capture sources");
  return {
    captureId,
    taskId: nonEmptyString(record.taskId, "capture taskId"),
    ingress: nonEmptyString(record.ingress, "capture ingress"),
    committedAt: isoString(record.committedAt, "capture committedAt"),
    sources: sourcesValue.map((source, index) => {
      const sourceRecord = object(source, `capture source ${index}`);
      const id = nonEmptyString(sourceRecord.id, `capture source ${index} id`);
      const createdAt = isoString(
        sourceRecord.createdAt,
        `capture source ${index} createdAt`,
      );
      if (sourceRecord.kind === "url") {
        return {
          id,
          kind: "url" as const,
          url: nonEmptyString(sourceRecord.url, `capture source ${index} url`),
          createdAt,
        };
      }
      if (sourceRecord.kind === "image") {
        const sizeBytes =
          sourceRecord.sizeBytes === null
            ? null
            : integer(
                sourceRecord.sizeBytes,
                `capture source ${index} sizeBytes`,
              );
        return {
          id,
          kind: "image" as const,
          hasAsset: boolean(
            sourceRecord.hasAsset,
            `capture source ${index} hasAsset`,
          ),
          mimeType: nonEmptyString(
            sourceRecord.mimeType,
            `capture source ${index} mimeType`,
          ),
          sizeBytes,
          displayName: nullableString(
            sourceRecord.displayName,
            `capture source ${index} displayName`,
          ),
          createdAt,
        };
      }
      throw new SyncPayloadError(`Unsupported capture source ${index}.`);
    }),
  };
}

export function toSyncPreferencesPayload(
  settings: PersistedSettings,
): PersistedSettings {
  return {
    theme: settings.theme,
    materialColorsEnabled: settings.materialColorsEnabled ?? false,
    hapticsEnabled: settings.hapticsEnabled,
    autoSummarize: settings.autoSummarize,
    adaptiveNudgesEnabled: settings.adaptiveNudgesEnabled ?? false,
  };
}

export function fromSyncPreferencesPayload(value: unknown): PersistedSettings {
  const record = object(value, "preferences");
  return {
    theme: enumValue(
      record.theme,
      ["system", "dark", "light"],
      "preference theme",
    ),
    materialColorsEnabled: boolean(
      record.materialColorsEnabled,
      "preference materialColorsEnabled",
    ),
    hapticsEnabled: boolean(record.hapticsEnabled, "preference hapticsEnabled"),
    autoSummarize: boolean(record.autoSummarize, "preference autoSummarize"),
    adaptiveNudgesEnabled: boolean(
      record.adaptiveNudgesEnabled,
      "preference adaptiveNudgesEnabled",
    ),
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SyncPayloadError(`Invalid ${label} payload.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new SyncPayloadError(`Invalid ${label}.`);
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string")
    throw new SyncPayloadError(`Invalid ${label}.`);
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  const result = stringValue(value, label).trim();
  if (!result) throw new SyncPayloadError(`Invalid ${label}.`);
  return result;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return stringValue(value, label);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean")
    throw new SyncPayloadError(`Invalid ${label}.`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new SyncPayloadError(`Invalid ${label}.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const result = integer(value, label);
  if (result < 1) throw new SyncPayloadError(`Invalid ${label}.`);
  return result;
}

function nullablePositiveInteger(value: unknown, label: string): number | null {
  if (value === null) return null;
  return positiveInteger(value, label);
}

function nullableIntegerArray(value: unknown, label: string): number[] | null {
  if (value === null) return null;
  return array(value, label).map((item, index) =>
    integer(item, `${label} ${index}`),
  );
}

function isoString(value: unknown, label: string): string {
  const result = nonEmptyString(value, label);
  if (Number.isNaN(Date.parse(result)))
    throw new SyncPayloadError(`Invalid ${label}.`);
  return result;
}

function matchingId(value: unknown, expected: string, label: string): string {
  const result = nonEmptyString(value, label);
  if (result !== expected) throw new SyncPayloadError(`Mismatched ${label}.`);
  return result;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new SyncPayloadError(`Invalid ${label}.`);
  }
  return value as T;
}
