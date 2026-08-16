import type { AetherCommandExecutor } from "@/core/commands";
import type { CaptureCommitsRepository } from "@/db/repositories/captureCommitsRepository";
import type { CaptureSource, Task, TaskSource } from "@/domain/entities";
import type { ActionReceipt } from "@/domain/receipts";
import { getLocalDateString } from "@/temporal/localCalendar";
import { parseLocalReminderInput } from "./localIntentParser";
import { normalizeCaptureEnvelope } from "./normalization";
import {
  CaptureError,
  type CaptureDraft,
  type CaptureEnvelope,
  type CaptureEventName,
} from "./types";

export interface CaptureAssetManager {
  adopt(
    source: Extract<CaptureSource, { kind: "image" }>,
    captureId: string,
  ): Promise<Extract<CaptureSource, { kind: "image" }>>;
  discardCapture(captureId: string): Promise<void>;
}

export interface CaptureEventSink {
  record(
    name: CaptureEventName,
    envelope: CaptureEnvelope,
    metadata?: Record<string, string>,
  ): Promise<void>;
}

export interface CaptureInvalidationSink {
  taskCommitted(
    task: Task,
    options: { attention: boolean; reliability: boolean },
  ): Promise<void>;
}

const noAssets: CaptureAssetManager = {
  async adopt(source) {
    return source;
  },
  async discardCapture() {},
};
const noEvents: CaptureEventSink = { async record() {} };
const noInvalidation: CaptureInvalidationSink = { async taskCommitted() {} };

function taskSourceForIngress(ingress: CaptureEnvelope["ingress"]): TaskSource {
  switch (ingress) {
    case "in_app":
      return "manual";
    case "voice":
      return "voice";
    default:
      return ingress;
  }
}

function hostTitle(url: string): string {
  try {
    return `Review ${new URL(url).hostname.replace(/^www\./, "")}`;
  } catch {
    return "Review shared link";
  }
}

export class CaptureOrchestrator {
  constructor(
    private readonly commands: AetherCommandExecutor,
    private readonly commits: CaptureCommitsRepository,
    private readonly assets: CaptureAssetManager = noAssets,
    private readonly events: CaptureEventSink = noEvents,
    private readonly invalidations: CaptureInvalidationSink = noInvalidation,
  ) {}

  prepare(rawEnvelope: CaptureEnvelope, now = new Date()): CaptureDraft {
    const envelope = normalizeCaptureEnvelope(rawEnvelope);
    const text = envelope.parts
      .filter(
        (part): part is Extract<typeof part, { kind: "text" }> =>
          part.kind === "text",
      )
      .map((part) => part.text)
      .join("\n");
    const sources: CaptureSource[] = [];
    for (const part of envelope.parts) {
      if (part.kind === "url") sources.push({ kind: "url", url: part.url });
      if (part.kind === "image") sources.push({ ...part });
    }

    if (text) {
      const parsed = parseLocalReminderInput(text, { now });
      return {
        title: parsed.title,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        dueTimezone: parsed.dueTimezone,
        dueSemantics: "floating",
        priority: parsed.priority,
        sources,
      };
    }
    const url = sources.find(
      (source): source is Extract<CaptureSource, { kind: "url" }> =>
        source.kind === "url",
    );
    if (url) {
      return {
        title: hostTitle(url.url),
        dueDate: getLocalDateString(now),
        dueTime: null,
        dueTimezone: null,
        dueSemantics: "floating",
        priority: "medium",
        sources,
      };
    }
    throw new CaptureError(
      "domain_validation",
      "Enter what AETHER should remember for this image.",
    );
  }

  async commit(
    rawEnvelope: CaptureEnvelope,
    draft: CaptureDraft = this.prepare(rawEnvelope),
  ): Promise<{ task: Task; duplicate: boolean; receipt?: ActionReceipt }> {
    const envelope = normalizeCaptureEnvelope(rawEnvelope);
    const existing = await this.commits.get(envelope.id);
    if (existing) {
      const result = await this.commands.getTask(existing.taskId);
      if (!result)
        throw new CaptureError(
          "domain_validation",
          "Committed capture task is unavailable.",
        );
      await this.invalidations.taskCommitted(result, {
        reliability: Boolean(result.dueDate && result.dueTime),
        attention: !result.completed,
      });
      return { task: result, duplicate: true };
    }
    const title = draft.title.trim();
    if (!title)
      throw new CaptureError(
        "domain_validation",
        "A reminder title is required.",
      );

    const sources: CaptureSource[] = [];
    for (const source of draft.sources) {
      sources.push(
        source.kind === "image"
          ? await this.assets.adopt(source, envelope.id)
          : source,
      );
    }
    const source = taskSourceForIngress(envelope.ingress);
    const result = await this.commands.createCapturedTask(
      {
        title,
        notes: draft.notes?.trim() || null,
        priority: draft.priority ?? "medium",
        dueDate: draft.dueDate ?? getLocalDateString(),
        dueTime: draft.dueTime ?? null,
        dueTimezone: draft.dueTimezone ?? null,
        dueSemantics: draft.dueSemantics ?? "floating",
        source,
        creationOrigin: source,
      },
      {
        captureId: envelope.id,
        ingress: envelope.ingress,
        sources,
      },
    );
    await this.events.record("capture_committed", envelope, {
      payloadKind: envelope.parts.map((part) => part.kind).join("+"),
    });
    await this.invalidations.taskCommitted(result.value, {
      reliability: Boolean(result.value.dueDate && result.value.dueTime),
      attention: !result.value.completed,
    });
    return { task: result.value, duplicate: false, receipt: result.receipt };
  }
}
