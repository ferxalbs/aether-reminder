import { VoiceError, type VoiceErrorCode } from './errors';
import type {
  RealtimeClientSecret,
  RealtimeClientSecretProvider,
  RealtimeTranscriptionConfig,
} from './types';
import { defaultRealtimeTranscriptionConfig } from './types';

const OPENAI_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';

function sessionPayload(config: RealtimeTranscriptionConfig): Record<string, unknown> {
  const transcription: Record<string, unknown> = {
    model: config.model,
    prompt: config.context.prompt,
  };
  if (config.context.languages?.length) transcription.languages = config.context.languages;
  if (config.context.keywords?.length) transcription.keywords = config.context.keywords;
  return {
    type: 'transcription',
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: config.sampleRate },
        transcription,
        turn_detection: config.turnDetection,
      },
    },
  };
}

function parseSecret(value: unknown, requestId?: string): RealtimeClientSecret {
  if (!value || typeof value !== 'object') {
    throw new VoiceError('REALTIME_AUTH_FAILED', 'OpenAI returned an invalid client secret.');
  }
  const payload = value as {
    value?: unknown;
    expires_at?: unknown;
    client_secret?: { value?: unknown; expires_at?: unknown };
  };
  const secret = payload.client_secret ?? payload;
  if (typeof secret.value !== 'string' || !secret.value
    || typeof secret.expires_at !== 'number') {
    throw new VoiceError('REALTIME_AUTH_FAILED', 'OpenAI returned an invalid client secret.');
  }
  return {
    value: secret.value,
    expiresAt: secret.expires_at,
    modelAccess: 'MODEL_EXISTS',
    ...(requestId ? { requestId } : {}),
  };
}

interface OpenAIErrorPayload {
  error?: {
    code?: unknown;
    message?: unknown;
    type?: unknown;
    param?: unknown;
  };
}

function accessErrorCode(status: number, payload: OpenAIErrorPayload): VoiceErrorCode {
  const error = payload.error;
  const diagnostic = `${String(error?.code ?? '')} ${String(error?.message ?? '')} ${String(error?.type ?? '')}`.toLowerCase();
  if (status === 401 || diagnostic.includes('invalid_api_key') || diagnostic.includes('invalid credential')) {
    return 'INVALID_CREDENTIAL';
  }
  if (diagnostic.includes('free tier') || diagnostic.includes('usage tier') || diagnostic.includes('tier not supported')) {
    return 'TIER_NOT_SUPPORTED';
  }
  if (status === 403 || diagnostic.includes('not authorized') || diagnostic.includes('not have access')
    || diagnostic.includes('model_not_found') || diagnostic.includes('insufficient_quota')) {
    return 'ACCOUNT_NOT_AUTHORIZED';
  }
  if (status >= 500 || diagnostic.includes('temporarily unavailable') || diagnostic.includes('server_error')) {
    return 'MODEL_TEMPORARILY_UNAVAILABLE';
  }
  if (status === 400 || diagnostic.includes('invalid_request') || diagnostic.includes('unsupported')) {
    return 'SESSION_CONFIGURATION_INVALID';
  }
  return 'REALTIME_AUTH_FAILED';
}

/** BYOK adapter: the user's SecureStore key mints a short-lived client secret over HTTPS. */
export class OpenAIByokClientSecretProvider implements RealtimeClientSecretProvider {
  constructor(private readonly standardApiKey: string) {}

  async create(config: RealtimeTranscriptionConfig, signal?: AbortSignal): Promise<RealtimeClientSecret> {
    const apiKey = this.standardApiKey.trim();
    if (!apiKey) throw new VoiceError('REALTIME_AUTH_FAILED', 'An OpenAI API key is required.');
    let response: Response;
    try {
      response = await fetch(OPENAI_CLIENT_SECRETS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session: sessionPayload(config) }),
        signal,
      });
    } catch (error) {
      throw new VoiceError('REALTIME_AUTH_FAILED', 'Could not request an OpenAI client secret.', { cause: error });
    }
    if (!response.ok) {
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      let payload: OpenAIErrorPayload = {};
      try {
        payload = await response.json() as OpenAIErrorPayload;
      } catch {
        // HTTP status and request id still provide a typed failure.
      }
      const provider = payload.error;
      const providerError = {
        code: typeof provider?.code === 'string' ? provider.code : undefined,
        message: typeof provider?.message === 'string' ? provider.message : undefined,
        type: typeof provider?.type === 'string' ? provider.type : undefined,
        param: typeof provider?.param === 'string' ? provider.param : undefined,
        requestId: response.headers.get('x-request-id') ?? undefined,
      };
      throw new VoiceError(accessErrorCode(response.status, payload), providerError.message
        ?? `OpenAI client-secret request failed (${response.status}).`, {
        cause: payload,
        status: response.status,
        retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined,
        providerError,
      });
    }
    try {
      return parseSecret(await response.json(), response.headers.get('x-request-id') ?? undefined);
    } catch (error) {
      if (error instanceof VoiceError) throw error;
      throw new VoiceError('REALTIME_AUTH_FAILED', 'OpenAI returned invalid client-secret JSON.', { cause: error });
    }
  }
}

export async function testOpenAIRealtimeConnection(
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ provider: 'OpenAI'; connected: true; modelAccess: 'MODEL_EXISTS' }> {
  const secret = await new OpenAIByokClientSecretProvider(apiKey).create(
    // Keep Settings validation aligned with the actual voice session configuration.
    defaultRealtimeTranscriptionConfig,
    signal,
  );
  return { provider: 'OpenAI', connected: true, modelAccess: secret.modelAccess };
}

export { accessErrorCode as classifyOpenAIModelAccessError, sessionPayload as buildRealtimeSessionPayload };
