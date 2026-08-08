import { AIProviderError, getAIErrorMessage } from '@/services/ai/providers';
import { TranscriptionError, type TranscriptionErrorCode } from './errors';
import { pcm16ArrayBufferToBase64 } from './audio';
import { createTimeoutSignal, retryWithBackoff } from '@/lib/retry';
import { reportNonFatalError } from '@/lib/nonFatalError';

export const OPENAI_REALTIME_TRANSCRIPTION_MODEL = 'gpt-realtime-whisper';
export const OPENAI_REALTIME_TRANSCRIPTION_SAMPLE_RATE = 24000;
export const OPENAI_REALTIME_TRANSCRIPTION_CHANNELS = 1;
const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
const OPENAI_REALTIME_URL = `${OPENAI_API_BASE_URL}/realtime?model=${encodeURIComponent(OPENAI_REALTIME_TRANSCRIPTION_MODEL)}`;
const OPENAI_CONNECTION_TEST_TIMEOUT_MS = 15_000;

type SocketMessage = { data: unknown };

interface RealtimeSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
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
  connectionTimeoutMs?: number;
  sessionTimeoutMs?: number;
  finalTranscriptTimeoutMs?: number;
  maxQueuedPackets?: number;
  maxSocketBufferedBytes?: number;
  transportPaceMs?: number;
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
      : status === 408 || status === 504
        ? 'TIMEOUT'
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
  let connectionTimer: ReturnType<typeof setTimeout> | null = null;
  let sessionTimer: ReturnType<typeof setTimeout> | null = null;
  let finalTimer: ReturnType<typeof setTimeout> | null = null;
  const packetBytes = 4800; // 100 ms of 24 kHz mono PCM16
  const packetQueue: ArrayBuffer[] = [];
  let partialPacket = new Uint8Array(0);
  let flushScheduled = false;
  let transportTimer: ReturnType<typeof setTimeout> | null = null;
  let commitRequested = false;
  const scheduleFlush = () => {
    if (closed || transportTimer) return;
    transportTimer = setTimeout(() => {
      transportTimer = null;
      flushPackets();
    }, options.transportPaceMs ?? 20);
  };
  const sendCommit = () => {
    commitRequested = false;
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = null;
    finalTimer = setTimeout(() => fail(new TranscriptionError('TIMEOUT', 'Final transcript timed out.')), options.finalTranscriptTimeoutMs ?? 15000);
    send({ type: 'input_audio_buffer.commit' });
  };
  const flushPackets = () => {
    flushScheduled = false;
    try {
      if (closed || !socket || !connected) return;
      const maxBufferedBytes = options.maxSocketBufferedBytes ?? packetBytes * 2;
      if (socket.bufferedAmount > maxBufferedBytes) {
        scheduleFlush();
        return;
      }
      const packet = packetQueue.shift();
      if (packet) {
        send({ type: 'input_audio_buffer.append', audio: pcm16ArrayBufferToBase64(packet) });
        if (!packetQueue.length && commitRequested) sendCommit();
        else if (packetQueue.length) scheduleFlush();
        return;
      }
      if (commitRequested) sendCommit();
    } catch (error) {
      fail(error instanceof TranscriptionError ? error : new TranscriptionError('NETWORK_ERROR', 'Audio could not be sent to OpenAI.'));
    }
  };
  const clearTimers = () => {
    if (connectionTimer) clearTimeout(connectionTimer);
    if (sessionTimer) clearTimeout(sessionTimer);
    if (finalTimer) clearTimeout(finalTimer);
    if (transportTimer) clearTimeout(transportTimer);
    connectionTimer = sessionTimer = finalTimer = null;
    transportTimer = null;
  };

  const fail = (error: TranscriptionError) => {
    if (closed || failed) return;
    failed = true;
    clearTimers();
    packetQueue.length = 0;
    partialPacket = new Uint8Array(0);
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
            if (connectionTimer) clearTimeout(connectionTimer);
            connectionTimer = null;
            sessionTimer = setTimeout(() => fail(new TranscriptionError('TIMEOUT', 'Realtime transcription session timed out.')), options.sessionTimeoutMs ?? 120000);
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
        connectionTimer = setTimeout(() => fail(new TranscriptionError('TIMEOUT', 'Realtime transcription connection timed out.')), options.connectionTimeoutMs ?? 10000);
      });
      return connectPromise;
    },
    appendPcm16: (data) => {
      if (data.byteLength === 0) return;
      if (data.byteLength % 2 !== 0) throw new TranscriptionError('INVALID_AUDIO', 'PCM16 audio buffer is incomplete.');
      if (committed) throw new TranscriptionError('SESSION_FAILED', 'Audio cannot be appended after commit.');
      const incoming = new Uint8Array(data);
      const combined = new Uint8Array(partialPacket.byteLength + incoming.byteLength);
      combined.set(partialPacket);
      combined.set(incoming, partialPacket.byteLength);
      let offset = 0;
      while (combined.byteLength - offset >= packetBytes) {
        if (packetQueue.length >= (options.maxQueuedPackets ?? 32)) {
          fail(new TranscriptionError('NETWORK_ERROR', 'Realtime audio transport could not keep up.'));
          return;
        }
        packetQueue.push(combined.slice(offset, offset + packetBytes).buffer);
        offset += packetBytes;
      }
      partialPacket = combined.slice(offset);
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(() => {
          flushPackets();
        });
      }
    },
    commit: () => {
      if (closed) throw new TranscriptionError('SESSION_FAILED', 'The OpenAI realtime session is closed.');
      if (committed) return;
      committed = true;
      if (partialPacket.byteLength) {
        if (packetQueue.length >= (options.maxQueuedPackets ?? 32)) {
          fail(new TranscriptionError('NETWORK_ERROR', 'Realtime audio transport could not keep up.'));
          return;
        }
        packetQueue.push(partialPacket.buffer);
        partialPacket = new Uint8Array(0);
      }
      commitRequested = true;
      flushPackets();
    },
    cancel: () => {
      if (closed) return;
      closed = true;
      clearTimers();
      packetQueue.length = 0;
      partialPacket = new Uint8Array(0);
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
      clearTimers();
      packetQueue.length = 0;
      partialPacket = new Uint8Array(0);
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
  await retryWithBackoff(
    async () => {
      const timeout = createTimeoutSignal(undefined, OPENAI_CONNECTION_TEST_TIMEOUT_MS);
      try {
        let response: Response;
        try {
          response = await fetch(`${OPENAI_API_BASE_URL}/models/${encodeURIComponent(OPENAI_REALTIME_TRANSCRIPTION_MODEL)}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${key}` },
            signal: timeout.signal,
          });
        } catch {
          throw new AIProviderError(
            timeout.didTimeout() ? 'TIMEOUT' : 'NETWORK_ERROR',
            timeout.didTimeout() ? 'OpenAI connection test timed out.' : 'Could not reach OpenAI.',
            { provider: 'OpenAI' }
          );
        }
        if (!response.ok) throw openAiRequestError(response.status);
      } finally {
        timeout.cleanup();
      }
    },
    {
      shouldRetry: (error) => error instanceof AIProviderError
        && ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE'].includes(error.code),
      onRetry: (nextAttempt, delayMs, error) => {
        reportNonFatalError('openai-connection-retry', new Error(`attempt=${nextAttempt} delayMs=${delayMs} code=${error instanceof AIProviderError ? error.code : 'unknown'}`));
      },
    }
  );
  return { provider: 'OpenAI', connected: true };
}
