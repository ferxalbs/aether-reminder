import { pcm16ToBase64 } from './audio';
import type { VoiceDiagnosticReporter } from './diagnostics';
import { VoiceError } from './errors';
import type {
  RealtimeTranscriptionConfig,
  RealtimeTranscriptionTransport,
  RealtimeTransportEvent,
  RealtimeTransportListener,
} from './types';

interface DataChannelLike {
  readonly bufferedAmount: number;
  readonly readyState: string;
  onopen: ((event?: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onclose: ((event?: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

interface SessionDescriptionLike {
  type: 'offer' | 'answer';
  sdp: string;
}

interface PeerConnectionLike {
  readonly localDescription: { sdp?: string } | null;
  readonly connectionState: string;
  onconnectionstatechange: ((event?: unknown) => void) | null;
  createDataChannel(label: string): DataChannelLike;
  createOffer(): Promise<SessionDescriptionLike>;
  setLocalDescription(description: SessionDescriptionLike): Promise<void>;
  setRemoteDescription(description: SessionDescriptionLike): Promise<void>;
  close(): void;
}

export type RealtimePeerConnectionFactory = () => PeerConnectionLike;

export interface OpenAIRealtimeWebRtcTransportOptions {
  peerConnectionFactory?: RealtimePeerConnectionFactory;
  fetch?: typeof fetch;
  callsUrl?: string;
  connectionTimeoutMs?: number;
  configurationTimeoutMs?: number;
  finalTranscriptTimeoutMs?: number;
  maxQueuedPackets?: number;
  maxDataChannelBufferedBytes?: number;
  packetBytes?: number;
  diagnostics?: VoiceDiagnosticReporter;
}

function defaultPeerConnectionFactory(): PeerConnectionLike {
  // Kept lazy so deterministic Bun tests never evaluate React Native's native entrypoint.
  // Metro still resolves and bundles this statically analyzable native dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const webRtc = require('react-native-webrtc') as {
    RTCPeerConnection: new () => PeerConnectionLike;
  };
  return new webRtc.RTCPeerConnection();
}

function eventError(value: unknown, transcriptionFailure = false): VoiceError {
  const error = value && typeof value === 'object' && 'error' in value
    ? (value as { error?: unknown }).error
    : value;
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const message = typeof record.message === 'string' ? record.message : 'Realtime transcription failed.';
  const providerCode = typeof record.code === 'string' ? record.code : undefined;
  const requestId = typeof record.request_id === 'string' ? record.request_id : undefined;
  const diagnostic = `${providerCode ?? ''} ${message}`.toLowerCase();
  const code = transcriptionFailure ? 'TRANSCRIPTION_FAILED'
    : diagnostic.includes('invalid_api_key') || diagnostic.includes('authentication') ? 'INVALID_CREDENTIAL'
      : diagnostic.includes('tier') ? 'TIER_NOT_SUPPORTED'
        : diagnostic.includes('not authorized') || diagnostic.includes('not have access') || diagnostic.includes('model_not_found') ? 'ACCOUNT_NOT_AUTHORIZED'
          : diagnostic.includes('temporarily unavailable') || diagnostic.includes('server_error') ? 'MODEL_TEMPORARILY_UNAVAILABLE'
            : diagnostic.includes('session') || diagnostic.includes('configuration') || diagnostic.includes('invalid_request') || diagnostic.includes('invalid_model') ? 'SESSION_CONFIGURATION_INVALID'
              : 'TRANSCRIPTION_FAILED';
  return new VoiceError(code, message, {
    cause: value,
    providerError: {
      code: providerCode,
      message,
      type: typeof record.type === 'string' ? record.type : undefined,
      param: typeof record.param === 'string' ? record.param : undefined,
      requestId,
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

async function callError(response: Response): Promise<VoiceError> {
  const requestId = response.headers.get('x-request-id') ?? undefined;
  const raw = await response.text();
  let value: unknown = { error: { message: raw || `Realtime call failed with status ${response.status}.`, request_id: requestId } };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const error = parsed.error && typeof parsed.error === 'object'
      ? { ...(parsed.error as Record<string, unknown>), request_id: requestId }
      : { message: raw, request_id: requestId };
    value = { ...parsed, error };
  } catch {
    // Non-JSON provider responses are retained as the technical cause above.
  }
  return eventError(value);
}

export class OpenAIRealtimeWebRtcTransport implements RealtimeTranscriptionTransport {
  private readonly listeners = new Set<RealtimeTransportListener>();
  private readonly createPeerConnection: RealtimePeerConnectionFactory;
  private readonly request: typeof fetch;
  private peer: PeerConnectionLike | null = null;
  private channel: DataChannelLike | null = null;
  private callAbortController: AbortController | null = null;
  private connected = false;
  private configured = false;
  private expectedClose = false;
  private committed = false;
  private failed = false;
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
  private audioAppendCount = 0;
  private transcriptionDeltaCount = 0;
  private closeDiagnosticEmitted = false;

  constructor(private readonly options: OpenAIRealtimeWebRtcTransportOptions = {}) {
    this.createPeerConnection = options.peerConnectionFactory ?? defaultPeerConnectionFactory;
    this.request = options.fetch ?? fetch;
  }

  subscribe(listener: RealtimeTransportListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RealtimeTransportEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private recordClosed(): void {
    if (this.closeDiagnosticEmitted) return;
    this.closeDiagnosticEmitted = true;
    this.options.diagnostics?.record('data_channel_closed', {
      dataChannelState: 'closed',
      audioAppendCount: this.audioAppendCount,
      transcriptionDeltaCount: this.transcriptionDeltaCount,
    });
  }

  private clearTimers(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.configureTimer) clearTimeout(this.configureTimer);
    if (this.finalTimer) clearTimeout(this.finalTimer);
    if (this.backpressureTimer) clearTimeout(this.backpressureTimer);
    this.connectTimer = this.configureTimer = this.finalTimer = this.backpressureTimer = null;
  }

  private rejectPending(error: VoiceError): void {
    this.rejectConnect?.(error);
    this.rejectConfigure?.(error);
    this.resolveConnect = this.rejectConnect = this.resolveConfigure = this.rejectConfigure = null;
  }

  private releaseTransport(): void {
    this.callAbortController?.abort();
    this.callAbortController = null;
    const channel = this.channel;
    const peer = this.peer;
    this.channel = null;
    this.peer = null;
    channel?.close();
    peer?.close();
    this.connected = false;
    this.configured = false;
  }

  private fail(error: VoiceError): void {
    if (this.failed || this.expectedClose) return;
    this.failed = true;
    const configurationPending = Boolean(this.rejectConfigure);
    this.options.diagnostics?.record(configurationPending
      ? 'session_configuration_rejected'
      : this.connected ? 'data_channel_error' : 'webrtc_call_failed', {
      webRtcCallState: this.connected ? undefined : 'failed',
      dataChannelState: this.connected ? 'error' : undefined,
      sessionConfiguration: configurationPending ? 'rejected' : undefined,
      errorCode: error.providerError?.code ?? error.code,
      requestId: error.providerError?.requestId,
    });
    this.rejectPending(error);
    this.clearTimers();
    this.emit({ type: 'failed', error });
    this.expectedClose = true;
    this.releaseTransport();
    this.queue = [];
    this.partial = new Uint8Array(0);
    this.recordClosed();
  }

  async connect(clientSecret: string): Promise<void> {
    if (this.peer) throw new VoiceError('REALTIME_CONNECT_FAILED', 'Transport is already connected.');
    if (!clientSecret.trim()) throw new VoiceError('REALTIME_AUTH_FAILED', 'Realtime client secret is empty.');
    this.expectedClose = false;
    this.failed = false;
    this.closeDiagnosticEmitted = false;
    this.options.diagnostics?.record('webrtc_call_connecting', {
      webRtcCallState: 'connecting',
      dataChannelState: 'connecting',
    });

    return new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
      this.callAbortController = new AbortController();
      this.connectTimer = setTimeout(() => this.fail(new VoiceError(
        'REALTIME_CONNECT_FAILED',
        'Realtime WebRTC connection timed out.',
      )), this.options.connectionTimeoutMs ?? 15_000);

      void (async () => {
        try {
          const peer = this.createPeerConnection();
          const channel = peer.createDataChannel('oai-events');
          this.peer = peer;
          this.channel = channel;
          peer.onconnectionstatechange = () => {
            const state = peer.connectionState;
            if (state === 'new' || state === 'connecting' || state === 'connected'
              || state === 'disconnected' || state === 'failed' || state === 'closed') {
              this.options.diagnostics?.record('peer_connection_state', { peerConnectionState: state });
            }
            if ((state === 'disconnected' || state === 'failed' || state === 'closed') && !this.expectedClose) {
              this.fail(new VoiceError('REALTIME_CONNECTION_LOST', `Realtime peer connection ${state}.`));
            }
          };
          channel.onmessage = (event) => this.handleMessage(event.data);
          channel.onerror = () => this.fail(new VoiceError(
            this.connected ? 'REALTIME_CONNECTION_LOST' : 'REALTIME_CONNECT_FAILED',
            'Realtime data channel failed.',
          ));
          channel.onclose = () => {
            const expected = this.expectedClose;
            this.connected = false;
            this.configured = false;
            this.recordClosed();
            this.emit({ type: 'closed', expected });
            if (!expected) this.fail(new VoiceError('REALTIME_CONNECTION_LOST', 'Realtime data channel closed unexpectedly.'));
          };
          channel.onopen = () => {
            if (this.expectedClose) return;
            this.connected = true;
            if (this.connectTimer) clearTimeout(this.connectTimer);
            this.connectTimer = null;
            this.resolveConnect?.();
            this.resolveConnect = this.rejectConnect = null;
            this.options.diagnostics?.record('data_channel_open', { dataChannelState: 'open' });
            this.emit({ type: 'connected' });
          };

          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          const sdp = peer.localDescription?.sdp ?? offer.sdp;
          const response = await this.request(
            this.options.callsUrl ?? 'https://api.openai.com/v1/realtime/calls',
            {
              method: 'POST',
              body: sdp,
              headers: {
                Authorization: `Bearer ${clientSecret}`,
                'Content-Type': 'application/sdp',
              },
              signal: this.callAbortController?.signal,
            },
          );
          if (!response.ok) throw await callError(response);
          const requestId = response.headers.get('x-request-id') ?? undefined;
          const answerSdp = await response.text();
          if (!answerSdp.trim()) {
            throw new VoiceError('REALTIME_CONNECT_FAILED', 'Realtime call returned an empty SDP answer.', {
              providerError: { requestId },
            });
          }
          this.options.diagnostics?.record('webrtc_call_succeeded', {
            webRtcCallState: 'succeeded',
            requestId,
          });
          await peer.setRemoteDescription({
            type: 'answer',
            sdp: answerSdp,
          });
        } catch (error) {
          if (this.expectedClose) return;
          this.fail(error instanceof VoiceError
            ? error
            : new VoiceError('REALTIME_CONNECT_FAILED', 'Could not establish the Realtime WebRTC call.', { cause: error }));
        }
      })();
    });
  }

  async configure(config: RealtimeTranscriptionConfig): Promise<void> {
    if (!this.channel || !this.connected || this.channel.readyState !== 'open') {
      throw new VoiceError('REALTIME_CONNECT_FAILED', 'Realtime data channel is not connected.');
    }
    this.options.diagnostics?.record('session_configuration_sent', {
      sessionConfiguration: 'pending',
      requestedSampleRate: config.sampleRate,
    });
    return new Promise<void>((resolve, reject) => {
      this.resolveConfigure = resolve;
      this.rejectConfigure = reject;
      this.channel?.send(JSON.stringify({ type: 'session.update', session: transcriptionConfig(config) }));
      this.configureTimer = setTimeout(() => this.fail(new VoiceError(
        'REALTIME_CONNECT_FAILED',
        'Realtime session configuration timed out.',
      )), this.options.configurationTimeoutMs ?? 10_000);
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
          this.options.diagnostics?.record('session_configuration_accepted', { sessionConfiguration: 'accepted' });
          this.scheduleFlush();
          break;
        case 'conversation.item.input_audio_transcription.delta':
          if (typeof event.item_id !== 'string' || typeof event.delta !== 'string') {
            throw new VoiceError('TRANSCRIPTION_FAILED', 'Malformed transcript delta.');
          }
          this.transcriptionDeltaCount += 1;
          if (this.transcriptionDeltaCount === 1 || this.transcriptionDeltaCount % 10 === 0) {
            this.options.diagnostics?.record('transcription_delta_progress', {
              transcriptionDeltaCount: this.transcriptionDeltaCount,
            });
          }
          this.emit({ type: 'speechDelta', itemId: event.item_id, delta: event.delta });
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (typeof event.item_id !== 'string' || typeof event.transcript !== 'string') {
            throw new VoiceError('TRANSCRIPTION_FAILED', 'Malformed completed transcript.');
          }
          if (this.finalTimer) clearTimeout(this.finalTimer);
          this.finalTimer = null;
          this.options.diagnostics?.record('transcription_completed', {
            transcriptionDeltaCount: this.transcriptionDeltaCount,
            transcriptionCompleted: true,
          });
          this.emit({ type: 'completed', itemId: event.item_id, transcript: event.transcript });
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
    if (!this.channel || !this.connected || !this.configured || this.channel.readyState !== 'open') return;
    if (this.channel.bufferedAmount > (this.options.maxDataChannelBufferedBytes ?? 9_600)) {
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
      this.channel.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm16ToBase64(packet) }));
      this.audioAppendCount += 1;
      if (this.audioAppendCount === 1 || this.audioAppendCount % 25 === 0) {
        this.options.diagnostics?.record('audio_append_progress', { audioAppendCount: this.audioAppendCount });
      }
      this.scheduleFlush();
      return;
    }
    if (this.commitPending) {
      this.commitPending = false;
      this.channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      this.options.diagnostics?.record('commit_sent', {
        audioAppendCount: this.audioAppendCount,
        commitSent: true,
      });
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
    this.finish('cancelled', true);
  }

  close(): void {
    this.finish('complete', false);
  }

  private finish(reason: string, clearAudio: boolean): void {
    if (this.expectedClose) return;
    this.expectedClose = true;
    this.rejectPending(new VoiceError('CANCELLED', `Realtime transport ${reason}.`));
    this.clearTimers();
    this.queue = [];
    this.partial = new Uint8Array(0);
    if (clearAudio && this.channel?.readyState === 'open') {
      try {
        this.channel.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
      } catch {
        // Closing the data channel and peer connection is authoritative.
      }
    }
    this.releaseTransport();
    this.recordClosed();
  }
}
