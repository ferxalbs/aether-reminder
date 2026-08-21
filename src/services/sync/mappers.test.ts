import { describe, expect, test } from "bun:test";
import {
  fromSyncCapturePayload,
  fromSyncPreferencesPayload,
  fromSyncRecurrencePayload,
  fromSyncReminderPayload,
  fromSyncTaskPayload,
  toSyncCapturePayload,
  toSyncPreferencesPayload,
  toSyncRecurrenceEntityId,
  toSyncRecurrencePayload,
  toSyncReminderPayload,
  toSyncTaskPayload,
} from "./mappers";

const task = {
  id: "task-1",
  title: "Remember",
  notes: "notes",
  completed: false,
  priority: "high" as const,
  projectId: null,
  dueDate: "2030-01-02",
  dueTime: "09:30",
  dueTimezone: "America/Lima",
  dueSemantics: "floating" as const,
  source: "manual" as const,
  creationOrigin: "manual" as const,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
  completedAt: null,
  deletedAt: null,
};

const reminder = {
  id: "reminder-1",
  taskId: "task-1",
  scheduledDate: "2030-01-02",
  scheduledTime: "09:30",
  timezone: "America/Lima",
  semantics: "floating" as const,
  enabled: true,
  nativeNotificationId: "local-only",
  projectionState: "scheduled" as const,
  projectionDirty: false,
  projectionRevision: 2,
  projectionAttemptCount: 1,
  projectionLastAttemptAt: null,
  projectionLastSuccessAt: "2030-01-01T00:00:00.000Z",
  projectionErrorCode: null,
  projectionError: null,
  timingPrecision: "normal" as const,
  kind: "primary" as const,
  reason: null,
  generationSource: "manual",
  policyVersion: "baseline-v1",
  idempotencyKey: null,
  cancelledAt: null,
  consumedAt: null,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};

describe("AETHER Sync v1 typed local adapters", () => {
  test("tasks preserve canonical user state and omit local deletion metadata", () => {
    const payload = toSyncTaskPayload(task);
    expect(payload).toEqual({
      id: "task-1",
      title: "Remember",
      notes: "notes",
      completed: false,
      priority: "high",
      projectId: null,
      dueDate: "2030-01-02",
      dueTime: "09:30",
      dueTimezone: "America/Lima",
      dueSemantics: "floating",
      source: "manual",
      creationOrigin: "manual",
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:00:00.000Z",
      completedAt: null,
    });
    expect(fromSyncTaskPayload(payload, "task-1")).toEqual(payload);
  });

  test("reminders exclude native notification projection state", () => {
    const payload = toSyncReminderPayload(reminder);
    expect(payload?.kind).toBe("primary");
    expect(payload).not.toHaveProperty("nativeNotificationId");
    expect(payload).not.toHaveProperty("projectionState");
    expect(fromSyncReminderPayload(payload, "reminder-1")).toEqual(payload);
  });

  test("adaptive reminders are local-derived and do not enter the reminders collection", () => {
    expect(
      toSyncReminderPayload({ ...reminder, kind: "adaptive_followup" }),
    ).toBeNull();
  });

  test("captures and preferences use explicit typed envelopes", () => {
    const capture = toSyncCapturePayload({
      captureId: "capture-1",
      taskId: "task-1",
      ingress: "share",
      committedAt: "2030-01-01T00:00:00.000Z",
      sources: [
        {
          id: "source-1",
          taskId: "task-1",
          createdAt: "2030-01-01T00:00:00.000Z",
          kind: "url",
          url: "https://example.com",
        },
        {
          id: "source-2",
          taskId: "task-1",
          createdAt: "2030-01-01T00:00:00.000Z",
          kind: "image",
          assetRef: "file:///private/task-source.png",
          mimeType: "image/png",
          sizeBytes: 42,
          displayName: "Screenshot",
        },
      ],
    });
    expect(capture.sources[1]).toEqual({
      id: "source-2",
      kind: "image",
      hasAsset: true,
      mimeType: "image/png",
      sizeBytes: 42,
      displayName: "Screenshot",
      createdAt: "2030-01-01T00:00:00.000Z",
    });
    expect(capture.sources[1]).not.toHaveProperty("assetRef");
    expect(fromSyncCapturePayload(capture, "capture-1")).toEqual(capture);

    const preferences = toSyncPreferencesPayload({
      theme: "dark",
      materialColorsEnabled: true,
      hapticsEnabled: true,
      autoSummarize: false,
      adaptiveNudgesEnabled: true,
    });
    expect(fromSyncPreferencesPayload(preferences)).toEqual(preferences);
  });

  test("recurrence rules stay in the reminders collection with stable entity IDs", () => {
    const rule = {
      id: "rule-1",
      taskId: "task-1",
      lastCompletedTaskId: "task-0",
      frequency: "weekly" as const,
      interval: 2,
      weekdays: [1, 3],
      monthDays: null,
      startDate: "2030-01-01",
      endDate: null,
      maxOccurrences: null,
      occurrenceCount: 2,
      mode: "after_completion" as const,
      timezone: "America/Lima",
      active: true,
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-02T00:00:00.000Z",
    };
    const entityId = toSyncRecurrenceEntityId(rule.id);
    const payload = toSyncRecurrencePayload(rule);
    expect(entityId).toBe("recurrence:rule-1");
    expect(fromSyncRecurrencePayload(payload, entityId)).toEqual(payload);
  });
});
