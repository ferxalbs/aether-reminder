import { AIResponse, Task } from '@/types';
import { AICompletionRequest, AIConnectionTestResult, AIProvider, AIProviderError, getAIErrorMessage, requireUserApiKey } from './providers';
import { AIModel, normalizeOpenRouterModels, OpenRouterModelsResponse } from './models';
import { getLocalDateString, isLocalDateBefore } from '@/temporal/localCalendar';

const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_URL = `${OPENROUTER_API_BASE_URL}/chat/completions`;
const OPENROUTER_MODELS_URL = `${OPENROUTER_API_BASE_URL}/models`;
const OPENROUTER_KEY_URL = `${OPENROUTER_API_BASE_URL}/key`;

type OpenRouterErrorPayload = {
  error?: { code?: number | string; message?: string; metadata?: { error_type?: string } };
};

type OpenRouterCompletionResponse = OpenRouterErrorPayload & {
  choices?: { message?: { content?: string }; error?: OpenRouterErrorPayload['error'] }[];
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

function assertCompletionResponse(response: OpenRouterCompletionResponse): string {
  const embeddedError = response.error ?? response.choices?.[0]?.error;
  if (embeddedError) {
    const code = getErrorCode(Number(embeddedError.code) || 500, embeddedError.metadata?.error_type);
    throw new AIProviderError(code, getAIErrorMessage(new AIProviderError(code, '')));
  }

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new AIProviderError('INVALID_RESPONSE', 'OpenRouter returned no completion content.');
  return content;
}

async function resolveModel(model: string | undefined, apiKey: string): Promise<string> {
  const selectedModel = model?.trim();
  if (selectedModel) return selectedModel;

  const availableModels = await fetchAvailableModels(apiKey);
  const firstAvailableModel = availableModels.find((candidate) => candidate.availability === 'available');
  if (!firstAvailableModel) throw new AIProviderError('INVALID_REQUEST', 'No supported OpenRouter models are available.');
  return firstAvailableModel.id;
}

export async function fetchOpenRouterCompletion(messages: AICompletionRequest['messages'], model?: string, apiKey?: string): Promise<string> {
  const keyToUse = requireUserApiKey(apiKey);
  const modelToUse = await resolveModel(model, keyToUse);
  const response = await openRouterRequest<OpenRouterCompletionResponse>(OPENROUTER_API_URL, {
    method: 'POST',
    headers: { 'HTTP-Referer': 'https://aether-reminder.app', 'X-Title': 'AETHER Reminder' },
    body: JSON.stringify({ model: modelToUse, messages, temperature: 0.4, max_tokens: 800 }),
  }, keyToUse, true);

  return assertCompletionResponse(response);
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

export async function generateTaskSummary(tasks: Task[], model?: string, apiKey?: string): Promise<AIResponse> {
  const todayStr = getLocalDateString();
  const pendingTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);
  const overdueTasks = tasks.filter(
    (t) => !t.completed && t.dueDate && isLocalDateBefore(t.dueDate, todayStr)
  );
  // Temporary: full task dump. Phase 5+ replaces this with agent tools + small context.
  const taskContext = JSON.stringify({
    totalTasks: tasks.length,
    pendingCount: pendingTasks.length,
    completedCount: completedTasks.length,
    overdueCount: overdueTasks.length,
    pendingTasksList: pendingTasks.map((t) => ({
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
      notes: t.notes,
    })),
    overdueTasksList: overdueTasks.map((t) => ({ title: t.title, dueDate: t.dueDate })),
  });
  const prompt = `Analyze these user TODO tasks and respond with ONLY a valid JSON object matching this schema:
{
  "summary": "Concise high-level 2-sentence summary of today's workload and status.",
  "priorities": ["Top priority 1", "Top priority 2", "Top priority 3"],
  "overdueAlerts": ["Alert for task X if overdue"],
  "insights": ["Productivity advice 1", "Time allocation suggestion 2"]
}

Do not format with markdown codeblocks if possible, or return strictly valid JSON.
Tasks Data: ${taskContext}`;

  const rawResult = await fetchOpenRouterCompletion(
    [
      {
        role: 'system',
        content:
          'You are AETHER, a personal execution assistant for tasks and reminders. Be concise and factual. Do not invent tasks.',
      },
      { role: 'user', content: prompt },
    ],
    model,
    apiKey
  );

  // Temporary free-form parse. Replaced by structured outputs in the agent runtime phase.
  const cleaned = rawResult.replace(/```json/g, '').replace(/```/g, '').trim();
  let parsed: Partial<AIResponse>;
  try {
    parsed = JSON.parse(cleaned) as Partial<AIResponse>;
  } catch {
    throw new AIProviderError('INVALID_RESPONSE', 'OpenRouter returned invalid JSON.');
  }

  return {
    summary: parsed.summary || 'Here is your daily workload overview based on active tasks.',
    priorities: Array.isArray(parsed.priorities) ? parsed.priorities : [],
    overdueAlerts: Array.isArray(parsed.overdueAlerts) ? parsed.overdueAlerts : [],
    insights: Array.isArray(parsed.insights) ? parsed.insights : [],
  };
}

/**
 * Deterministic local stats only — never labeled as an AI success.
 * Used when the provider fails so the UI can still show ground-truth counts.
 */
export function buildLocalWorkloadStats(tasks: Task[]): AIResponse {
  const todayStr = getLocalDateString();
  const pending = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);
  const overdue = tasks.filter(
    (t) => !t.completed && t.dueDate && isLocalDateBefore(t.dueDate, todayStr)
  );
  const highPriority = pending.filter((t) => t.priority === 'high');

  return {
    summary: `Local counts only (AI unavailable): ${pending.length} pending, ${completed.length} completed, ${overdue.length} overdue.`,
    priorities:
      highPriority.length > 0
        ? highPriority.slice(0, 3).map((t) => t.title)
        : pending.slice(0, 3).map((t) => t.title),
    overdueAlerts: overdue.map((t) => `Overdue: "${t.title}" (Due ${t.dueDate})`),
    insights: [],
  };
}

/** @deprecated Use buildLocalWorkloadStats — name kept briefly for any external imports. */
export const generateFallbackSummary = buildLocalWorkloadStats;

export async function prioritizeTasks(tasks: Task[], model?: string, apiKey?: string): Promise<string[]> {
  const summary = await generateTaskSummary(tasks, model, apiKey);
  return summary.priorities;
}

export async function analyzeProductivity(tasks: Task[], model?: string, apiKey?: string): Promise<AIResponse> {
  return generateTaskSummary(tasks, model, apiKey);
}

export const openRouterProvider: AIProvider<AIModel> = {
  id: 'openrouter',
  name: 'OpenRouter',
  complete: ({ messages, model, apiKey }) => fetchOpenRouterCompletion(messages, model, apiKey),
  listModels: fetchAvailableModels,
  testConnection: testOpenRouterConnection,
};
