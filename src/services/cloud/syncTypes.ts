import { AetherCloudError } from "./errors";

export const AETHER_SYNC_PROTOCOL_VERSION = 1 as const;
export type AetherSyncProtocolVersion = typeof AETHER_SYNC_PROTOCOL_VERSION;

export const AETHER_SYNC_COLLECTIONS = [
  "tasks",
  "reminders",
  "captures",
  "preferences",
] as const;
export type AetherSyncCollection = (typeof AETHER_SYNC_COLLECTIONS)[number];

export type AetherSyncOperation = "upsert" | "delete";

export type AetherSyncMutation = {
  mutationId: string;
  collection: AetherSyncCollection;
  entityId: string;
  operation: AetherSyncOperation;
  baseVersion: number | null;
  payload: unknown;
  clientModifiedAt: string;
};

export type AetherSyncMutationResult =
  | { status: "applied"; version: number }
  | { status: "already_applied"; version: number }
  | { status: "conflict"; currentVersion: number };

export type AetherSyncChange =
  | {
      collection: AetherSyncCollection;
      entityId: string;
      operation: "upsert";
      version: number;
      payload: unknown;
      tombstone: false;
    }
  | {
      collection: AetherSyncCollection;
      entityId: string;
      operation: "delete";
      version: number;
      payload: null;
      tombstone: true;
    };

export type AetherSyncNegotiation = {
  protocolVersion: AetherSyncProtocolVersion;
  protocolCapabilities: ("push" | "pull" | "tombstones" | "conflicts")[];
  collections: AetherSyncCollection[];
  service: { available: boolean };
};

export type AetherSyncPushResponse = {
  results: AetherSyncMutationResult[];
};

export type AetherSyncPullResponse = {
  changes: AetherSyncChange[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function decodeSyncNegotiation(value: unknown): AetherSyncNegotiation {
  const record = asRecord(value, "negotiation");
  if (record.protocolVersion !== AETHER_SYNC_PROTOCOL_VERSION) {
    throw invalidResponse("Sync negotiation returned an unsupported version.");
  }
  const capabilities = asArray(record.protocolCapabilities, "capabilities");
  const collections = asArray(record.collections, "collections");
  const validCapabilities = capabilities.filter(isCapability);
  const validCollections = collections.filter(isCollection);
  if (
    validCapabilities.length !== capabilities.length ||
    validCollections.length !== collections.length ||
    !hasCapabilities(validCapabilities) ||
    !hasCollections(validCollections)
  ) {
    throw invalidResponse("Sync negotiation returned invalid capabilities.");
  }
  const service = asRecord(record.service, "service");
  if (typeof service.available !== "boolean") {
    throw invalidResponse("Sync negotiation returned invalid availability.");
  }
  return {
    protocolVersion: AETHER_SYNC_PROTOCOL_VERSION,
    protocolCapabilities: validCapabilities,
    collections: validCollections,
    service: { available: service.available },
  };
}

export function decodeSyncPushResponse(value: unknown): AetherSyncPushResponse {
  const record = asRecord(value, "push response");
  const rawResults = asArray(record.results, "push results");
  return { results: rawResults.map(decodeMutationResult) };
}

export function decodeSyncPullResponse(value: unknown): AetherSyncPullResponse {
  const record = asRecord(value, "pull response");
  const changes = asArray(record.changes, "pull changes").map(decodeSyncChange);
  const nextCursor = record.nextCursor;
  if (nextCursor !== null && typeof nextCursor !== "string") {
    throw invalidResponse("Sync pull returned an invalid cursor.");
  }
  if (typeof record.hasMore !== "boolean") {
    throw invalidResponse("Sync pull returned an invalid pagination flag.");
  }
  if (record.hasMore && nextCursor === null) {
    throw invalidResponse("Sync pull reported more data without a cursor.");
  }
  return { changes, nextCursor, hasMore: record.hasMore };
}

function decodeMutationResult(value: unknown): AetherSyncMutationResult {
  const record = asRecord(value, "mutation result");
  if (record.status === "conflict") {
    if (!isVersion(record.currentVersion)) {
      throw invalidResponse("Sync conflict returned an invalid version.");
    }
    return { status: "conflict", currentVersion: record.currentVersion };
  }
  if (
    (record.status === "applied" || record.status === "already_applied") &&
    isVersion(record.version)
  ) {
    return { status: record.status, version: record.version };
  }
  throw invalidResponse("Sync push returned an invalid mutation result.");
}

function decodeSyncChange(value: unknown): AetherSyncChange {
  const record = asRecord(value, "sync change");
  if (
    !isCollection(record.collection) ||
    typeof record.entityId !== "string" ||
    !record.entityId.trim() ||
    !isVersion(record.version)
  ) {
    throw invalidResponse("Sync pull returned an invalid entity change.");
  }
  if (
    record.operation === "upsert" &&
    record.tombstone === false &&
    Object.hasOwn(record, "payload")
  ) {
    return {
      collection: record.collection,
      entityId: record.entityId,
      operation: "upsert",
      version: record.version,
      payload: record.payload,
      tombstone: false,
    };
  }
  if (
    record.operation === "delete" &&
    record.tombstone === true &&
    record.payload === null
  ) {
    return {
      collection: record.collection,
      entityId: record.entityId,
      operation: "delete",
      version: record.version,
      payload: null,
      tombstone: true,
    };
  }
  throw invalidResponse("Sync pull returned an invalid tombstone shape.");
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidResponse(`Sync ${label} was not an object.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value))
    throw invalidResponse(`Sync ${label} was not an array.`);
  return value;
}

function isVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCollection(value: unknown): value is AetherSyncCollection {
  return (
    value === "tasks" ||
    value === "reminders" ||
    value === "captures" ||
    value === "preferences"
  );
}

function isCapability(
  value: unknown,
): value is "push" | "pull" | "tombstones" | "conflicts" {
  return (
    value === "push" ||
    value === "pull" ||
    value === "tombstones" ||
    value === "conflicts"
  );
}

function hasCapabilities(
  values: ("push" | "pull" | "tombstones" | "conflicts")[],
): boolean {
  return ["push", "pull", "tombstones", "conflicts"].every((value) =>
    values.includes(value as (typeof values)[number]),
  );
}

function hasCollections(values: AetherSyncCollection[]): boolean {
  return AETHER_SYNC_COLLECTIONS.every((value) => values.includes(value));
}

function invalidResponse(message: string): AetherCloudError {
  return new AetherCloudError("INVALID_RESPONSE", message);
}
