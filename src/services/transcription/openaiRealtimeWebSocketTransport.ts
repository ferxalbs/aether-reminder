import { pcm16ToBase64 } from './audio';
import type { VoiceDiagnosticReporter } from './diagnostics';
import { VoiceError, type VoiceErrorCode } from './errors';
import {
  buildRealtimeSessionPayload,
  buildRealtimeWebSocketUrl,
} from './protocol';
import {
  REALTIME_PCM_SAMPLE_RATE,
  REALTIME_TRANSCRIPTION_MODEL,
  type RealtimeTranscriptionConfig,
  type RealtimeTranscriptionTransport,
  type RealtimeTransportEvent,
  type RealtimeTransportListener,
} from './types';

const OPEN_STATE = 1;

export type RealtimeWebSocketState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'configuring'
  | 'ready'
  | 'committing'
  | 'finalizing'
  | 'closing'
  | 'closed'
  | 'failed';

export interface RealtimeWebSocketLike {
  readonly readyState: number;
  readonly bufferedAmount: number;
  onopen: ((event?: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onclose: ((event?: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type RealtimeWebSocketFactory = (
  url: string,
  protocols: string[],
) => RealtimeWebSocketLike;

export interface OpenAIRealtimeWebSocketTransportOptions {
  webSocketFactory?: RealtimeWebSocketFactory;
  webSocketUrl?: string;
  connectionTimeoutMs?: number;
  configurationTimeoutMs?: number;
  finalTranscriptTimeoutMs?: number;
  backpressureTimeoutMs?: number;
  backpressurePollMs?: number;
  maxQueuedPackets?: number;
  maxWebSocketBufferedBytes?: number;
  packetBytes?: number;
  diagnostics?: VoiceDiagnosticReporter;
}

const transitions: Record<RealtimeWebSocketState, readonly RealtimeWebSocketState[]> = {
  idle: ['connecting'],
  connecting: ['connected', 'closing', 'failed'],
  connected: ['configuring', 'closing', 'failed'],
  configuring: ['ready', 'closing', 'failed'],
  ready: ['committing', 'closing', 'failed'],
  committing: ['finalizing', 'closing', 'failed'],
  finalizing: ['closing', 'failed'],
  closing: ['closed'],
  closed: [],
  failed: [],
};

function defaultWebSocketFactory(url: string, protocols: string[]): RealtimeWebSocketLike {
  // React Native's global WebSocket supports the standard subprotocol argument.
  // The ephemeral credential is sent in that subprotocol, never as a long-lived API key.
  return new WebSocket(url, protocols) as unknown as RealtimeWebSocketLike;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function providerError(value: unknown, transcriptionFailure = false): VoiceError {
  const event = asRecord(value);
  const error = asRecord(event.error);
  const code = typeof error.code === 'string' ? error.code : undefined;
  const message = typeof error.message === 'string'
    ? error.message
    : 'OpenAI realtime transcription failed.';
  const type = typeof error.type === 'string' ? error.type : undefined;
  const param = typeof error.param === 'string' ? error.param : undefined;
  const requestId = typeof error.request_id === 'string'
    ? error.request_id
    : typeof event.request_id === 'string' ? event.request_id : undefined;
  const diagnostic = `${code ?? ''} ${type ?? ''} ${message}`.toLowerCase();

  let voiceCode: VoiceErrorCode = 'TRANSCRIPTION_FAILED';
  if (!transcriptionFailure) {
    if (diagnostic.includes('invalid_api_key') || diagnostic.includes('authentication')
      || diagnostic.includes('credential')) {
      voiceCode = 'INVALID_CREDENTIAL';
    } else if (diagnostic.includes('tier')) {
      voiceCode = 'TIER_NOT_SUPPORTED';
    } else if (diagnostic.includes('not authorized') || diagnostic.includes('not have access')
      || diagnostic.includes('model_not_found') || diagnostic.includes('insufficient_quota')) {
      voiceCode = 'ACCOUNT_NOT_AUTHORIZED';
    } else if (diagnostic.includes('temporarily') || diagnostic.includes('server_error')
      || diagnostic.includes('rate_limit')) {
      voiceCode = 'MODEL_TEMPORARILY_UNAVAILABLE';
    } else if (diagnostic.includes('session') || diagnostic.includes('configuration')
      || diagnostic.includes('invalid_request') || diagnostic.includes('unsupported')
      || diagnostic.includes('invalid_model')) {
      voiceCode = 'SESSION_CONFIGURATION_INVALID';
    } else if (diagnostic.includes('invalid_event') || diagnostic.includes('protocol')) {
      voiceCode = 'REALTIME_PROTOCOL_ERROR';
    }
  }

  return new VoiceError(voiceCode, message, {
    cause: value,
    providerError: { code, message, type, param, requestId },
  });
}

function protocolError(message: string, cause?: unknown): VoiceError {
  return new VoiceError('REALTIME_PROTOCOL_ERROR', message, { cause });
}

function validateTranscriptionConfig(config: RealtimeTranscriptionConfig): void {
  if (config.model !== REALTIME_TRANSCRIPTION_MODEL
    || config.sampleRate !== REALTIME_PCM_SAMPLE_RATE
    || config.turnDetection !== null) {
    throw new VoiceError(
      'SESSION_CONFIGURATION_INVALID',
      'Realtime transcription requires gpt-live-transcribe, PCM16 at 24000 Hz, and manual turn detection.',
    );
  }
}

export class OpenAIRealtimeWebSocketTransport implements RealtimeTranscriptionTransport {
  private readonly listeners = new Set<RealtimeTransportListener>();
  private readonly createWebSocket: RealtimeWebSocketFactory;
  private readonly options: Required<Pick<
    OpenAIRealtimeWebSocketTransportOptions,
    | 'connectionTimeoutMs'
    | 'configurationTimeoutMs'
    | 'finalTranscriptTimeoutMs'
    | 'backpressureTimeoutMs'
    | 'backpressurePollMs'
    | 'maxQueuedPackets'
    | 'maxWebSocketBufferedBytes'
    | 'packetBytes'
  >> & OpenAIRealtimeWebSocketTransportOptions;
  private socket: RealtimeWebSocketLike | null = null;
  private state: RealtimeWebSocketState = 'idle';
  private generation = 0;
  private expectedClose = false;
  private committed = false;
  private commitPending = false;
  private flushPending = false;
  private queue: ArrayBuffer[] = [];
  private queuedAudioBytes = 0;
  private partial = new Uint8Array(0);
  private completedItems = new Set<string>();
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private configureTimer: ReturnType<typeof setTimeout> | null = null;
  private finalTimer: ReturnType<typeof setTimeout> | null = null;
  private backpressureDeadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private backpressurePollTimer: ReturnType<typeof setTimeout> | null = null;
  private resolveConnect: (() => void) | null = null;
  private rejectConnect: ((error: VoiceError) => void) | null = null;
  private resolveConfigure: (() => void) | null = null;
  private rejectConfigure: ((error: VoiceError) => void) | null = null;
  private audioAppendCount = 0;
  private audioBytesSubmitted = 0;
  private transcriptionDeltaCount = 0;
  private closeDiagnosticEmitted = false;

  constructor(options: OpenAIRealtimeWebSocketTransportOptions = {}) {
    this.createWebSocket = options.webSocketFactory ?? defaultWebSocketFactory;
    this.options = {
      ...options,
      connectionTimeoutMs: options.connectionTimeoutMs ?? 15_000,
      configurationTimeoutMs: options.configurationTimeoutMs ?? 10_000,
      finalTranscriptTimeoutMs: options.finalTranscriptTimeoutMs ?? 15_000,
      backpressureTimeoutMs: options.backpressureTimeoutMs ?? 1_000,
      backpressurePollMs: options.backpressurePollMs ?? 20,
      maxQueuedPackets: options.maxQueuedPackets ?? 32,
      maxWebSocketBufferedBytes: options.maxWebSocketBufferedBytes ?? 256_000,
      packetBytes: options.packetBytes ?? 4_800,
    };
    if (this.options.packetBytes <= 0 || this.options.packetBytes % 2 !== 0) {
      throw new VoiceError('AUDIO_FORMAT_UNSUPPORTED', 'Realtime packet size must be a positive even byte count.');
    }
    if (this.options.maxQueuedPackets <= 0 || this.options.maxWebSocketBufferedBytes <= 0) {
      throw new VoiceError('REALTIME_BACKPRESSURE', 'Realtime queue limits must be positive.');
    }
  }

  get currentState(): RealtimeWebSocketState {
    return this.state;
  }

  subscribe(listener: RealtimeTransportListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RealtimeTransportEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private transition(next: RealtimeWebSocketState): void {
    if (!transitions[this.state].includes(next)) {
      throw protocolError(`Illegal realtime transport transition: ${this.state} -> ${next}.`);
    }
    this.state = next;
  }

  private clearTimers(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.configureTimer) clearTimeout(this.configureTimer);
    if (this.finalTimer) clearTimeout(this.finalTimer);
    if (this.backpressureDeadlineTimer) clearTimeout(this.backpressureDeadlineTimer);
    if (this.backpressurePollTimer) clearTimeout(this.backpressurePollTimer);
    this.connectTimer = null;
    this.configureTimer = null;
    this.finalTimer = null;
    this.backpressureDeadlineTimer = null;
    this.backpressurePollTimer = null;
  }

  private rejectPending(error: VoiceError): void {
    this.rejectConnect?.(error);
    this.rejectConfigure?.(error);
    this.resolveConnect = null;
    this.rejectConnect = null;
    this.resolveConfigure = null;
    this.rejectConfigure = null;
  }

  private recordWebSocketClosed(): void {
    if (this.closeDiagnosticEmitted) return;
    this.closeDiagnosticEmitted = true;
    this.options.diagnostics?.record('websocket_closed', {
      webSocketState: 'closed',
      audioAppendCount: this.audioAppendCount,
      audioBytesSubmitted: this.audioBytesSubmitted,
      transcriptionDeltaCount: this.transcriptionDeltaCount,
    });
  }

  private fail(error: VoiceError): void {
    if (this.state === 'failed' || this.state === 'closed' || this.state === 'closing') return;
    const socket = this.socket;
    this.socket = null;
    this.generation += 1;
    this.expectedClose = true;
    const configurationPending = this.state === 'configuring' || Boolean(this.rejectConfigure);
    this.clearTimers();
    this.queue = [];
    this.queuedAudioBytes = 0;
    this.partial = new Uint8Array(0);
    this.transition('failed');
    this.rejectPending(error);
    this.options.diagnostics?.record(configurationPending
      ? 'session_configuration_rejected'
      : 'session_failed', {
      webSocketState: socket ? 'failed' : undefined,
      sessionConfiguration: configurationPending ? 'rejected' : undefined,
      errorCode: error.providerError?.code ?? error.code,
      requestId: error.providerError?.requestId,
    });
    this.emit({ type: 'failed', error });
    if (socket) {
      try {
        socket.close();
      } catch {
        // The transport is already failed; native close errors are not actionable.
      }
    }
    this.recordWebSocketClosed();
    if (socket) this.emit({ type: 'closed', expected: true });
  }

  async connect(clientSecret: string): Promise<void> {
    if (this.state !== 'idle') {
      throw new VoiceError('REALTIME_CONNECT_FAILED', 'Realtime transport can only connect from idle.');
    }
    const secret = clientSecret.trim();
    if (!secret) throw new VoiceError('REALTIME_AUTH_FAILED', 'Realtime client secret is empty.');

    this.transition('connecting');
    this.expectedClose = false;
    this.closeDiagnosticEmitted = false;
    this.options.diagnostics?.record('websocket_connecting', { webSocketState: 'connecting' });

    const generation = ++this.generation;
    return new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
      this.connectTimer = setTimeout(() => this.fail(new VoiceError(
        'REALTIME_TIMEOUT',
        'Realtime WebSocket connection timed out.',
      )), this.options.connectionTimeoutMs);

      try {
        const url = this.options.webSocketUrl
          ?? buildRealtimeWebSocketUrl(REALTIME_TRANSCRIPTION_MODEL);
        const socket = this.createWebSocket(url, ['realtime', `openai-insecure-api-key.${secret}`]);
        this.socket = socket;
        socket.onopen = () => {
          if (this.socket !== socket || this.generation !== generation || this.state !== 'connecting') return;
          try {
            this.transition('connected');
          } catch (error) {
            this.fail(error instanceof VoiceError ? error : protocolError('Could not enter connected state.', error));
            return;
          }
          if (this.connectTimer) clearTimeout(this.connectTimer);
          this.connectTimer = null;
          this.resolveConnect?.();
          this.resolveConnect = null;
          this.rejectConnect = null;
          this.options.diagnostics?.record('websocket_open', { webSocketState: 'open' });
          this.emit({ type: 'connected' });
        };
        socket.onmessage = (event) => {
          if (this.socket !== socket || this.generation !== generation) return;
          this.handleMessage(event.data);
        };
        socket.onerror = () => {
          if (this.socket !== socket || this.generation !== generation) return;
          this.fail(new VoiceError(
            this.state === 'connecting' ? 'REALTIME_CONNECT_FAILED' : 'REALTIME_CONNECTION_LOST',
            'Realtime WebSocket transport failed.',
          ));
        };
        socket.onclose = () => {
          if (this.socket !== socket || this.generation !== generation) return;
          this.handleSocketClose(socket);
        };
      } catch (error) {
        this.fail(error instanceof VoiceError
          ? error
          : new VoiceError('REALTIME_CONNECT_FAILED', 'Could not create the realtime WebSocket.', { cause: error }));
      }
    });
  }

  private handleSocketClose(socket: RealtimeWebSocketLike): void {
    if (this.socket !== socket) return;
    const expected = this.expectedClose || this.state === 'closing';
    this.socket = null;
    this.generation += 1;
    this.clearTimers();
    this.recordWebSocketClosed();
    if (expected) {
      if (this.state === 'closing') this.transition('closed');
      this.emit({ type: 'closed', expected: true });
      return;
    }
    this.emit({ type: 'closed', expected: false });
    this.fail(new VoiceError('REALTIME_CONNECTION_LOST', 'Realtime WebSocket closed unexpectedly.'));
  }

  async configure(config: RealtimeTranscriptionConfig): Promise<void> {
    if (this.state !== 'connected' || !this.socket || this.socket.readyState !== OPEN_STATE) {
      throw new VoiceError('REALTIME_CONNECT_FAILED', 'Realtime WebSocket is not connected.');
    }
    try {
      validateTranscriptionConfig(config);
      this.transition('configuring');
    } catch (error) {
      const voiceError = error instanceof VoiceError ? error : protocolError('Invalid realtime configuration.', error);
      this.fail(voiceError);
      throw voiceError;
    }

    this.options.diagnostics?.record('session_configuration_sent', {
      sessionConfiguration: 'pending',
      requestedSampleRate: config.sampleRate,
    });
    const event = { type: 'session.update', session: buildRealtimeSessionPayload(config) };
    return new Promise<void>((resolve, reject) => {
      this.resolveConfigure = resolve;
      this.rejectConfigure = reject;
      this.configureTimer = setTimeout(() => this.fail(new VoiceError(
        'REALTIME_TIMEOUT',
        'Realtime session configuration timed out.',
      )), this.options.configurationTimeoutMs);
      try {
        this.send(event);
      } catch (error) {
        const voiceError = error instanceof VoiceError ? error : new VoiceError(
          'REALTIME_CONNECTION_LOST',
          'Realtime session configuration could not be sent.',
          { cause: error },
        );
        this.fail(voiceError);
      }
    });
  }

  private send(value: Record<string, unknown>): void {
    this.sendSerialized(JSON.stringify(value));
  }

  private sendSerialized(serialized: string): void {
    if (!this.socket || this.socket.readyState !== OPEN_STATE) {
      throw new VoiceError('REALTIME_CONNECTION_LOST', 'Realtime WebSocket is not open.');
    }
    try {
      this.socket.send(serialized);
    } catch (error) {
      throw new VoiceError('REALTIME_CONNECTION_LOST', 'Realtime WebSocket send failed.', { cause: error });
    }
  }

  private handleMessage(data: unknown): void {
    try {
      if (typeof data !== 'string') throw protocolError('Realtime server returned a non-text event.');
      const parsed: unknown = JSON.parse(data);
      const event = asRecord(parsed);
      if (typeof event.type !== 'string') throw protocolError('Realtime server event has no type.');

      switch (event.type) {
        case 'session.created': {
          if (!event.session || typeof event.session !== 'object' || Array.isArray(event.session)) {
            throw protocolError('Realtime session.created event has no session object.');
          }
          const session = asRecord(event.session);
          if (session.type !== 'transcription') {
            throw protocolError('Realtime server created a non-transcription session.');
          }
          this.options.diagnostics?.record('session_created');
          return;
        }
        case 'session.updated': {
          if (this.state !== 'configuring') throw protocolError('Unexpected realtime session.updated event.');
          if (!event.session || typeof event.session !== 'object' || Array.isArray(event.session)) {
            throw protocolError('Realtime session.updated event has no session object.');
          }
          const session = asRecord(event.session);
          if (session.type !== 'transcription') {
            throw protocolError('Realtime server acknowledged a non-transcription session.');
          }
          if (this.configureTimer) clearTimeout(this.configureTimer);
          this.configureTimer = null;
          this.transition('ready');
          this.resolveConfigure?.();
          this.resolveConfigure = null;
          this.rejectConfigure = null;
          this.options.diagnostics?.record('session_configuration_accepted', {
            sessionConfiguration: 'accepted',
          });
          this.scheduleFlush();
          return;
        }
        case 'conversation.item.input_audio_transcription.delta': {
          if (this.state !== 'finalizing') throw protocolError('Transcript delta arrived before commit.');
          if (typeof event.item_id !== 'string' || !event.item_id
            || typeof event.content_index !== 'number' || !Number.isInteger(event.content_index)
            || typeof event.delta !== 'string') {
            throw protocolError('Malformed transcript delta event.');
          }
          this.transcriptionDeltaCount += 1;
          if (this.transcriptionDeltaCount === 1 || this.transcriptionDeltaCount % 10 === 0) {
            this.options.diagnostics?.record('transcription_delta_progress', {
              transcriptionDeltaCount: this.transcriptionDeltaCount,
            });
          }
          this.emit({ type: 'speechDelta', itemId: event.item_id, delta: event.delta });
          return;
        }
        case 'conversation.item.input_audio_transcription.completed': {
          if (this.state !== 'finalizing') throw protocolError('Transcript completion arrived before commit.');
          if (typeof event.item_id !== 'string' || !event.item_id
            || typeof event.content_index !== 'number' || !Number.isInteger(event.content_index)
            || typeof event.transcript !== 'string') {
            throw protocolError('Malformed completed transcript event.');
          }
          if (this.completedItems.has(event.item_id)) return;
          this.completedItems.add(event.item_id);
          if (this.finalTimer) clearTimeout(this.finalTimer);
          this.finalTimer = null;
          this.options.diagnostics?.record('transcription_completed', {
            transcriptionDeltaCount: this.transcriptionDeltaCount,
            transcriptionCompleted: true,
          });
          this.emit({ type: 'completed', itemId: event.item_id, transcript: event.transcript });
          return;
        }
        case 'conversation.item.input_audio_transcription.failed':
          this.fail(providerError(event, true));
          return;
        case 'error':
          this.fail(providerError(event));
          return;
        case 'input_audio_buffer.committed':
          return;
        default:
          // The provider may add harmless lifecycle events. Only known contract
          // violations above are fatal; forward-compatible events are ignored.
          return;
      }
    } catch (error) {
      this.fail(error instanceof VoiceError
        ? error
        : protocolError('Realtime event parsing failed.', error));
    }
  }

  appendPcm(data: ArrayBuffer): void {
    if (this.state !== 'ready' || this.committed) {
      throw new VoiceError('REALTIME_PROTOCOL_ERROR', 'PCM can only be appended after session configuration.');
    }
    if (data.byteLength === 0) return;
    if (data.byteLength % 2 !== 0) {
      throw new VoiceError('AUDIO_FORMAT_UNSUPPORTED', 'PCM16 append contains an incomplete sample.');
    }

    const incoming = new Uint8Array(data);
    const combined = new Uint8Array(this.partial.byteLength + incoming.byteLength);
    combined.set(this.partial);
    combined.set(incoming, this.partial.byteLength);
    let offset = 0;
    while (combined.byteLength - offset >= this.options.packetBytes) {
      this.enqueue(combined.slice(offset, offset + this.options.packetBytes).buffer);
      offset += this.options.packetBytes;
    }
    this.partial = combined.slice(offset);
    this.scheduleFlush();
  }

  private enqueue(packet: ArrayBuffer): void {
    if (this.queue.length >= this.options.maxQueuedPackets) {
      const error = new VoiceError('REALTIME_BACKPRESSURE', 'Realtime audio queue limit was exceeded.');
      this.fail(error);
      throw error;
    }
    this.queue.push(packet);
    this.queuedAudioBytes += packet.byteLength;
  }

  private scheduleFlush(): void {
    if (this.flushPending) return;
    this.flushPending = true;
    queueMicrotask(() => {
      this.flushPending = false;
      this.flush();
    });
  }

  private clearBackpressureWait(): void {
    if (this.backpressureDeadlineTimer) clearTimeout(this.backpressureDeadlineTimer);
    if (this.backpressurePollTimer) clearTimeout(this.backpressurePollTimer);
    this.backpressureDeadlineTimer = null;
    this.backpressurePollTimer = null;
  }

  private waitForBackpressure(): void {
    if (!this.backpressureDeadlineTimer) {
      this.backpressureDeadlineTimer = setTimeout(() => {
        this.backpressureDeadlineTimer = null;
        this.backpressurePollTimer = null;
        this.fail(new VoiceError('REALTIME_BACKPRESSURE', 'Realtime WebSocket could not drain its send buffer.'));
      }, this.options.backpressureTimeoutMs);
    }
    if (!this.backpressurePollTimer) {
      this.backpressurePollTimer = setTimeout(() => {
        this.backpressurePollTimer = null;
        this.scheduleFlush();
      }, this.options.backpressurePollMs);
    }
  }

  private flush(): void {
    if (!this.socket || this.socket.readyState !== OPEN_STATE
      || (this.state !== 'ready' && this.state !== 'committing')) return;

    const packet = this.queue[0];
    if (packet) {
      const payload = JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm16ToBase64(packet) });
      if (this.socket.bufferedAmount + payload.length > this.options.maxWebSocketBufferedBytes) {
        this.waitForBackpressure();
        return;
      }
      this.clearBackpressureWait();
      try {
        this.sendSerialized(payload);
      } catch (error) {
        this.fail(error instanceof VoiceError ? error : new VoiceError(
          'REALTIME_CONNECTION_LOST',
          'Realtime audio append could not be sent.',
          { cause: error },
        ));
        return;
      }
      this.queue.shift();
      this.queuedAudioBytes -= packet.byteLength;
      this.audioAppendCount += 1;
      this.audioBytesSubmitted += packet.byteLength;
      if (this.audioAppendCount === 1 || this.audioAppendCount % 25 === 0) {
        this.options.diagnostics?.record('audio_append_progress', {
          audioAppendCount: this.audioAppendCount,
          audioBytesSubmitted: this.audioBytesSubmitted,
        });
      }
      this.scheduleFlush();
      return;
    }

    if (!this.commitPending) return;
    const commitPayload = JSON.stringify({ type: 'input_audio_buffer.commit' });
    if (this.socket.bufferedAmount + commitPayload.length > this.options.maxWebSocketBufferedBytes) {
      this.waitForBackpressure();
      return;
    }
    this.clearBackpressureWait();
    this.finalTimer = setTimeout(() => this.fail(new VoiceError(
      'TRANSCRIPTION_TIMEOUT',
      'Final transcript timed out.',
    )), this.options.finalTranscriptTimeoutMs);
    this.transition('finalizing');
    try {
      this.sendSerialized(commitPayload);
    } catch (error) {
      this.fail(error instanceof VoiceError ? error : new VoiceError(
        'REALTIME_CONNECTION_LOST',
        'Realtime commit could not be sent.',
        { cause: error },
      ));
      return;
    }
    this.commitPending = false;
    this.options.diagnostics?.record('commit_sent', {
      audioAppendCount: this.audioAppendCount,
      audioBytesSubmitted: this.audioBytesSubmitted,
      commitSent: true,
    });
  }

  commit(): void {
    if (this.committed) return;
    if (this.state !== 'ready' || !this.socket || this.socket.readyState !== OPEN_STATE) {
      throw new VoiceError('REALTIME_PROTOCOL_ERROR', 'Realtime commit requires a ready WebSocket session.');
    }
    if (this.queue.length === 0 && this.partial.byteLength === 0 && this.audioBytesSubmitted === 0) {
      throw new VoiceError('EMPTY_TRANSCRIPT', 'Realtime commit has no PCM audio.');
    }
    this.committed = true;
    if (this.partial.byteLength) {
      this.enqueue(this.partial.buffer);
      this.partial = new Uint8Array(0);
    }
    this.commitPending = true;
    this.transition('committing');
    this.scheduleFlush();
  }

  cancel(): void {
    this.finish(true);
  }

  close(): void {
    this.finish(false);
  }

  private finish(clearAudio: boolean): void {
    if (this.state === 'idle' || this.state === 'closed' || this.state === 'closing' || this.state === 'failed') return;
    const socket = this.socket;
    this.socket = null;
    this.generation += 1;
    this.expectedClose = true;
    this.clearTimers();
    this.rejectPending(new VoiceError('CANCELLED', 'Realtime transport closed.'));
    this.queue = [];
    this.queuedAudioBytes = 0;
    this.partial = new Uint8Array(0);
    this.commitPending = false;
    this.completedItems.clear();
    this.transition('closing');
    if (clearAudio && socket?.readyState === OPEN_STATE) {
      try {
        socket.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
      } catch {
        // The socket close below is authoritative for cancellation.
      }
    }
    try {
      socket?.close();
    } catch {
      // The transport is already closing.
    }
    this.transition('closed');
    this.recordWebSocketClosed();
    this.emit({ type: 'closed', expected: true });
  }
}
