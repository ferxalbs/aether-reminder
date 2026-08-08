import {
  AIProviderError,
  getAIErrorMessage,
  requireUserApiKey,
} from '../providers';
import {
  capabilitiesFromOpenRouterMetadata,
  canRunAsAgent,
  hasOpenRouterParameter,
  type OpenRouterModelMetadata,
} from './capabilities';
import { parseSseStream } from './sse';
import type {
  InferenceProvider,
  InferenceRequest,
  InferenceUsage,
  ModelCapabilities,
  ModelEvent,
} from './types';

const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_URL = `${OPENROUTER_API_BASE_URL}/chat/completions`;
const OPENROUTER_MODELS_URL = `${OPENROUTER_API_BASE_URL}/models`;

type OpenRouterErrorPayload = {
  error?: { code?: number | string; message?: string; metadata?: { error_type?: string } };
};

type OpenRouterModelsResponse = {
  data?: OpenRouterModelMetadata[];
};

type StreamDelta = {
  content?: string | null;
  tool_calls?: {
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }[];
};

type StreamChunk = OpenRouterErrorPayload & {
  id?: string;
  model?: string;
  choices?: {
    index?: number;
    delta?: StreamDelta;
    finish_reason?: string | null;
    error?: OpenRouterErrorPayload['error'];
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
};

let modelsMetaCache: { byId: Map<string, OpenRouterModelMetadata>; fetchedAt: number } | null =
  null;
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

function getRetryAfterSeconds(response: Response): number | undefined {
  const retryAfter = Number(response.headers.get('Retry-After'));
  return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : undefined;
}

function getErrorCode(status: number, errorType?: string): AIProviderError['code'] {
  if (status === 401 || errorType === 'authentication') return 'INVALID_API_KEY';
  if (status === 402) return 'INSUFFICIENT_CREDITS';
  if (status === 429 || errorType === 'rate_limit_exceeded') return 'RATE_LIMITED';
  if (
    status === 400 ||
    status === 404 ||
    errorType === 'invalid_request' ||
    errorType === 'not_found'
  ) {
    return 'INVALID_REQUEST';
  }
  if (
    status === 502 ||
    status === 503 ||
    errorType === 'provider_unavailable' ||
    errorType === 'provider_overloaded'
  ) {
    return 'PROVIDER_UNAVAILABLE';
  }
  return 'UNKNOWN';
}

function toProviderError(response: Response, payload?: OpenRouterErrorPayload): AIProviderError {
  const code = getErrorCode(response.status, payload?.error?.metadata?.error_type);
  return new AIProviderError(code, getAIErrorMessage(new AIProviderError(code, '')), {
    status: response.status,
    retryAfterSeconds: getRetryAfterSeconds(response),
    provider: 'OpenRouter',
  });
}

function mapUsage(usage: StreamChunk['usage']): InferenceUsage | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    cost: usage.cost,
  };
}

async function loadModelsMetadata(apiKey?: string): Promise<Map<string, OpenRouterModelMetadata>> {
  if (modelsMetaCache && Date.now() - modelsMetaCache.fetchedAt < MODELS_CACHE_TTL_MS) {
    return modelsMetaCache.byId;
  }

  const headers = new Headers({ 'Content-Type': 'application/json' });
  const key = apiKey?.trim();
  if (key) headers.set('Authorization', `Bearer ${key}`);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_MODELS_URL, { method: 'GET', headers });
  } catch {
    throw new AIProviderError('NETWORK_ERROR', 'Could not reach OpenRouter.');
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as OpenRouterErrorPayload | undefined;
    throw toProviderError(response, payload);
  }

  const body = (await response.json()) as OpenRouterModelsResponse;
  const byId = new Map<string, OpenRouterModelMetadata>();
  for (const model of body.data ?? []) {
    if (model.id) byId.set(model.id, model);
  }
  modelsMetaCache = { byId, fetchedAt: Date.now() };
  return byId;
}

/** Test-only: clear model metadata cache. */
export function __clearOpenRouterModelsCache(): void {
  modelsMetaCache = null;
}

export class OpenRouterProvider implements InferenceProvider {
  readonly id = 'openrouter';

  async getCapabilities(modelId: string, apiKey?: string): Promise<ModelCapabilities> {
    const normalizedModelId = modelId.trim();
    if (!normalizedModelId) {
      throw new AIProviderError('INVALID_REQUEST', 'An OpenRouter model id is required.', {
        provider: 'OpenRouter',
      });
    }
    const map = await loadModelsMetadata(apiKey);
    const meta = map.get(normalizedModelId);
    if (!meta) {
      throw new AIProviderError(
        'MODEL_NOT_FOUND',
        `OpenRouter model ${normalizedModelId} is not in the current catalog.`,
        { provider: 'OpenRouter' }
      );
    }
    return capabilitiesFromOpenRouterMetadata(meta);
  }

  async *stream(request: InferenceRequest, signal: AbortSignal): AsyncIterable<ModelEvent> {
    const apiKey = requireUserApiKey(request.apiKey);
    const modelId = request.modelId.trim();
    if (!modelId) {
      yield {
        type: 'stream.error',
        error: { code: 'INVALID_REQUEST', message: 'Model id is required.' },
      };
      return;
    }

    if (signal.aborted) {
      yield { type: 'stream.aborted' };
      return;
    }

    let metadata: OpenRouterModelMetadata | undefined;
    try {
      metadata = (await loadModelsMetadata(apiKey)).get(modelId);
    } catch (error) {
      const providerError = error instanceof AIProviderError
        ? error
        : new AIProviderError('NETWORK_ERROR', 'Could not reach OpenRouter.', { provider: 'OpenRouter' });
      yield {
        type: 'stream.error',
        error: { code: providerError.code, message: getAIErrorMessage(providerError) },
      };
      return;
    }

    if (!metadata) {
      const providerError = new AIProviderError(
        'MODEL_NOT_FOUND',
        `OpenRouter model ${modelId} is not in the current catalog.`,
        { provider: 'OpenRouter' }
      );
      yield {
        type: 'stream.error',
        error: { code: providerError.code, message: getAIErrorMessage(providerError) },
      };
      return;
    }

    const capabilities = capabilitiesFromOpenRouterMetadata(metadata);
    if (!canRunAsAgent(capabilities)) {
      const providerError = new AIProviderError(
        'INCOMPATIBLE_MODEL',
        `OpenRouter model ${modelId} cannot run AETHER's tool-enabled agent.`,
        { provider: 'OpenRouter' }
      );
      yield {
        type: 'stream.error',
        error: { code: providerError.code, message: getAIErrorMessage(providerError) },
      };
      return;
    }

    const body: Record<string, unknown> = {
      model: modelId,
      messages: request.messages,
      stream: true,
    };

    if (hasOpenRouterParameter(metadata.supported_parameters, 'temperature')) {
      body.temperature = request.temperature ?? 0.3;
    }
    if (hasOpenRouterParameter(metadata.supported_parameters, 'max_tokens')) {
      body.max_tokens = request.maxTokens ?? 1200;
    } else if (hasOpenRouterParameter(metadata.supported_parameters, 'max_completion_tokens')) {
      body.max_completion_tokens = request.maxTokens ?? 1200;
    }

    if (request.tools?.length) {
      body.tools = request.tools;
      body.tool_choice = request.toolChoice ?? 'auto';
    }
    if (request.responseFormat) {
      body.response_format = request.responseFormat;
    }

    let response: Response;
    try {
      response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://aether-reminder.app',
          'X-Title': 'AETHER Reminder',
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        yield { type: 'stream.aborted' };
        return;
      }
      yield {
        type: 'stream.error',
        error: { code: 'NETWORK_ERROR', message: 'Could not reach OpenRouter.' },
      };
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => undefined)) as
        | OpenRouterErrorPayload
        | undefined;
      const err = toProviderError(response, payload);
      yield {
        type: 'stream.error',
        error: {
          code: err.code,
          message: err.message,
          status: err.status,
          retryAfterSeconds: err.retryAfterSeconds,
        },
      };
      return;
    }

    yield { type: 'stream.started', modelId };

    // Accumulate tool call fragments by index
    const toolBuffers = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let finishReason: string | null | undefined;
    let usage: InferenceUsage | undefined;
    let sawContent = false;

    try {
      for await (const data of parseSseStream(response.body, signal)) {
        if (signal.aborted) {
          yield { type: 'stream.aborted' };
          return;
        }

        if (data === '[DONE]') {
          break;
        }

        let chunk: StreamChunk;
        try {
          chunk = JSON.parse(data) as StreamChunk;
        } catch {
          // Malformed event — skip; do not fail the whole stream on a single bad line
          continue;
        }

        if (chunk.error) {
          const code = getErrorCode(
            Number(chunk.error.code) || 500,
            chunk.error.metadata?.error_type
          );
          yield {
            type: 'stream.error',
            error: {
              code,
              message: getAIErrorMessage(new AIProviderError(code, '')),
            },
          };
          return;
        }

        const choice = chunk.choices?.[0];
        if (choice?.error) {
          const code = getErrorCode(
            Number(choice.error.code) || 500,
            choice.error.metadata?.error_type
          );
          yield {
            type: 'stream.error',
            error: {
              code,
              message: getAIErrorMessage(new AIProviderError(code, '')),
            },
          };
          return;
        }

        if (chunk.usage) {
          usage = mapUsage(chunk.usage);
        }

        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const delta = choice?.delta;
        if (delta?.content) {
          sawContent = true;
          yield { type: 'text.delta', text: delta.content };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index ?? 0;
            const prev = toolBuffers.get(index) ?? { id: '', name: '', arguments: '' };
            if (tc.id) prev.id = tc.id;
            if (tc.function?.name) prev.name = (prev.name || '') + tc.function.name;
            if (tc.function?.arguments) {
              prev.arguments += tc.function.arguments;
            }
            // Some providers send full name once without id until later
            if (!prev.id) prev.id = `call_${index}`;
            toolBuffers.set(index, prev);

            yield {
              type: 'tool_call.delta',
              toolCallId: prev.id,
              index,
              name: tc.function?.name,
              argumentsDelta: tc.function?.arguments,
            };
          }
        }
      }
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        yield { type: 'stream.aborted' };
        return;
      }
      yield {
        type: 'stream.error',
        error: { code: 'NETWORK_ERROR', message: 'Stream interrupted.' },
      };
      return;
    }

    if (signal.aborted) {
      yield { type: 'stream.aborted' };
      return;
    }

    for (const [index, buf] of toolBuffers) {
      if (!buf.name) continue;
      yield {
        type: 'tool_call.completed',
        toolCallId: buf.id || `call_${index}`,
        index,
        name: buf.name,
        arguments: buf.arguments || '{}',
      };
    }

    // Empty successful stream with no content and no tools is still a completed stream
    // (caller decides if invalid). Usage may arrive on the final chunk.
    void sawContent;
    yield {
      type: 'stream.completed',
      finishReason: finishReason ?? null,
      usage,
    };
  }
}

export const openRouterInferenceProvider = new OpenRouterProvider();
