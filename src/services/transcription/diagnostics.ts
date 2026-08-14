import type { VoiceErrorCode } from './errors';
import type { VoicePermissionState, VoiceState } from './stateMachine';

export const VOICE_DIAGNOSTIC_PREFIX = '[AETHER_VOICE_DIAGNOSTIC]';

export type VoiceDiagnosticStage =
  | 'session_started'
  | 'permission_checking'
  | 'permission_result'
  | 'microphone_stream_started'
  | 'microphone_stream_failed'
  | 'audio_format_detected'
  | 'pcm_progress'
  | 'credential_request_started'
  | 'credential_request_succeeded'
  | 'credential_request_failed'
  | 'websocket_connecting'
  | 'websocket_open'
  | 'websocket_closed'
  | 'session_created'
  | 'session_configuration_sent'
  | 'session_configuration_accepted'
  | 'session_configuration_rejected'
  | 'audio_append_progress'
  | 'commit_sent'
  | 'transcription_delta_progress'
  | 'transcription_completed'
  | 'parser_handoff'
  | 'cleanup_completed'
  | 'session_failed'
  | 'session_summary';

export interface VoiceDiagnosticFields {
  permissionState?: VoicePermissionState;
  microphoneStreamStarted?: boolean;
  requestedSampleRate?: number;
  actualSampleRate?: number;
  channelCount?: number;
  resamplingActive?: boolean;
  pcmChunksReceived?: number;
  pcmBytesProduced?: number;
  credentialRequest?: 'not_started' | 'pending' | 'succeeded' | 'failed';
  webSocketState?: 'not_started' | 'connecting' | 'open' | 'closing' | 'closed' | 'failed';
  sessionConfiguration?: 'not_started' | 'pending' | 'accepted' | 'rejected';
  audioAppendCount?: number;
  audioBytesSubmitted?: number;
  commitSent?: boolean;
  transcriptionDeltaCount?: number;
  transcriptionCompleted?: boolean;
  parserHandoffCount?: number;
  cleanupCompleted?: boolean;
  terminalState?: VoiceState;
  errorCode?: VoiceErrorCode | string;
  requestId?: string;
}

export interface VoiceDiagnosticRecord extends VoiceDiagnosticFields {
  schema: 'aether.voice.diagnostic.v1';
  sessionId: string;
  sequence: number;
  timestamp: string;
  stage: VoiceDiagnosticStage;
}

export interface VoiceDiagnosticReporter {
  readonly sessionId: string;
  record(stage: VoiceDiagnosticStage, fields?: VoiceDiagnosticFields): void;
  complete(fields?: VoiceDiagnosticFields): void;
}

interface DevelopmentVoiceDiagnosticsOptions {
  enabled?: boolean;
  sink?: (record: VoiceDiagnosticRecord) => void;
}

let diagnosticSessionSequence = 0;

function nextSessionId(): string {
  diagnosticSessionSequence += 1;
  return `voice-${Date.now().toString(36)}-${diagnosticSessionSequence.toString(36)}`;
}

function developmentEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function consoleSink(record: VoiceDiagnosticRecord): void {
  // The record schema has no fields for credentials, headers, audio, or transcript text.
  console.info(VOICE_DIAGNOSTIC_PREFIX, JSON.stringify(record));
}

export class DevelopmentVoiceDiagnostics implements VoiceDiagnosticReporter {
  readonly sessionId = nextSessionId();
  private readonly enabled: boolean;
  private readonly sink: (record: VoiceDiagnosticRecord) => void;
  private readonly summary: VoiceDiagnosticFields = {
    permissionState: 'unknown',
    microphoneStreamStarted: false,
    credentialRequest: 'not_started',
    webSocketState: 'not_started',
    sessionConfiguration: 'not_started',
    pcmChunksReceived: 0,
    pcmBytesProduced: 0,
    audioAppendCount: 0,
    audioBytesSubmitted: 0,
    commitSent: false,
    transcriptionDeltaCount: 0,
    transcriptionCompleted: false,
    parserHandoffCount: 0,
    cleanupCompleted: false,
  };
  private sequence = 0;
  private completed = false;

  constructor(options: DevelopmentVoiceDiagnosticsOptions = {}) {
    this.enabled = options.enabled ?? developmentEnabled();
    this.sink = options.sink ?? consoleSink;
  }

  record(stage: VoiceDiagnosticStage, fields: VoiceDiagnosticFields = {}): void {
    if (!this.enabled || this.completed) return;
    Object.assign(this.summary, fields);
    this.sink({
      schema: 'aether.voice.diagnostic.v1',
      sessionId: this.sessionId,
      sequence: ++this.sequence,
      timestamp: new Date().toISOString(),
      stage,
      ...fields,
    });
  }

  complete(fields: VoiceDiagnosticFields = {}): void {
    if (!this.enabled || this.completed) return;
    this.completed = true;
    Object.assign(this.summary, fields);
    this.sink({
      schema: 'aether.voice.diagnostic.v1',
      sessionId: this.sessionId,
      sequence: ++this.sequence,
      timestamp: new Date().toISOString(),
      stage: 'session_summary',
      ...this.summary,
    });
  }
}

export function createDevelopmentVoiceDiagnostics(): VoiceDiagnosticReporter {
  return new DevelopmentVoiceDiagnostics();
}
