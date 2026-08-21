import { AetherCloudError } from "@/services/cloud/errors";
import {
  AETHER_SYNC_PROTOCOL_VERSION,
  type AetherSyncMutation,
  type AetherSyncNegotiation,
} from "@/services/cloud/syncTypes";
import type { AetherCloudRequestOptions } from "@/services/cloud/client";
import {
  SYNC_PULL_LIMIT,
  SYNC_REQUEST_LIMIT_BYTES,
  SyncOutboxRepository,
  type SyncOutboxRow,
  type SyncScope,
} from "@/db/repositories/syncOutboxRepository";
import type { SqlDatabase } from "@/db/types";
import { DEFAULT_SYNC_PREFERENCES, SyncReconciler } from "./reconciler";
import type { PersistedSettings } from "@/stores/settingsPersistence";

const MAX_PUSH_PASSES = 4;
const MAX_PULL_PAGES = 4;

export interface SyncTransport {
  negotiateSync(
    options?: AetherCloudRequestOptions,
  ): Promise<AetherSyncNegotiation>;
  pushSync(
    mutations: readonly AetherSyncMutation[],
    options?: AetherCloudRequestOptions,
  ): Promise<{
    results: import("@/services/cloud/syncTypes").AetherSyncMutationResult[];
  }>;
  pullSync(
    cursor: string | null,
    limit?: number,
    options?: AetherCloudRequestOptions,
  ): Promise<import("@/services/cloud/syncTypes").AetherSyncPullResponse>;
}

export type SyncFailureCategory =
  | "negotiate"
  | "push"
  | "pull"
  | "reconciliation"
  | "unauthorized"
  | "service_unavailable";

export type SyncDiagnostics = {
  phase: "idle" | "syncing" | "offline" | "delayed" | "blocked";
  outboxDepth: number;
  conflictCount: number;
  lastFailureCategory: SyncFailureCategory | null;
  lastFailureCode: string | null;
  lastRunAt: string | null;
};

export type SyncRunResult = SyncDiagnostics & {
  pushedMutations: number;
  pulledChanges: number;
  appliedChanges: number;
};

export class SyncEngine {
  private readonly sync: SyncOutboxRepository;
  private readonly reconciler: SyncReconciler;
  private inFlight: Promise<SyncRunResult> | null = null;
  private activeController: AbortController | null = null;
  private activeScopeKey: string | null = null;
  private blockedScopeKey: string | null = null;
  private negotiation: AetherSyncNegotiation | null = null;
  private diagnostics: SyncDiagnostics = {
    phase: "idle",
    outboxDepth: 0,
    conflictCount: 0,
    lastFailureCategory: null,
    lastFailureCode: null,
    lastRunAt: null,
  };

  constructor(
    db: SqlDatabase,
    private readonly transport: SyncTransport,
    private readonly onPreferencesChanged?: (
      settings: PersistedSettings,
    ) => void,
  ) {
    this.sync = new SyncOutboxRepository(db);
    this.reconciler = new SyncReconciler(db, this.sync);
  }

  activate(scope: SyncScope): void {
    const key = `${scope.accountId}:${scope.deviceId}`;
    if (this.activeScopeKey === key) return;
    this.activeController?.abort();
    this.activeController = null;
    this.activeScopeKey = key;
    this.blockedScopeKey = null;
    this.negotiation = null;
    this.diagnostics = {
      ...this.diagnostics,
      phase: "idle",
      lastFailureCategory: null,
      lastFailureCode: null,
    };
  }

  deactivate(): void {
    this.activeController?.abort();
    this.activeController = null;
    this.activeScopeKey = null;
    this.negotiation = null;
    this.diagnostics = { ...this.diagnostics, phase: "idle" };
  }

  getDiagnostics(): SyncDiagnostics {
    return { ...this.diagnostics };
  }

  runOnce(): Promise<SyncRunResult> {
    if (this.inFlight) return this.inFlight;
    const operation = this.runBounded();
    this.inFlight = operation;
    void operation.then(
      () => {
        if (this.inFlight === operation) this.inFlight = null;
      },
      () => {
        if (this.inFlight === operation) this.inFlight = null;
      },
    );
    return operation;
  }

  private async runBounded(): Promise<SyncRunResult> {
    const scope = await this.sync.getActiveScope();
    if (!scope) {
      return this.finish({
        pushedMutations: 0,
        pulledChanges: 0,
        appliedChanges: 0,
      });
    }
    this.activate(scope);
    if (this.blockedScopeKey === this.scopeKey(scope)) {
      return this.finish({
        pushedMutations: 0,
        pulledChanges: 0,
        appliedChanges: 0,
      });
    }

    const controller = new AbortController();
    this.activeController = controller;
    this.diagnostics = { ...this.diagnostics, phase: "syncing" };
    let pushedMutations = 0;
    let pulledChanges = 0;
    let appliedChanges = 0;
    try {
      await this.ensureNegotiated(controller.signal);
      if (!this.negotiation?.service.available) {
        this.negotiation = null;
        this.recordFailure("service_unavailable", "SYNC_SERVICE_UNAVAILABLE");
        return this.finish(
          { pushedMutations, pulledChanges, appliedChanges },
          "offline",
        );
      }

      for (let pass = 0; pass < MAX_PUSH_PASSES; pass += 1) {
        const pushed = await this.pushOneBatch(scope, controller.signal);
        pushedMutations += pushed.count;
        if (!pushed.more) break;
      }

      for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
        const pulled = await this.pullOnePage(scope, controller.signal);
        pulledChanges += pulled.changeCount;
        appliedChanges += pulled.appliedChanges;
        if (!pulled.hasMore) break;
      }

      const depth = await this.sync.getOutboxDepth(scope);
      const conflicts = await this.sync.getConflictCount(scope);
      this.diagnostics = {
        ...this.diagnostics,
        phase: depth > 0 ? "delayed" : "idle",
        outboxDepth: depth,
        conflictCount: conflicts,
      };
      return this.finish({ pushedMutations, pulledChanges, appliedChanges });
    } catch (error) {
      if (
        controller.signal.aborted &&
        this.activeScopeKey !== this.scopeKey(scope)
      ) {
        return this.finish({ pushedMutations, pulledChanges, appliedChanges });
      }
      const category = this.failureCategory(error);
      const code = error instanceof AetherCloudError ? error.code : "UNKNOWN";
      this.recordFailure(category, code);
      if (this.isBlocked(error)) {
        this.blockedScopeKey = this.scopeKey(scope);
        this.diagnostics = { ...this.diagnostics, phase: "blocked" };
      } else if (this.isRetryable(error)) {
        this.diagnostics = { ...this.diagnostics, phase: "offline" };
      } else {
        this.diagnostics = { ...this.diagnostics, phase: "delayed" };
      }
      const depth = await this.sync.getOutboxDepth(scope).catch(() => 0);
      const conflicts = await this.sync.getConflictCount(scope).catch(() => 0);
      this.diagnostics = {
        ...this.diagnostics,
        outboxDepth: depth,
        conflictCount: conflicts,
      };
      return this.finish(
        { pushedMutations, pulledChanges, appliedChanges },
        this.diagnostics.phase,
      );
    } finally {
      if (this.activeController === controller) this.activeController = null;
    }
  }

  private async ensureNegotiated(signal: AbortSignal): Promise<void> {
    if (this.negotiation) return;
    try {
      this.negotiation = await this.transport.negotiateSync({ signal });
    } catch (error) {
      this.recordFailure("negotiate", this.errorCode(error));
      throw error;
    }
  }

  private async pushOneBatch(
    scope: SyncScope,
    signal: AbortSignal,
  ): Promise<{ count: number; more: boolean }> {
    const pending = await this.sync.listPending(scope);
    if (pending.length === 0) return { count: 0, more: false };
    const rows = selectRequestBatch(pending);
    const mutations = rows.map(toTransportMutation);
    await this.sync.markAttempt(rows.map((row) => row.mutationId));
    try {
      const response = await this.transport.pushSync(mutations, { signal });
      await this.sync.acknowledge(rows, response.results);
      return {
        count: response.results.filter((result) => result.status !== "conflict")
          .length,
        more: pending.length > rows.length,
      };
    } catch (error) {
      await this.sync.recordFailure(
        rows.map((row) => row.mutationId),
        this.errorCode(error),
      );
      this.recordFailure("push", this.errorCode(error));
      throw error;
    }
  }

  private async pullOnePage(
    scope: SyncScope,
    signal: AbortSignal,
  ): Promise<{
    changeCount: number;
    appliedChanges: number;
    hasMore: boolean;
  }> {
    const cursor = await this.sync.getCursor(scope);
    let response;
    try {
      response = await this.transport.pullSync(cursor, SYNC_PULL_LIMIT, {
        signal,
      });
    } catch (error) {
      if (
        cursor &&
        error instanceof AetherCloudError &&
        error.code === "SYNC_CURSOR_INVALID"
      ) {
        // A cursor is an optimization, not local authority. Discard only the
        // scoped cursor and retry once from the account's beginning; page
        // application remains transactional and idempotent.
        await this.sync.clearCursor(scope);
        try {
          response = await this.transport.pullSync(null, SYNC_PULL_LIMIT, {
            signal,
          });
        } catch (retryError) {
          this.recordFailure("pull", this.errorCode(retryError));
          throw retryError;
        }
      } else {
        this.recordFailure("pull", this.errorCode(error));
        throw error;
      }
    }
    let reconciled;
    try {
      reconciled = await this.reconciler.applyPage(
        scope,
        response.changes,
        response.nextCursor,
      );
    } catch (error) {
      this.recordFailure("reconciliation", this.errorCode(error));
      throw error;
    }
    if (reconciled.preference) {
      this.onPreferencesChanged?.(reconciled.preference);
    } else if (reconciled.preferencesDeleted) {
      this.onPreferencesChanged?.(DEFAULT_SYNC_PREFERENCES);
    }
    this.diagnostics = {
      ...this.diagnostics,
      conflictCount: this.diagnostics.conflictCount + reconciled.conflictCount,
    };
    return {
      changeCount: response.changes.length,
      appliedChanges: reconciled.appliedChanges,
      hasMore: response.hasMore,
    };
  }

  private finish(
    counts: Pick<
      SyncRunResult,
      "pushedMutations" | "pulledChanges" | "appliedChanges"
    >,
    phase = this.diagnostics.phase,
  ): SyncRunResult {
    const result = {
      ...this.diagnostics,
      ...counts,
      phase,
      lastRunAt: new Date().toISOString(),
    };
    this.diagnostics = result;
    return result;
  }

  private recordFailure(category: SyncFailureCategory, code: string): void {
    this.diagnostics = {
      ...this.diagnostics,
      lastFailureCategory: category,
      lastFailureCode: code,
    };
  }

  private failureCategory(error: unknown): SyncFailureCategory {
    if (error instanceof AetherCloudError) {
      if (this.isBlocked(error)) return "unauthorized";
      if (
        error.code === "SYNC_NOT_PROVISIONED" ||
        error.code === "SYNC_PROVIDER_UNAVAILABLE"
      ) {
        return "service_unavailable";
      }
    }
    return this.diagnostics.lastFailureCategory ?? "pull";
  }

  private errorCode(error: unknown): string {
    return error instanceof AetherCloudError
      ? error.code
      : error instanceof Error
        ? "LOCAL_ERROR"
        : "UNKNOWN";
  }

  private isRetryable(error: unknown): boolean {
    if (!(error instanceof AetherCloudError)) return false;
    return (
      error.code === "NETWORK_ERROR" ||
      error.code === "TIMEOUT" ||
      error.code === "PROVIDER_UNAVAILABLE" ||
      error.code === "PROVIDER_TIMEOUT" ||
      error.code === "PROVIDER_RATE_LIMITED" ||
      error.code === "NOT_READY" ||
      error.code === "SYNC_NOT_PROVISIONED" ||
      error.code === "SYNC_PROVIDER_UNAVAILABLE"
    );
  }

  private isBlocked(error: unknown): boolean {
    return (
      error instanceof AetherCloudError &&
      [
        "UNAUTHORIZED",
        "FORBIDDEN",
        "DEVICE_REVOKED",
        "DEVICE_NOT_FOUND",
        "SYNC_NOT_ENTITLED",
        "UNSUPPORTED_SYNC_PROTOCOL",
      ].includes(error.code)
    );
  }

  private scopeKey(scope: SyncScope): string {
    return `${scope.accountId}:${scope.deviceId}`;
  }
}

function toTransportMutation(row: SyncOutboxRow): AetherSyncMutation {
  return {
    mutationId: row.mutationId,
    collection: row.collection,
    entityId: row.entityId,
    operation: row.operation,
    baseVersion: row.baseVersion,
    payload: row.payload,
    clientModifiedAt: row.clientModifiedAt,
  };
}

function selectRequestBatch(rows: readonly SyncOutboxRow[]): SyncOutboxRow[] {
  const selected: SyncOutboxRow[] = [];
  for (const row of rows) {
    if (selected.length >= 100) break;
    const candidate = [...selected, row].map(toTransportMutation);
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        protocolVersion: AETHER_SYNC_PROTOCOL_VERSION,
        mutations: candidate,
      }),
    ).byteLength;
    if (bytes > SYNC_REQUEST_LIMIT_BYTES) break;
    selected.push(row);
  }
  if (selected.length === 0) {
    throw new Error("Sync mutation batch exceeds the v1 request limit.");
  }
  return selected;
}
