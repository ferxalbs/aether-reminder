import { createTimeoutSignal } from "@/lib/retry";
import { resolveAetherCloudConfig, type AetherCloudConfig } from "./config";
import {
  AetherCloudError,
  decodeCloudErrorEnvelope,
  isAbortError,
} from "./errors";
import type {
  AetherUsageSnapshot,
  CommercialSource,
  HealthResponse,
  InferenceTurnRequest,
  SubscriptionResponse,
  VoiceAuthorizationRequest,
  VoiceAuthorizationResponse,
} from "./types";

const JSON_TIMEOUT_MS = 10_000;
const STREAM_CONNECT_TIMEOUT_MS = 15_000;

export type AetherCloudRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  idempotencyKey?: string;
};

export class AetherCloudClient {
  constructor(
    private readonly config: AetherCloudConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  get userId(): string {
    return this.config.userId;
  }

  async getHealth(
    options: AetherCloudRequestOptions = {},
  ): Promise<HealthResponse> {
    return this.requestJson<HealthResponse>("GET", "/health", undefined, {
      ...options,
      authenticated: false,
    });
  }

  async getSubscription(
    options: AetherCloudRequestOptions = {},
  ): Promise<SubscriptionResponse> {
    return this.requestJson<SubscriptionResponse>(
      "GET",
      "/v1/me/subscription",
      undefined,
      options,
    );
  }

  async getUsage(
    options: AetherCloudRequestOptions = {},
  ): Promise<AetherUsageSnapshot> {
    const raw = await this.requestJson<unknown>(
      "GET",
      "/v1/me/usage",
      undefined,
      options,
    );
    return decodeUsageSnapshot(raw);
  }

  async createVoiceAuthorization(
    body: VoiceAuthorizationRequest = {},
    options: AetherCloudRequestOptions = {},
  ): Promise<VoiceAuthorizationResponse> {
    const payload = body.language ? { language: body.language } : {};
    return this.requestJson<VoiceAuthorizationResponse>(
      "POST",
      "/v1/voice/authorizations",
      payload,
      options,
    );
  }

  async streamAssistantTurn(
    body: InferenceTurnRequest,
    options: AetherCloudRequestOptions = {},
  ): Promise<Response> {
    return this.request("POST", "/v1/ai/turns", body, {
      ...options,
      timeoutMs: options.timeoutMs ?? STREAM_CONNECT_TIMEOUT_MS,
      accept: "text/event-stream",
    });
  }

  private async requestJson<T>(
    method: string,
    path: string,
    body: unknown,
    options: AetherCloudRequestOptions & { authenticated?: boolean } = {},
  ): Promise<T> {
    const response = await this.request(method, path, body, {
      ...options,
      timeoutMs: options.timeoutMs ?? JSON_TIMEOUT_MS,
      accept: "application/json",
    });
    return this.parseJson<T>(response);
  }

  private async request(
    method: string,
    path: string,
    body: unknown,
    options: AetherCloudRequestOptions & {
      authenticated?: boolean;
      accept?: string;
    } = {},
  ): Promise<Response> {
    const requestId = createRequestId();
    const timeout = createTimeoutSignal(
      options.signal ?? new AbortController().signal,
      options.timeoutMs ?? JSON_TIMEOUT_MS,
    );
    const headers: Record<string, string> = {
      Accept: options.accept ?? "application/json",
      "X-Request-Id": requestId,
    };
    if (options.authenticated !== false) {
      headers["X-Aether-User-Id"] = this.config.userId;
      headers["X-Aether-Device-Id"] = this.config.deviceId;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timeout.signal,
      });
    } catch (error) {
      timeout.cleanup();
      if (options.signal?.aborted) {
        throw new AetherCloudError(
          "CANCELLED",
          "The Cloud request was cancelled.",
          {
            requestId,
            cause: error,
          },
        );
      }
      if (timeout.didTimeout() || isAbortError(error)) {
        throw new AetherCloudError(
          "TIMEOUT",
          "AETHER Cloud did not respond in time.",
          {
            requestId,
            cause: error,
          },
        );
      }
      throw new AetherCloudError(
        "NETWORK_ERROR",
        "Could not reach AETHER Cloud.",
        {
          requestId,
          cause: error,
        },
      );
    } finally {
      timeout.cleanup();
    }

    if (!response.ok) {
      throw await this.errorFromResponse(response, requestId);
    }
    return response;
  }

  private async parseJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new AetherCloudError(
        "INVALID_RESPONSE",
        "AETHER Cloud returned invalid JSON.",
        {
          status: response.status,
          requestId: response.headers.get("x-request-id") ?? undefined,
          cause: error,
        },
      );
    }
  }

  private async errorFromResponse(
    response: Response,
    requestId: string,
  ): Promise<AetherCloudError> {
    const retryAfter = Number.parseInt(
      response.headers.get("retry-after") ?? "",
      10,
    );
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const error = decodeCloudErrorEnvelope(
      body,
      response.status,
      response.headers.get("x-request-id") ?? requestId,
    );
    return new AetherCloudError(error.code, error.message, {
      status: error.status,
      requestId: error.requestId,
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined,
    });
  }
}

function createRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function decodeUsageSnapshot(payload: unknown): AetherUsageSnapshot {
  if (!payload || typeof payload !== "object") {
    throw new AetherCloudError(
      "INVALID_RESPONSE",
      "AETHER Cloud returned an invalid usage snapshot payload.",
    );
  }
  const raw = payload as Record<string, unknown>;

  const plan = raw.plan as Record<string, unknown> | undefined;
  if (!plan || (plan.tier !== "free" && plan.tier !== "pro")) {
    throw new AetherCloudError(
      "INVALID_RESPONSE",
      "Usage snapshot contains an invalid plan tier.",
    );
  }

  const period = (raw.period as Record<string, unknown> | undefined) ?? {};
  const ai = raw.ai as Record<string, unknown> | undefined;
  if (!ai || !isNonNegativeFiniteNumber(ai.used)) {
    throw new AetherCloudError(
      "INVALID_RESPONSE",
      "Usage snapshot contains invalid AI usage metrics.",
    );
  }

  const voice = raw.voice as Record<string, unknown> | undefined;
  if (!voice || !isNonNegativeFiniteNumber(voice.usedSeconds)) {
    throw new AetherCloudError(
      "INVALID_RESPONSE",
      "Usage snapshot contains invalid voice usage metrics.",
    );
  }

  const automations = raw.automations as Record<string, unknown> | undefined;
  const capabilities = raw.capabilities as Record<string, unknown> | undefined;
  if (
    !capabilities ||
    typeof capabilities.hostedInference !== "boolean" ||
    typeof capabilities.liveTranscription !== "boolean" ||
    typeof capabilities.cloudAutomations !== "boolean"
  ) {
    throw new AetherCloudError(
      "INVALID_RESPONSE",
      "Usage snapshot contains invalid capability flags.",
    );
  }

  const aiMetric = decodeUsageMetric(ai, "AI");
  const voiceMetric = decodeVoiceUsageMetric(voice);
  const automationMetric = automations
    ? decodeUsageMetric(automations, "automation")
    : undefined;

  return {
    plan: {
      tier: plan.tier,
      source:
        typeof plan.source === "string"
          ? (plan.source as CommercialSource)
          : undefined,
      displayName:
        typeof plan.displayName === "string" && plan.displayName.trim()
          ? plan.displayName.trim()
          : plan.tier === "pro"
            ? "AETHER Pro"
            : "AETHER Free",
    },
    period: {
      startsAt:
        typeof period.startsAt === "string" ? period.startsAt : undefined,
      resetsAt:
        typeof period.resetsAt === "string" ? period.resetsAt : undefined,
    },
    ai: aiMetric,
    voice: voiceMetric,
    ...(automationMetric ? { automations: automationMetric } : {}),
    capabilities: {
      hostedInference: capabilities.hostedInference,
      liveTranscription: capabilities.liveTranscription,
      cloudAutomations: capabilities.cloudAutomations,
    },
  };
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function decodeNullableMetricValue(
  value: unknown,
  label: string,
): number | null {
  if (value === null || value === undefined) return null;
  if (!isNonNegativeFiniteNumber(value)) {
    throw new AetherCloudError(
      "INVALID_RESPONSE",
      `Usage snapshot contains an invalid ${label}.`,
    );
  }
  return value;
}

function decodeUsageMetric(
  raw: Record<string, unknown>,
  label: string,
): AetherUsageSnapshot["ai"] {
  const used = raw.used;
  if (!isNonNegativeFiniteNumber(used)) {
    throw new AetherCloudError(
      "INVALID_RESPONSE",
      `Usage snapshot contains invalid ${label} usage.`,
    );
  }
  return {
    used,
    limit: decodeNullableMetricValue(raw.limit, `${label} limit`),
    remaining: decodeNullableMetricValue(
      raw.remaining,
      `${label} remaining usage`,
    ),
  };
}

function decodeVoiceUsageMetric(
  raw: Record<string, unknown>,
): AetherUsageSnapshot["voice"] {
  const usedSeconds = raw.usedSeconds;
  if (!isNonNegativeFiniteNumber(usedSeconds)) {
    throw new AetherCloudError(
      "INVALID_RESPONSE",
      "Usage snapshot contains invalid voice usage.",
    );
  }
  return {
    usedSeconds,
    limitSeconds: decodeNullableMetricValue(raw.limitSeconds, "voice limit"),
    remainingSeconds: decodeNullableMetricValue(
      raw.remainingSeconds,
      "voice remaining usage",
    ),
  };
}

let sharedClient: AetherCloudClient | null = null;
let sharedKey = "";

export function getAetherCloudClient(): AetherCloudClient {
  const config = resolveAetherCloudConfig();
  if (!config) {
    throw new AetherCloudError(
      "NETWORK_ERROR",
      "AETHER Cloud is not configured.",
    );
  }
  const key = `${config.baseUrl}|${config.userId}|${config.deviceId}`;
  if (!sharedClient || sharedKey !== key) {
    sharedClient = new AetherCloudClient(config);
    sharedKey = key;
  }
  return sharedClient;
}

export function resetAetherCloudClientForTests(): void {
  sharedClient = null;
  sharedKey = "";
}
