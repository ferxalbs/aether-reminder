import { Pcm16StreamNormalizer, pcm16AudioLevel, type NativePcmBuffer } from './audio';
import type { AudioSessionGateway } from './audioSession';
import {
  createDevelopmentVoiceDiagnostics,
  type VoiceDiagnosticReporter,
} from './diagnostics';
import { VoiceError, isRetryableVoiceErrorCode, toVoiceError } from './errors';
import { ensureMicrophonePermission, type MicrophonePermissionGateway } from './permissions';
import { TranscriptReconciler } from './reconciler';
import {
  VoiceStateMachine,
  isFailureState,
  type VoiceSnapshot,
} from './stateMachine';
import type {
  NativeAudioCapture,
  RealtimeClientSecret,
  RealtimeClientSecretProvider,
  RealtimeTranscriptionConfig,
  RealtimeTranscriptionTransport,
  RealtimeTransportEvent,
} from './types';

export interface VoiceSessionDependencies {
  permission: MicrophonePermissionGateway;
  audioSession: AudioSessionGateway;
  capture: NativeAudioCapture;
  clientSecrets: RealtimeClientSecretProvider;
  createTransport: (diagnostics: VoiceDiagnosticReporter) => RealtimeTranscriptionTransport;
  config: RealtimeTranscriptionConfig;
  onFinalTranscript: (transcript: string) => Promise<void> | void;
  onAudioLevel?: (level: number) => void;
  onTechnicalError?: (error: unknown) => void;
  maxPreconnectBytes?: number;
  createDiagnostics?: () => VoiceDiagnosticReporter;
}

export type VoiceSnapshotListener = (snapshot: VoiceSnapshot) => void;

export class VoiceSession {
  private readonly machine = new VoiceStateMachine();
  private readonly listeners = new Set<VoiceSnapshotListener>();
  private readonly owner = Symbol('aether-voice-session');
  private readonly reconciler = new TranscriptReconciler();
  private transport: RealtimeTranscriptionTransport | null = null;
  private unsubscribeTransport: (() => void) | null = null;
  private normalizer = new Pcm16StreamNormalizer();
  private preconnectAudio: ArrayBuffer[] = [];
  private preconnectBytes = 0;
  private audioBytes = 0;
  private pcmChunksReceived = 0;
  private parserHandoffCount = 0;
  private nativeFormatRecorded = false;
  private runId = 0;
  private stopping = false;
  private captureStarted = false;
  private audioSessionActive = false;
  private abortController: AbortController | null = null;
  private cleanupPromise: Promise<void> = Promise.resolve();
  private lastFailure: VoiceError | null = null;
  private diagnostics: VoiceDiagnosticReporter | null = null;

  constructor(private readonly dependencies: VoiceSessionDependencies) {}

  get snapshot(): VoiceSnapshot {
    return this.machine.snapshot;
  }

  subscribe(listener: VoiceSnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  private publish(snapshot = this.snapshot): void {
    for (const listener of this.listeners) listener(snapshot);
  }

  private transition(...args: Parameters<VoiceStateMachine['transition']>): void {
    this.publish(this.machine.transition(...args));
  }

  private update(...args: Parameters<VoiceStateMachine['update']>): void {
    this.publish(this.machine.update(...args));
  }

  async start(): Promise<void> {
    const state = this.snapshot.state;
    if (!['idle', 'review', 'committed'].includes(state) && !isFailureState(state)) return;
    await this.cleanupPromise;
    const runId = ++this.runId;
    this.stopping = false;
    this.lastFailure = null;
    this.reconciler.reset();
    this.normalizer = new Pcm16StreamNormalizer(this.dependencies.config.sampleRate);
    this.preconnectAudio = [];
    this.preconnectBytes = 0;
    this.audioBytes = 0;
    this.pcmChunksReceived = 0;
    this.parserHandoffCount = 0;
    this.nativeFormatRecorded = false;
    this.publish(this.machine.resetForStart());
    this.abortController = new AbortController();
    this.diagnostics = this.dependencies.createDiagnostics?.() ?? createDevelopmentVoiceDiagnostics();
    this.diagnostics.record('session_started', {
      permissionState: this.snapshot.permission,
      requestedSampleRate: this.dependencies.config.sampleRate,
    });

    try {
      this.diagnostics.record('permission_checking', { permissionState: 'checking' });
      await ensureMicrophonePermission(this.dependencies.permission);
      if (runId !== this.runId) return;
      this.update({ permission: 'granted' });
      this.diagnostics.record('permission_result', { permissionState: 'granted' });
      this.transition('connecting');

      await this.dependencies.audioSession.activate(this.owner);
      this.audioSessionActive = true;
      if (runId !== this.runId) return;

      try {
        await this.dependencies.capture.start((buffer) => this.handleBuffer(runId, buffer));
        this.captureStarted = true;
        this.diagnostics.record('microphone_stream_started', { microphoneStreamStarted: true });
      } catch (error) {
        this.diagnostics.record('microphone_stream_failed', {
          microphoneStreamStarted: false,
          errorCode: 'AUDIO_STREAM_START_FAILED',
        });
        throw new VoiceError('AUDIO_STREAM_START_FAILED', 'Native PCM stream failed to start.', { cause: error });
      }
      if (runId !== this.runId) return;

      this.diagnostics.record('credential_request_started', { credentialRequest: 'pending' });
      let secret: RealtimeClientSecret;
      try {
        secret = await this.dependencies.clientSecrets.create(
          this.dependencies.config,
          this.abortController.signal,
        );
        this.diagnostics.record('credential_request_succeeded', {
          credentialRequest: 'succeeded',
          requestId: secret.requestId,
        });
      } catch (error) {
        const voiceError = toVoiceError(error, 'REALTIME_AUTH_FAILED');
        this.diagnostics.record('credential_request_failed', {
          credentialRequest: 'failed',
          errorCode: voiceError.providerError?.code ?? voiceError.code,
          requestId: voiceError.providerError?.requestId,
        });
        throw error;
      }
      if (runId !== this.runId) return;

      const transport = this.dependencies.createTransport(this.diagnostics);
      this.transport = transport;
      this.unsubscribeTransport = transport.subscribe((event) => this.handleTransportEvent(runId, event));
      await transport.connect(secret.value);
      await transport.configure(this.dependencies.config);
      if (runId !== this.runId) return;

      for (const packet of this.preconnectAudio) transport.appendPcm(packet);
      this.preconnectAudio = [];
      this.preconnectBytes = 0;
      this.transition('listening');
    } catch (error) {
      if (runId !== this.runId) return;
      await this.fail(toVoiceError(error, this.captureStarted ? 'REALTIME_CONNECT_FAILED' : 'AUDIO_STREAM_START_FAILED'));
    }
  }

  private handleBuffer(runId: number, buffer: NativePcmBuffer): void {
    if (runId !== this.runId || this.stopping) return;
    if (this.snapshot.state !== 'connecting' && this.snapshot.state !== 'listening') return;
    try {
      this.pcmChunksReceived += 1;
      if (!this.nativeFormatRecorded) {
        this.nativeFormatRecorded = true;
        this.diagnostics?.record('audio_format_detected', {
          actualSampleRate: buffer.sampleRate,
          channelCount: buffer.channels,
          resamplingActive: buffer.sampleRate !== this.dependencies.config.sampleRate || buffer.channels !== 1,
        });
      }
      const normalized = this.normalizer.push(buffer);
      if (!normalized.byteLength) return;
      this.audioBytes += normalized.byteLength;
      if (this.pcmChunksReceived === 1 || this.pcmChunksReceived % 25 === 0) {
        this.diagnostics?.record('pcm_progress', {
          pcmChunksReceived: this.pcmChunksReceived,
          pcmBytesProduced: this.audioBytes,
        });
      }
      this.dependencies.onAudioLevel?.(pcm16AudioLevel(normalized));
      if (this.transport && this.snapshot.state === 'listening') {
        this.transport.appendPcm(normalized);
        return;
      }
      const limit = this.dependencies.maxPreconnectBytes ?? 384_000;
      if (this.preconnectBytes + normalized.byteLength > limit) {
        throw new VoiceError('REALTIME_CONNECT_FAILED', 'Connection could not keep up with microphone startup.');
      }
      this.preconnectAudio.push(normalized);
      this.preconnectBytes += normalized.byteLength;
    } catch (error) {
      void this.fail(toVoiceError(error, 'RESAMPLE_FAILED'));
    }
  }

  private handleTransportEvent(runId: number, event: RealtimeTransportEvent): void {
    if (runId !== this.runId) return;
    if (event.type === 'speechDelta') {
      this.update(this.reconciler.delta(this.snapshot, event.itemId, event.delta));
      return;
    }
    if (event.type === 'completed') {
      void this.handleCompleted(runId, event.itemId, event.transcript);
      return;
    }
    if (event.type === 'failed') {
      void this.fail(event.error);
      return;
    }
    if (event.type === 'closed' && !event.expected
      && !isFailureState(this.snapshot.state) && this.snapshot.state !== 'cancelled') {
      void this.fail(new VoiceError('REALTIME_CONNECTION_LOST', 'Realtime transport closed unexpectedly.'));
    }
  }

  async stop(): Promise<void> {
    if (this.stopping || this.snapshot.state !== 'listening') return;
    this.stopping = true;
    this.transition('committing');
    try {
      await this.dependencies.capture.stop();
      this.captureStarted = false;
      const tail = this.normalizer.flush();
      if (tail.byteLength) {
        this.audioBytes += tail.byteLength;
        this.transport?.appendPcm(tail);
      }
      if (!this.transport) throw new VoiceError('REALTIME_CONNECTION_LOST', 'Transport disappeared before commit.');
      if (this.audioBytes === 0) throw new VoiceError('EMPTY_TRANSCRIPT', 'No PCM audio was captured.');
      this.transport.commit();
      this.transition('finalizing');
    } catch (error) {
      await this.fail(toVoiceError(error, 'TRANSCRIPTION_FAILED'));
    }
  }

  private async handleCompleted(runId: number, itemId: string, transcript: string): Promise<void> {
    if (runId !== this.runId || this.snapshot.state !== 'finalizing') return;
    this.update(this.reconciler.completed(itemId, transcript));
    if (!transcript.trim()) {
      await this.fail(new VoiceError('EMPTY_TRANSCRIPT', 'Completed transcript was empty.'));
      return;
    }
    this.transition('parsing');
    await this.cleanup(false);
    if (runId !== this.runId) return;
    try {
      // The completed event is authoritative; pass it unchanged to the existing pipeline.
      this.parserHandoffCount += 1;
      this.diagnostics?.record('parser_handoff', {
        parserHandoffCount: this.parserHandoffCount,
      });
      await this.dependencies.onFinalTranscript(transcript);
      this.transition('review');
      this.diagnostics?.complete({ terminalState: 'review' });
    } catch (error) {
      await this.fail(new VoiceError('PARSING_FAILED', 'Final transcript handoff failed.', { cause: error }));
    }
  }

  async retry(): Promise<void> {
    if (!this.lastFailure || !isRetryableVoiceErrorCode(this.lastFailure.code)) return;
    await this.start();
  }

  async captureInterrupted(cause?: unknown): Promise<void> {
    if (this.snapshot.state !== 'connecting' && this.snapshot.state !== 'listening') return;
    await this.fail(new VoiceError(
      'AUDIO_STREAM_START_FAILED',
      'The native microphone stream stopped unexpectedly.',
      { cause },
    ));
  }

  async cancel(): Promise<void> {
    if (this.snapshot.state === 'idle') return;
    ++this.runId;
    if (this.snapshot.state !== 'cancelled') this.transition('cancelled');
    await this.cleanup(true);
    this.reconciler.reset();
    this.dependencies.onAudioLevel?.(0);
    this.diagnostics?.complete({ terminalState: 'cancelled' });
    this.transition('idle', {
      permission: this.snapshot.permission,
      partialTranscript: '',
      finalTranscript: '',
      activeItemId: null,
      error: null,
      retryAttempt: 0,
    });
  }

  async dispose(): Promise<void> {
    await this.cancel();
    this.listeners.clear();
  }

  private async fail(error: VoiceError): Promise<void> {
    if (isFailureState(this.snapshot.state) || this.snapshot.state === 'cancelled' || this.snapshot.state === 'idle') return;
    this.lastFailure = error;
    ++this.runId;
    if (error.code === 'MIC_PERMISSION_DENIED') this.machine.update({ permission: 'denied' });
    if (error.code === 'MIC_PERMISSION_BLOCKED') this.machine.update({ permission: 'blocked' });
    if (error.code === 'MIC_PERMISSION_DENIED' || error.code === 'MIC_PERMISSION_BLOCKED') {
      this.diagnostics?.record('permission_result', {
        permissionState: error.code === 'MIC_PERMISSION_BLOCKED' ? 'blocked' : 'denied',
        errorCode: error.code,
      });
    }
    this.publish(this.machine.fail(error));
    this.diagnostics?.record('session_failed', {
      terminalState: this.snapshot.state,
      errorCode: error.providerError?.code ?? error.code,
      requestId: error.providerError?.requestId,
    });
    await this.cleanup(true);
    this.dependencies.onAudioLevel?.(0);
    this.diagnostics?.complete({ terminalState: this.snapshot.state });
  }

  private cleanup(cancelTransport: boolean): Promise<void> {
    this.cleanupPromise = this.cleanupPromise.then(async () => {
      this.abortController?.abort();
      this.abortController = null;
      this.unsubscribeTransport?.();
      this.unsubscribeTransport = null;
      const transport = this.transport;
      this.transport = null;
      if (transport) {
        if (cancelTransport) transport.cancel();
        else transport.close();
      }
      if (this.captureStarted) {
        try {
          await this.dependencies.capture.stop();
        } catch (error) {
          this.dependencies.onTechnicalError?.(error);
        }
        this.captureStarted = false;
      }
      if (this.audioSessionActive) {
        try {
          await this.dependencies.audioSession.deactivate(this.owner);
        } catch (error) {
          this.dependencies.onTechnicalError?.(error);
        }
        this.audioSessionActive = false;
      }
      this.preconnectAudio = [];
      this.preconnectBytes = 0;
      this.stopping = false;
      this.diagnostics?.record('cleanup_completed', {
        pcmChunksReceived: this.pcmChunksReceived,
        pcmBytesProduced: this.audioBytes,
        parserHandoffCount: this.parserHandoffCount,
        cleanupCompleted: true,
      });
    });
    return this.cleanupPromise;
  }
}
