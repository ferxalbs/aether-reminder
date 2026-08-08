import { AIProviderError, getAIErrorMessage } from '@/services/ai/providers';
import { TranscriptionError, type TranscriptionErrorCode } from './errors';
import { pcm16ArrayBufferToBase64 } from './audio';

export const OPENAI_REALTIME_TRANSCRIPTION_MODEL = 'gpt-realtime-whisper';
export const OPENAI_REALTIME_TRANSCRIPTION_SAMPLE_RATE = 24000;
export const OPENAI_REALTIME_TRANSCRIPTION_CHANNELS = 1;
const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
const OPENAI_REALTIME_URL = `${OPENAI_API_BASE_URL}/realtime?model=${encodeURIComponent(OPENAI_REALTIME_TRANSCRIPTION_MODEL)}`;

type SocketMessage = { data: unknown };

interface RealtimeSocket {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: SocketMessage) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

type SocketFactory = (url: string, apiKey: string) => RealtimeSocket;

export interface OpenAIRealtimeSessionOptions {
  onEvent: (event: unknown) => void;
  onError: (error: TranscriptionError) => void;
  socketFactory?: SocketFactory;
}

export interface OpenAIRealtimeSession {
  connect: () => Promise<void>;
  appendPcm16: (data: ArrayBuffer) => void;
  commit: () => void;
  cancel: () => void;
  close: () => void;
}

function requireOpenAiKey(apiKey?: string): string {
  const key = apiKey?.trim();
  if (!key) throw new TranscriptionError('MISSING_API_KEY', 'An OpenAI API key is required.');
  return key;
}

function defaultSocketFactory(url: string, apiKey: string): RealtimeSocket {
  const SocketConstructor = globalThis.WebSocket as unknown as new (
    url: string,
    protocols?: string | string[],
    options?: { headers?: Record<string, string> }
  ) => RealtimeSocket;
  if (!SocketConstructor) throw new TranscriptionError('AUDIO_UNAVAILABLE', 'WebSocket is unavailable.');
  // React Native's native WebSocket supports the third options argument. This is
  // the server-side standard-key contract used on-device because this app has no
  // developer-controlled token service; production hardening is documented as a limitation.
  return new SocketConstructor(url, undefined, { headers: { Authorization: `Bearer ${apiKey}` } });
}

function socketDataToString(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    throw new TranscriptionError('INVALID_EVENT', 'Binary realtime events are not supported.');
  }
  throw new TranscriptionError('INVALID_EVENT', 'Realtime event payload was not text.');
}

function mapRealtimeErrorCode(value: unknown): TranscriptionErrorCode {
  if (typeof value !== 'string') return 'SESSION_FAILED';
  const normalized = value.toLowerCase();
  if (normalized.includes('auth') || normalized.includes('api_key')) return 'INVALID_API_KEY';
  if (normalized.includes('rate')) return 'RATE_LIMITED';
  if (normalized.includes('audio')) return 'INVALID_AUDIO';
  return 'SESSION_FAILED';
}

function openAiRequestError(status: number): AIProviderError {
  const code = status === 401 || status === 403
    ? 'INVALID_API_KEY'
    : status === 429
      ? 'RATE_LIMITED'
      : status >= 500
        ? 'PROVIDER_UNAVAILABLE'
        : 'INVALID_REQUEST';
  return new AIProviderError(code, getAIErrorMessage(new AIProviderError(code, '', { provider: 'OpenAI' })), {
    status,
    provider: 'OpenAI',
  });
}

export function createOpenAIRealtimeTranscriptionSession(
  apiKey: string,
  options: OpenAIRealtimeSessionOptions
): OpenAIRealtimeSession {
  const key = requireOpenAiKey(apiKey);
  const createSocket = options.socketFactory ?? defaultSocketFactory;
  let socket: RealtimeSocket | null = null;
  let closed = false;
  let connected = false;
  let committed = false;
  let failed = false;
  let connectPromise: Promise<void> | null = null;
  let resolveConnect: (() => void) | null = null;
  let rejectConnect: ((error: TranscriptionError) => void) | null = null;

  const fail = (error: TranscriptionError) => {
    if (closed || failed) return;
    failed = true;
    closed = true;
    connected = false;
    rejectConnect?.(error);
    resolveConnect = null;
    rejectConnect = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    }
    socket?.close(1011, 'realtime session failed');
    socket = null;
    options.onError(error);
  };

  const send = (event: Record<string, unknown>) => {
    if (!socket || !connected || closed) {
      throw new TranscriptionError('SESSION_FAILED', 'The OpenAI realtime session is not connected.');
    }
    try {
      socket.send(JSON.stringify(event));
    } catch {
      throw new TranscriptionError('NETWORK_ERROR', 'Audio could not be sent to OpenAI.');
    }
  };

  const attachSocket = () => {
    try {
      socket = createSocket(OPENAI_REALTIME_URL, key);
    } catch (error) {
      const mapped = error instanceof TranscriptionError
        ? error
        : new TranscriptionError('NETWORK_ERROR', 'Could not connect to OpenAI realtime transcription.');
      fail(mapped);
      throw mapped;
    }

    socket.onopen = () => {
      try {
        socket?.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'transcription',
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: OPENAI_REALTIME_TRANSCRIPTION_SAMPLE_RATE },
                transcription: { model: OPENAI_REALTIME_TRANSCRIPTION_MODEL },
                turn_detection: null,
              },
            },
          },
        }));
      } catch {
        fail(new TranscriptionError('NETWORK_ERROR', 'The OpenAI realtime session could not be configured.'));
      }
    };

    socket.onmessage = (message) => {
      try {
        const text = socketDataToString(message.data);
        const event = JSON.parse(text) as unknown;
        if (typeof event === 'object' && event !== null && 'type' in event) {
          const eventType = (event as { type?: unknown }).type;
          if (eventType === 'session.updated') {
            resolveConnect?.();
            resolveConnect = null;
            rejectConnect = null;
          } else if (eventType === 'error') {
            const nestedError = (event as { error?: { code?: unknown } }).error;
            const code = mapRealtimeErrorCode(nestedError?.code);
            options.onEvent(event);
            fail(new TranscriptionError(code, 'OpenAI rejected the realtime transcription session.'));
            return;
          }
        }
        options.onEvent(event);
      } catch (error) {
        fail(error instanceof TranscriptionError
          ? error
          : new TranscriptionError('INVALID_EVENT', 'OpenAI returned malformed realtime JSON.'));
      }
    };
    socket.onerror = () => fail(new TranscriptionError('NETWORK_ERROR', 'OpenAI realtime connection failed.'));
    socket.onclose = () => {
      if (!closed) fail(new TranscriptionError('NETWORK_ERROR', 'OpenAI realtime connection closed unexpectedly.'));
    };
  };

  return {
    connect: () => {
      if (connectPromise) return connectPromise;
      connectPromise = new Promise<void>((resolve, reject) => {
        resolveConnect = () => {
          connected = true;
          resolve();
        };
        rejectConnect = reject;
        attachSocket();
      });
      return connectPromise;
    },
    appendPcm16: (data) => {
      if (data.byteLength === 0) return;
      if (data.byteLength % 2 !== 0) throw new TranscriptionError('INVALID_AUDIO', 'PCM16 audio buffer is incomplete.');
      send({ type: 'input_audio_buffer.append', audio: pcm16ArrayBufferToBase64(data) });
    },
    commit: () => {
      if (committed) return;
      committed = true;
      send({ type: 'input_audio_buffer.commit' });
    },
    cancel: () => {
      if (closed) return;
      closed = true;
      connected = false;
      rejectConnect?.(new TranscriptionError('CANCELLED', 'Voice capture was cancelled.'));
      resolveConnect = null;
      rejectConnect = null;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
      }
      socket?.close(1000, 'cancelled');
      socket = null;
    },
    close: () => {
      if (closed) return;
      closed = true;
      connected = false;
      rejectConnect?.(new TranscriptionError('CANCELLED', 'Voice capture was closed.'));
      resolveConnect = null;
      rejectConnect = null;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
      }
      socket?.close(1000, 'complete');
      socket = null;
    },
  };
}

/** Validate an OpenAI key against the current realtime transcription model only. */
export async function testOpenAIRealtimeConnection(apiKey: string): Promise<{ provider: 'OpenAI'; connected: true }> {
  const key = requireOpenAiKey(apiKey);
  let response: Response;
  try {
    response = await fetch(`${OPENAI_API_BASE_URL}/models/${encodeURIComponent(OPENAI_REALTIME_TRANSCRIPTION_MODEL)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch {
    throw new AIProviderError('NETWORK_ERROR', 'Could not reach OpenAI.', { provider: 'OpenAI' });
  }
  if (!response.ok) throw openAiRequestError(response.status);
  return { provider: 'OpenAI', connected: true };
}
