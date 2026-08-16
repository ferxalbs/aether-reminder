import { CaptureError, type CaptureFailureCategory } from "./types";
import type { CaptureInboxRepository } from "./inbox";
import type { CaptureOrchestrator } from "./orchestrator";

export interface CaptureDrainResult {
  processed: number;
  committed: number;
  failedRetryable: number;
  failedTerminal: number;
}

function classify(error: unknown): {
  category: CaptureFailureCategory;
  retryable: boolean;
} {
  if (error instanceof CaptureError)
    return { category: error.category, retryable: error.retryable };
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("busy") ||
    message.includes("locked") ||
    message.includes("temporar")
  ) {
    return { category: "database_busy", retryable: true };
  }
  return { category: "unknown", retryable: true };
}

export class CaptureInboxDrainer {
  constructor(
    private readonly inbox: CaptureInboxRepository,
    private readonly orchestrator: CaptureOrchestrator,
    private readonly options: {
      batchSize?: number;
      staleAfterMs?: number;
      onTerminalFailure?: (captureId: string) => Promise<void>;
    } = {},
  ) {}

  async drain(now = new Date()): Promise<CaptureDrainResult> {
    const result: CaptureDrainResult = {
      processed: 0,
      committed: 0,
      failedRetryable: 0,
      failedTerminal: 0,
    };
    const ids = await this.inbox.listDrainable(
      Math.max(1, Math.min(this.options.batchSize ?? 8, 32)),
      now,
      this.options.staleAfterMs,
    );
    for (const id of ids) {
      const claimed = await this.inbox.claim(
        id,
        now,
        this.options.staleAfterMs,
      );
      if (!claimed) continue;
      result.processed += 1;
      try {
        const committed = await this.orchestrator.commit(claimed.envelope);
        await this.inbox.markCommitted(
          id,
          claimed.claimToken,
          committed.task.id,
          now,
        );
        result.committed += 1;
      } catch (error) {
        const failure = classify(error);
        await this.inbox.markFailure(
          id,
          claimed.claimToken,
          failure.category,
          failure.retryable,
          now,
        );
        await this.inbox.recordEvent("capture_failed", claimed.envelope, {
          category: failure.category,
        });
        if (failure.retryable) result.failedRetryable += 1;
        else {
          try {
            await this.options.onTerminalFailure?.(id);
          } catch {
            // Asset cleanup is recoverable and must not block later inbox entries.
          }
          result.failedTerminal += 1;
        }
      }
    }
    return result;
  }
}
