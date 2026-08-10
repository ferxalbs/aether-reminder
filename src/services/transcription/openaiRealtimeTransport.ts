import { pcm16ToBase64 } from './audio';
import { VoiceError } from './errors';
import type {
  RealtimeTranscriptionConfig,
  RealtimeTranscriptionTransport,
  RealtimeTransportEvent,
  RealtimeTransportListener,
} from './types';

interface SocketLike {
  readonly bufferedAmount: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type RealtimeSocketFactory = (url: string, clientSecret: string) => SocketLike;

export interface OpenAIRealtimeTransportOptions {
  model?: string;
  socketFactory?: RealtimeSocketFactory;
  connectionTimeoutMs?: number;
  configurationTimeoutMs?: number;
  finalTranscriptTimeoutMs?: number;
  maxQueuedPackets?: number;
  maxSocketBufferedBytes?: number;
  packetBytes?: number;
}

function defaultSocketFactory(url: string, clientSecret: string): SocketLike {
  const Constructor = globalThis.WebSocket as unknown as new (
    socketUrl: string,
    protocols?: string | string[],
    options?: { headers?: Record<string, string> },
  ) => SocketLike;
  if (!Constructor) throw new VoiceError('REALTIME_CONNECT_FAILED', 'WebSocket is unavailable.');
  return new Constructor(url, undefined, {
    headers: { Authorization: `Bearer ${clientSecret}` },
  });
}

function eventError(value: unknown, transcriptionFailure = false): VoiceError {
  const error = value && typeof value === 'object' && 'error' in value
    ? (value as { error?: unknown }).error
    : value;
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const message = typeof record.message === 'string' ? record.message : 'Realtime transcription failed.';
  const providerCode = typeof record.code === 'string' ? record.code : undefined;
  const diagnostic = `${providerCode ?? ''} ${message}`.toLowerCase();
  const code = transcriptionFailure ? 'TRANSCRIPTION_FAILED'
    : diagnostic.includes('invalid_api_key') || diagnostic.includes('authentication') ? 'INVALID_CREDENTIAL'
      : diagnostic.includes('tier') ? 'TIER_NOT_SUPPORTED'
        : diagnostic.includes('not authorized') || diagnostic.includes('not have access') || diagnostic.includes('model_not_found') ? 'ACCOUNT_NOT_AUTHORIZED'
          : diagnostic.includes('temporarily unavailable') || diagnostic.includes('server_error') ? 'MODEL_TEMPORARILY_UNAVAILABLE'
            : diagnostic.includes('session') || diagnostic.includes('configuration') || diagnostic.includes('invalid_request') ? 'SESSION_CONFIGURATION_INVALID'
              : 'TRANSCRIPTION_FAILED';
  return new VoiceError(code, message, {
    cause: value,
    providerError: {
      code: providerCode,
      message,
      type: typeof record.type === 'string' ? record.type : undefined,
      param: typeof record.param === 'string' ? record.param : undefined,
    },
  });
}

function transcriptionConfig(config: RealtimeTranscriptionConfig): Record<string, unknown> {
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

export class OpenAIRealtimeWebSocketTransport implements RealtimeTranscriptionTransport {
  private readonly listeners = new Set<RealtimeTransportListener>();
  private readonly createSocket: RealtimeSocketFactory;
  private socket: SocketLike | null = null;
  private model = '';
  private connected = false;
  private configured = false;
  private expectedClose = false;
  private committed = false;
  private queue: ArrayBuffer[] = [];
  private partial = new Uint8Array(0);
  private flushPending = false;
  private commitPending = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private configureTimer: ReturnType<typeof setTimeout> | null = null;
  private finalTimer: ReturnType<typeof setTimeout> | null = null;
  private backpressureTimer: ReturnType<typeof setTimeout> | null = null;
  private resolveConnect: (() => void) | null = null;
  private rejectConnect: ((error: VoiceError) => void) | null = null;
  private resolveConfigure: (() => void) | null = null;
  private rejectConfigure: ((error: VoiceError) => void) | null = null;

  constructor(private readonly options: OpenAIRealtimeTransportOptions = {}) {
    this.createSocket = options.socketFactory ?? defaultSocketFactory;
  }

  subscribe(listener: RealtimeTransportListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RealtimeTransportEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private clearTimers(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.configureTimer) clearTimeout(this.configureTimer);
    if (this.finalTimer) clearTimeout(this.finalTimer);
    if (this.backpressureTimer) clearTimeout(this.backpressureTimer);
    this.connectTimer = this.configureTimer = this.finalTimer = this.backpressureTimer = null;
  }

  private fail(error: VoiceError): void {
    this.rejectConnect?.(error);
    this.rejectConfigure?.(error);
    this.resolveConnect = this.rejectConnect = this.resolveConfigure = this.rejectConfigure = null;
    this.clearTimers();
    this.emit({ type: 'failed', error });
    this.expectedClose = true;
    this.socket?.close(1011, 'realtime failure');
    this.socket = null;
    this.connected = false;
    this.configured = false;
    this.queue = [];
    this.partial = new Uint8Array(0);
  }

  async connect(clientSecret: string): Promise<void> {
    if (this.socket) throw new VoiceError('REALTIME_CONNECT_FAILED', 'Transport is already connected.');
    if (!clientSecret.trim()) throw new VoiceError('REALTIME_AUTH_FAILED', 'Realtime client secret is empty.');
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.options.model ?? 'gpt-live-transcribe')}`;
    return new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
      try {
        this.socket = this.createSocket(url, clientSecret);
      } catch (error) {
        this.fail(error instanceof VoiceError
          ? error
          : new VoiceError('REALTIME_CONNECT_FAILED', 'Could not create the realtime WebSocket.', { cause: error }));
        return;
      }
      this.socket.onopen = () => {
        this.connected = true;
        if (this.connectTimer) clearTimeout(this.connectTimer);
        this.connectTimer = null;
        this.resolveConnect?.();
        this.resolveConnect = this.rejectConnect = null;
        this.emit({ type: 'connected' });
      };
      this.socket.onmessage = (message) => this.handleMessage(message.data);
      this.socket.onerror = () => this.fail(new VoiceError(
        this.connected ? 'REALTIME_CONNECTION_LOST' : 'REALTIME_CONNECT_FAILED',
        'Realtime WebSocket failed.',
      ));
      this.socket.onclose = () => {
        const expected = this.expectedClose;
        this.socket = null;
        this.connected = false;
        this.configured = false;
        this.emit({ type: 'closed', expected });
        if (!expected) this.fail(new VoiceError('REALTIME_CONNECTION_LOST', 'Realtime WebSocket closed unexpectedly.'));
      };
      this.connectTimer = setTimeout(() => {
        this.fail(new VoiceError('REALTIME_CONNECT_FAILED', 'Realtime WebSocket connection timed out.'));
      }, this.options.connectionTimeoutMs ?? 10_000);
    });
  }

  async configure(config: RealtimeTranscriptionConfig): Promise<void> {
    if (!this.socket || !this.connected) {
      throw new VoiceError('REALTIME_CONNECT_FAILED', 'Transport is not connected.');
    }
    this.model = config.model;
    return new Promise<void>((resolve, reject) => {
      this.resolveConfigure = resolve;
      this.rejectConfigure = reject;
      this.socket?.send(JSON.stringify({ type: 'session.update', session: transcriptionConfig(config) }));
      this.configureTimer = setTimeout(() => {
        this.fail(new VoiceError('REALTIME_CONNECT_FAILED', 'Realtime session configuration timed out.'));
      }, this.options.configurationTimeoutMs ?? 10_000);
    });
  }

  private handleMessage(data: unknown): void {
    try {
      if (typeof data !== 'string') {
        throw new VoiceError('TRANSCRIPTION_FAILED', 'Realtime server returned a non-text event.');
      }
      const event = JSON.parse(data) as Record<string, unknown>;
      switch (event.type) {
        case 'session.updated':
          this.configured = true;
          if (this.configureTimer) clearTimeout(this.configureTimer);
          this.configureTimer = null;
          this.resolveConfigure?.();
          this.resolveConfigure = this.rejectConfigure = null;
          this.scheduleFlush();
          break;
        case 'conversation.item.input_audio_transcription.delta':
          if (typeof event.item_id === 'string' && typeof event.delta === 'string') {
            this.emit({ type: 'speechDelta', itemId: event.item_id, delta: event.delta });
          } else {
            throw new VoiceError('TRANSCRIPTION_FAILED', 'Malformed transcript delta.');
          }
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (typeof event.item_id === 'string' && typeof event.transcript === 'string') {
            if (this.finalTimer) clearTimeout(this.finalTimer);
            this.finalTimer = null;
            this.emit({ type: 'completed', itemId: event.item_id, transcript: event.transcript });
          } else {
            throw new VoiceError('TRANSCRIPTION_FAILED', 'Malformed completed transcript.');
          }
          break;
        case 'conversation.item.input_audio_transcription.failed':
          this.fail(eventError(event, true));
          break;
        case 'error':
          this.fail(eventError(event));
          break;
        default:
          break;
      }
    } catch (error) {
      this.fail(error instanceof VoiceError
        ? error
        : new VoiceError('TRANSCRIPTION_FAILED', 'Realtime event parsing failed.', { cause: error }));
    }
  }

  appendPcm(data: ArrayBuffer): void {
    if (!this.connected || !this.configured || this.committed) {
      throw new VoiceError('REALTIME_CONNECTION_LOST', 'Realtime transport cannot accept audio.');
    }
    if (data.byteLength === 0) return;
    if (data.byteLength % 2 !== 0) {
      throw new VoiceError('AUDIO_FORMAT_UNSUPPORTED', 'PCM16 append contains an incomplete sample.');
    }
    const packetBytes = this.options.packetBytes ?? 4_800;
    const incoming = new Uint8Array(data);
    const combined = new Uint8Array(this.partial.byteLength + incoming.byteLength);
    combined.set(this.partial);
    combined.set(incoming, this.partial.byteLength);
    let offset = 0;
    while (combined.byteLength - offset >= packetBytes) {
      this.enqueue(combined.slice(offset, offset + packetBytes).buffer);
      offset += packetBytes;
    }
    this.partial = combined.slice(offset);
    this.scheduleFlush();
  }

  private enqueue(packet: ArrayBuffer): void {
    if (this.queue.length >= (this.options.maxQueuedPackets ?? 32)) {
      const error = new VoiceError('REALTIME_CONNECTION_LOST', 'Realtime audio backpressure limit was exceeded.');
      this.fail(error);
      throw error;
    }
    this.queue.push(packet);
  }

  private scheduleFlush(): void {
    if (this.flushPending) return;
    this.flushPending = true;
    queueMicrotask(() => {
      this.flushPending = false;
      this.flush();
    });
  }

  private flush(): void {
    if (!this.socket || !this.connected || !this.configured) return;
    if (this.socket.bufferedAmount > (this.options.maxSocketBufferedBytes ?? 9_600)) {
      if (!this.backpressureTimer) {
        this.backpressureTimer = setTimeout(() => {
          this.backpressureTimer = null;
          this.scheduleFlush();
        }, 20);
      }
      return;
    }
    const packet = this.queue.shift();
    if (packet) {
      this.socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm16ToBase64(packet) }));
      this.scheduleFlush();
      return;
    }
    if (this.commitPending) {
      this.commitPending = false;
      this.socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      this.finalTimer = setTimeout(() => this.fail(new VoiceError(
        'TRANSCRIPTION_TIMEOUT',
        'Final transcript timed out.',
      )), this.options.finalTranscriptTimeoutMs ?? 15_000);
    }
  }

  commit(): void {
    if (this.committed) return;
    if (!this.connected || !this.configured) {
      throw new VoiceError('REALTIME_CONNECTION_LOST', 'Realtime transport is unavailable at commit.');
    }
    this.committed = true;
    if (this.partial.byteLength) {
      this.enqueue(this.partial.buffer);
      this.partial = new Uint8Array(0);
    }
    this.commitPending = true;
    this.scheduleFlush();
  }

  cancel(): void {
    if (this.expectedClose) return;
    this.expectedClose = true;
    const error = new VoiceError('CANCELLED', 'Realtime transport was cancelled.');
    this.rejectConnect?.(error);
    this.rejectConfigure?.(error);
    this.resolveConnect = this.rejectConnect = this.resolveConfigure = this.rejectConfigure = null;
    this.clearTimers();
    this.queue = [];
    this.partial = new Uint8Array(0);
    if (this.socket && this.connected) {
      try {
        this.socket.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
      } catch {
        // Closing the socket is the authoritative cancellation operation.
      }
    }
    this.socket?.close(1000, 'cancelled');
    this.socket = null;
    this.connected = false;
    this.configured = false;
  }

  close(): void {
    if (this.expectedClose) return;
    this.expectedClose = true;
    const error = new VoiceError('CANCELLED', 'Realtime transport was closed.');
    this.rejectConnect?.(error);
    this.rejectConfigure?.(error);
    this.resolveConnect = this.rejectConnect = this.resolveConfigure = this.rejectConfigure = null;
    this.clearTimers();
    this.queue = [];
    this.partial = new Uint8Array(0);
    this.socket?.close(1000, 'complete');
    this.socket = null;
    this.connected = false;
    this.configured = false;
  }
}
