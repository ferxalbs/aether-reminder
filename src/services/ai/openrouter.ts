import {
  AIConnectionTestResult,
  AIProviderError,
  getAIErrorMessage,
  requireUserApiKey,
} from "./providers";
import {
  AIModel,
  normalizeOpenRouterModels,
  OpenRouterModelsResponse,
} from "./models";
import { reportNonFatalError } from "@/lib/nonFatalError";
import { createTimeoutSignal, retryWithBackoff } from "@/lib/retry";

const OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODELS_URL = `${OPENROUTER_API_BASE_URL}/models`;
const OPENROUTER_KEY_URL = `${OPENROUTER_API_BASE_URL}/key`;
const OPENROUTER_REQUEST_TIMEOUT_MS = 15_000;

type OpenRouterErrorPayload = {
  error?: {
    code?: number | string;
    message?: string;
    metadata?: { error_type?: string };
  };
};

let modelsCache: { models: AIModel[]; fetchedAt: number } | null = null;
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

function getRetryAfterSeconds(response: Response): number | undefined {
  const retryAfter = Number(response.headers.get("Retry-After"));
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.ceil(retryAfter)
    : undefined;
}

function getErrorCode(
  status: number,
  errorType?: string,
): AIProviderError["code"] {
  if (status === 401 || errorType === "authentication")
    return "INVALID_API_KEY";
  if (status === 402) return "INSUFFICIENT_CREDITS";
  if (status === 429 || errorType === "rate_limit_exceeded")
    return "RATE_LIMITED";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (
    status === 400 ||
    status === 404 ||
    errorType === "invalid_request" ||
    errorType === "not_found"
  )
    return "INVALID_REQUEST";
  if (
    status === 502 ||
    status === 503 ||
    errorType === "provider_unavailable" ||
    errorType === "provider_overloaded"
  )
    return "PROVIDER_UNAVAILABLE";
  return "UNKNOWN";
}

function createOpenRouterError(
  response: Response,
  payload?: OpenRouterErrorPayload,
): AIProviderError {
  const code = getErrorCode(
    response.status,
    payload?.error?.metadata?.error_type,
  );
  // Do not copy the provider response into an exception. It can contain user or secret material.
  return new AIProviderError(
    code,
    getAIErrorMessage(new AIProviderError(code, "")),
    {
      status: response.status,
      retryAfterSeconds: getRetryAfterSeconds(response),
    },
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    reportNonFatalError("openrouter-json-response", error);
    return undefined;
  }
}

async function openRouterRequest<T>(
  url: string,
  init: RequestInit,
  apiKey?: string,
  requiresApiKey = false,
): Promise<T> {
  const normalizedKey = requiresApiKey
    ? requireUserApiKey(apiKey)
    : apiKey?.trim();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (normalizedKey) headers.set("Authorization", `Bearer ${normalizedKey}`);

  const callerSignal = init.signal ?? undefined;
  try {
    return await retryWithBackoff(
      async () => {
        const timeout = createTimeoutSignal(
          callerSignal,
          OPENROUTER_REQUEST_TIMEOUT_MS,
        );
        try {
          let response: Response;
          try {
            response = await fetch(url, {
              ...init,
              headers,
              signal: timeout.signal,
            });
          } catch (error) {
            if (callerSignal?.aborted) throw error;
            if (timeout.didTimeout()) {
              throw new AIProviderError(
                "TIMEOUT",
                "OpenRouter request timed out.",
              );
            }
            throw new AIProviderError(
              "NETWORK_ERROR",
              "Could not reach OpenRouter.",
            );
          }

          const payload = (await readJson(response)) as
            OpenRouterErrorPayload | T | undefined;
          if (!response.ok)
            throw createOpenRouterError(
              response,
              payload as OpenRouterErrorPayload | undefined,
            );
          return payload as T;
        } finally {
          timeout.cleanup();
        }
      },
      {
        signal: callerSignal ?? undefined,
        shouldRetry: (error) =>
          error instanceof AIProviderError &&
          [
            "NETWORK_ERROR",
            "TIMEOUT",
            "RATE_LIMITED",
            "PROVIDER_UNAVAILABLE",
          ].includes(error.code),
        getRetryAfterMs: (error) =>
          error instanceof AIProviderError && error.retryAfterSeconds
            ? error.retryAfterSeconds * 1000
            : undefined,
        onRetry: (nextAttempt, delayMs, error) => {
          reportNonFatalError(
            "openrouter-retry",
            new Error(
              `attempt=${nextAttempt} delayMs=${delayMs} code=${error instanceof AIProviderError ? error.code : "unknown"}`,
            ),
          );
        },
      },
    );
  } catch (error) {
    reportNonFatalError("openrouter-request", error);
    throw error;
  }
}

/** Model metadata is public; inference always validates a user key above. */
export async function fetchAvailableModels(
  apiKey?: string,
  forceRefresh = false,
): Promise<AIModel[]> {
  if (
    !forceRefresh &&
    modelsCache &&
    Date.now() - modelsCache.fetchedAt < MODELS_CACHE_TTL_MS
  )
    return modelsCache.models;

  const response = await openRouterRequest<OpenRouterModelsResponse>(
    OPENROUTER_MODELS_URL,
    { method: "GET" },
    apiKey,
  );
  const models = normalizeOpenRouterModels(response ?? {});
  if (models.length === 0)
    throw new AIProviderError(
      "INVALID_RESPONSE",
      "OpenRouter returned no supported text models.",
    );

  modelsCache = { models, fetchedAt: Date.now() };
  return models;
}

export async function testOpenRouterConnection(
  apiKey: string,
): Promise<AIConnectionTestResult> {
  const keyToUse = requireUserApiKey(apiKey);
  await openRouterRequest(
    OPENROUTER_KEY_URL,
    { method: "GET" },
    keyToUse,
    true,
  );
  return { provider: "OpenRouter", connected: true };
}
