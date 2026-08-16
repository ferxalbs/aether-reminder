export type AetherCloudErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "INVALID_CAPABILITY"
  | "INVALID_TOOLSET"
  | "VOICE_NOT_ENTITLED"
  | "VOICE_QUOTA_EXCEEDED"
  | "VOICE_CONCURRENCY_LIMIT"
  | "VOICE_IN_PROGRESS"
  | "INFERENCE_NOT_ENTITLED"
  | "INFERENCE_BUDGET_EXCEEDED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAUTHORIZED"
  | "IDEMPOTENCY_CONFLICT"
  | "NOT_READY"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "CANCELLED"
  | "INTERNAL";

export class AetherCloudError extends Error {
  readonly code: AetherCloudErrorCode;
  readonly status?: number;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    code: AetherCloudErrorCode,
    message: string,
    options?: {
      status?: number;
      requestId?: string;
      retryAfterSeconds?: number;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "AetherCloudError";
    this.code = code;
    this.status = options?.status;
    this.requestId = options?.requestId;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

const KNOWN_CODES = new Set<AetherCloudErrorCode>([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INVALID_REQUEST",
  "INVALID_CAPABILITY",
  "INVALID_TOOLSET",
  "VOICE_NOT_ENTITLED",
  "VOICE_QUOTA_EXCEEDED",
  "VOICE_CONCURRENCY_LIMIT",
  "VOICE_IN_PROGRESS",
  "INFERENCE_NOT_ENTITLED",
  "INFERENCE_BUDGET_EXCEEDED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UNAUTHORIZED",
  "IDEMPOTENCY_CONFLICT",
  "NOT_READY",
  "INTERNAL",
]);

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

export function decodeCloudErrorEnvelope(
  body: unknown,
  status: number,
  requestId?: string,
): AetherCloudError {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const error =
    record?.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : null;
  const code =
    typeof error?.code === "string" &&
    KNOWN_CODES.has(error.code as AetherCloudErrorCode)
      ? (error.code as AetherCloudErrorCode)
      : statusToCode(status);
  const message =
    typeof error?.message === "string" && error.message.trim()
      ? error.message
      : defaultMessage(code);
  const envelopeRequestId =
    typeof error?.requestId === "string" ? error.requestId : requestId;
  return new AetherCloudError(code, message, {
    status,
    requestId: envelopeRequestId,
  });
}

function statusToCode(status: number): AetherCloudErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  if (status === 504) return "PROVIDER_TIMEOUT";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  if (status >= 400) return "INVALID_REQUEST";
  return "INTERNAL";
}

function defaultMessage(code: AetherCloudErrorCode): string {
  switch (code) {
    case "UNAUTHORIZED":
      return "Authentication is required.";
    case "VOICE_NOT_ENTITLED":
    case "INFERENCE_NOT_ENTITLED":
      return "This hosted capability is unavailable for the current plan.";
    case "VOICE_QUOTA_EXCEEDED":
    case "INFERENCE_BUDGET_EXCEEDED":
      return "Hosted usage is exhausted for this period.";
    case "PROVIDER_UNAVAILABLE":
      return "AETHER Cloud is temporarily unavailable.";
    case "NETWORK_ERROR":
      return "Could not reach AETHER Cloud.";
    case "TIMEOUT":
      return "AETHER Cloud did not respond in time.";
    default:
      return "AETHER Cloud request failed.";
  }
}
