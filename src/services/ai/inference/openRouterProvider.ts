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
import { reportNonFatalError } from '@/lib/nonFatalError';
import { createTimeoutSignal, retryWithBackoff } from '@/lib/retry';

const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_URL = `${OPENROUTER_API_BASE_URL}/chat/completions`;
const OPENROUTER_MODELS_URL = `${OPENROUTER_API_BASE_URL}/models`;
const OPENROUTER_METADATA_TIMEOUT_MS = 15_000;
const OPENROUTER_STREAM_CONNECT_TIMEOUT_MS = 15_000;
const OPENROUTER_STREAM_IDLE_TIMEOUT_MS = 60_000;

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
  if (status === 408 || status === 504) return 'TIMEOUT';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseStreamChunk(data: string): StreamChunk {
  const parsed: unknown = JSON.parse(data);
  if (!isRecord(parsed)) throw new Error('OpenRouter stream event was not an object.');
  if ('error' in parsed && parsed.error !== undefined && !isRecord(parsed.error)) {
    throw new Error('OpenRouter stream error payload was malformed.');
  }
  if ('choices' in parsed && parsed.choices !== undefined) {
    if (!Array.isArray(parsed.choices)) throw new Error('OpenRouter choices payload was malformed.');
    for (const choice of parsed.choices) {
      if (!isRecord(choice)) throw new Error('OpenRouter choice payload was malformed.');
      if ('error' in choice && choice.error !== undefined && !isRecord(choice.error)) {
        throw new Error('OpenRouter choice error payload was malformed.');
      }
      if ('delta' in choice && choice.delta !== undefined) {
        if (!isRecord(choice.delta)) throw new Error('OpenRouter delta payload was malformed.');
        if ('content' in choice.delta && choice.delta.content !== undefined && choice.delta.content !== null && typeof choice.delta.content !== 'string') {
          throw new Error('OpenRouter text delta was malformed.');
        }
        if ('tool_calls' in choice.delta && choice.delta.tool_calls !== undefined && !Array.isArray(choice.delta.tool_calls)) {
          throw new Error('OpenRouter tool call payload was malformed.');
        }
        for (const toolCall of (choice.delta.tool_calls as unknown[] | undefined) ?? []) {
          if (!isRecord(toolCall)) throw new Error('OpenRouter tool call item was malformed.');
          if ('function' in toolCall && toolCall.function !== undefined && !isRecord(toolCall.function)) {
            throw new Error('OpenRouter tool function payload was malformed.');
          }
        }
      }
    }
  }
  return parsed as StreamChunk;
}

function streamError(error: AIProviderError): ModelEvent {
  return {
    type: 'stream.error',
    error: {
      code: error.code,
      message: getAIErrorMessage(error),
      status: error.status,
      retryAfterSeconds: error.retryAfterSeconds,
    },
  };
}

async function loadModelsMetadata(apiKey?: string): Promise<Map<string, OpenRouterModelMetadata>> {
  if (modelsMetaCache && Date.now() - modelsMetaCache.fetchedAt < MODELS_CACHE_TTL_MS) {
    return modelsMetaCache.byId;
  }

  const headers = new Headers({ 'Content-Type': 'application/json' });
  const key = apiKey?.trim();
  if (key) headers.set('Authorization', `Bearer ${key}`);

  return retryWithBackoff(
    async () => {
      const timeout = createTimeoutSignal(undefined, OPENROUTER_METADATA_TIMEOUT_MS);
      try {
        let response: Response;
        try {
          response = await fetch(OPENROUTER_MODELS_URL, {
            method: 'GET',
            headers,
            signal: timeout.signal,
          });
        } catch {
          throw new AIProviderError(
            timeout.didTimeout() ? 'TIMEOUT' : 'NETWORK_ERROR',
            timeout.didTimeout() ? 'OpenRouter model catalog timed out.' : 'Could not reach OpenRouter.'
          );
        }

        if (!response.ok) {
          let payload: OpenRouterErrorPayload | undefined;
          try {
            payload = (await response.json()) as OpenRouterErrorPayload;
          } catch (error) {
            reportNonFatalError('openrouter-error-response', error);
          }
          throw toProviderError(response, payload);
        }

        let body: OpenRouterModelsResponse;
        try {
          body = (await response.json()) as OpenRouterModelsResponse;
        } catch (error) {
          reportNonFatalError('openrouter-models-response', error);
          throw new AIProviderError('INVALID_RESPONSE', 'OpenRouter returned malformed model metadata.');
        }
        if (!body || !Array.isArray(body.data)) {
          throw new AIProviderError('INVALID_RESPONSE', 'OpenRouter returned malformed model metadata.');
        }

        const byId = new Map<string, OpenRouterModelMetadata>();
        for (const model of body.data) {
          if (model && typeof model === 'object' && typeof model.id === 'string' && model.id) {
            byId.set(model.id, model);
          }
        }
        modelsMetaCache = { byId, fetchedAt: Date.now() };
        return byId;
      } finally {
        timeout.cleanup();
      }
    },
    {
      shouldRetry: (error) => error instanceof AIProviderError
        && ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE'].includes(error.code),
      getRetryAfterMs: (error) => error instanceof AIProviderError && error.retryAfterSeconds
        ? error.retryAfterSeconds * 1000
        : undefined,
      onRetry: (nextAttempt, delayMs, error) => {
        reportNonFatalError('openrouter-models-retry', new Error(`attempt=${nextAttempt} delayMs=${delayMs} code=${error instanceof AIProviderError ? error.code : 'unknown'}`));
      },
    }
  );
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
      reportNonFatalError('openrouter-models-request', error);
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
      response = await retryWithBackoff(
        async () => {
          const timeout = createTimeoutSignal(signal, OPENROUTER_STREAM_CONNECT_TIMEOUT_MS);
          try {
            let nextResponse: Response;
            try {
              nextResponse = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${apiKey}`,
                  'HTTP-Referer': 'https://aether-reminder.app',
                  'X-Title': 'AETHER Reminder',
                },
                body: JSON.stringify(body),
                signal: timeout.signal,
              });
            } catch (error) {
              if (signal.aborted) throw error;
              throw new AIProviderError(
                timeout.didTimeout() ? 'TIMEOUT' : 'NETWORK_ERROR',
                timeout.didTimeout() ? 'OpenRouter stream connection timed out.' : 'Could not reach OpenRouter.',
                { provider: 'OpenRouter' }
              );
            }
            if (!nextResponse.ok) {
              let payload: OpenRouterErrorPayload | undefined;
              try {
                payload = (await nextResponse.json()) as OpenRouterErrorPayload;
              } catch (error) {
                reportNonFatalError('openrouter-error-response', error);
              }
              throw toProviderError(nextResponse, payload);
            }
            return nextResponse;
          } finally {
            timeout.cleanup();
          }
        },
        {
          signal,
          shouldRetry: (error) => error instanceof AIProviderError
            && ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE'].includes(error.code),
          getRetryAfterMs: (error) => error instanceof AIProviderError && error.retryAfterSeconds
            ? error.retryAfterSeconds * 1000
            : undefined,
          onRetry: (nextAttempt, delayMs, error) => {
            reportNonFatalError('openrouter-stream-retry', new Error(`attempt=${nextAttempt} delayMs=${delayMs} code=${error instanceof AIProviderError ? error.code : 'unknown'}`));
          },
        }
      );
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        yield { type: 'stream.aborted' };
        return;
      }
      const providerError = error instanceof AIProviderError
        ? error
        : new AIProviderError('NETWORK_ERROR', 'Could not reach OpenRouter.', { provider: 'OpenRouter' });
      yield streamError(providerError);
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
    let sawData = false;
    let sawDone = false;
    const streamTimeout = createTimeoutSignal(signal, OPENROUTER_STREAM_IDLE_TIMEOUT_MS);

    try {
      if (!response.body) {
        yield streamError(new AIProviderError('INVALID_RESPONSE', 'OpenRouter returned no stream body.', { provider: 'OpenRouter' }));
        return;
      }
      for await (const data of parseSseStream(response.body, streamTimeout.signal)) {
        if (signal.aborted) {
          yield { type: 'stream.aborted' };
          return;
        }
        if (streamTimeout.didTimeout()) {
          yield streamError(new AIProviderError('TIMEOUT', 'OpenRouter stream timed out.', { provider: 'OpenRouter' }));
          return;
        }

        sawData = true;

        if (data === '[DONE]') {
          sawDone = true;
          break;
        }

        let chunk: StreamChunk;
        try {
          chunk = parseStreamChunk(data);
        } catch (error) {
          reportNonFatalError('openrouter-malformed-event', error);
          yield streamError(new AIProviderError('INVALID_RESPONSE', 'OpenRouter returned a malformed stream event.', { provider: 'OpenRouter' }));
          return;
        }

        if (!chunk.error && !chunk.usage && (!chunk.choices || chunk.choices.length === 0)) {
          reportNonFatalError('openrouter-invalid-event-shape', new Error('Missing choices or usage.'));
          yield streamError(new AIProviderError('INVALID_RESPONSE', 'OpenRouter returned an incomplete stream event.', { provider: 'OpenRouter' }));
          return;
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
      if (streamTimeout.didTimeout()) {
        yield streamError(new AIProviderError('TIMEOUT', 'OpenRouter stream timed out.', { provider: 'OpenRouter' }));
        return;
      }
      reportNonFatalError('openrouter-stream', error);
      yield {
        type: 'stream.error',
        error: { code: 'NETWORK_ERROR', message: 'Stream interrupted.' },
      };
      return;
    } finally {
      streamTimeout.cleanup();
    }

    if (signal.aborted) {
      yield { type: 'stream.aborted' };
      return;
    }

    if (streamTimeout.didTimeout()) {
      yield streamError(new AIProviderError('TIMEOUT', 'OpenRouter stream timed out.', { provider: 'OpenRouter' }));
      return;
    }
    if (!sawData || !sawDone) {
      reportNonFatalError('openrouter-incomplete-stream', new Error('Stream ended before [DONE].'));
      yield streamError(new AIProviderError('INVALID_RESPONSE', 'OpenRouter ended the stream unexpectedly.', { provider: 'OpenRouter' }));
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

    yield {
      type: 'stream.completed',
      finishReason: finishReason ?? null,
      usage,
    };
  }
}

export const openRouterInferenceProvider = new OpenRouterProvider();
