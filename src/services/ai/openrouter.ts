import { AIConnectionTestResult, AIProviderError, getAIErrorMessage, requireUserApiKey } from './providers';
import { AIModel, normalizeOpenRouterModels, OpenRouterModelsResponse } from './models';

const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_MODELS_URL = `${OPENROUTER_API_BASE_URL}/models`;
const OPENROUTER_KEY_URL = `${OPENROUTER_API_BASE_URL}/key`;

type OpenRouterErrorPayload = {
  error?: { code?: number | string; message?: string; metadata?: { error_type?: string } };
};

let modelsCache: { models: AIModel[]; fetchedAt: number } | null = null;
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

function getRetryAfterSeconds(response: Response): number | undefined {
  const retryAfter = Number(response.headers.get('Retry-After'));
  return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : undefined;
}

function getErrorCode(status: number, errorType?: string): AIProviderError['code'] {
  if (status === 401 || errorType === 'authentication') return 'INVALID_API_KEY';
  if (status === 402) return 'INSUFFICIENT_CREDITS';
  if (status === 429 || errorType === 'rate_limit_exceeded') return 'RATE_LIMITED';
  if (status === 400 || status === 404 || errorType === 'invalid_request' || errorType === 'not_found') return 'INVALID_REQUEST';
  if (status === 502 || status === 503 || errorType === 'provider_unavailable' || errorType === 'provider_overloaded') return 'PROVIDER_UNAVAILABLE';
  return 'UNKNOWN';
}

function createOpenRouterError(response: Response, payload?: OpenRouterErrorPayload): AIProviderError {
  const code = getErrorCode(response.status, payload?.error?.metadata?.error_type);
  // Do not copy the provider response into an exception. It can contain user or secret material.
  return new AIProviderError(code, getAIErrorMessage(new AIProviderError(code, '')), {
    status: response.status,
    retryAfterSeconds: getRetryAfterSeconds(response),
  });
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

async function openRouterRequest<T>(url: string, init: RequestInit, apiKey?: string, requiresApiKey = false): Promise<T> {
  const normalizedKey = requiresApiKey ? requireUserApiKey(apiKey) : apiKey?.trim();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (normalizedKey) headers.set('Authorization', `Bearer ${normalizedKey}`);

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch {
    throw new AIProviderError('NETWORK_ERROR', 'Could not reach OpenRouter.');
  }

  const payload = (await readJson(response)) as OpenRouterErrorPayload | T | undefined;
  if (!response.ok) throw createOpenRouterError(response, payload as OpenRouterErrorPayload | undefined);
  return payload as T;
}

/** Model metadata is public; inference always validates a user key above. */
export async function fetchAvailableModels(apiKey?: string): Promise<AIModel[]> {
  if (modelsCache && Date.now() - modelsCache.fetchedAt < MODELS_CACHE_TTL_MS) return modelsCache.models;

  const response = await openRouterRequest<OpenRouterModelsResponse>(OPENROUTER_MODELS_URL, { method: 'GET' }, apiKey);
  const models = normalizeOpenRouterModels(response ?? {});
  if (models.length === 0) throw new AIProviderError('INVALID_RESPONSE', 'OpenRouter returned no supported text models.');

  modelsCache = { models, fetchedAt: Date.now() };
  return models;
}

export async function testOpenRouterConnection(apiKey: string): Promise<AIConnectionTestResult> {
  const keyToUse = requireUserApiKey(apiKey);
  await openRouterRequest(OPENROUTER_KEY_URL, { method: 'GET' }, keyToUse, true);
  return { provider: 'OpenRouter', connected: true };
}
