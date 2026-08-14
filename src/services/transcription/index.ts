export {
  OpenAIByokClientSecretProvider,
  buildRealtimeSessionPayload,
  classifyOpenAIModelAccessError,
  testOpenAIRealtimeConnection,
} from './auth';
export { Pcm16StreamNormalizer, pcm16AudioLevel, pcm16ToBase64, type NativePcmBuffer } from './audio';
export { createExpoAudioSession, expoAudioSession, type AudioSessionGateway } from './audioSession';
export {
  DevelopmentVoiceDiagnostics,
  VOICE_DIAGNOSTIC_PREFIX,
  createDevelopmentVoiceDiagnostics,
  type VoiceDiagnosticFields,
  type VoiceDiagnosticRecord,
  type VoiceDiagnosticReporter,
  type VoiceDiagnosticStage,
} from './diagnostics';
export {
  VoiceError,
  getVoiceErrorMessage,
  getVoiceErrorTitle,
  isRetryableVoiceErrorCode,
  toVoiceError,
  type VoiceErrorCode,
} from './errors';
export { ensureMicrophonePermission, type MicrophonePermissionGateway } from './permissions';
export {
  OpenAIRealtimeWebSocketTransport,
  type OpenAIRealtimeWebSocketTransportOptions,
  type RealtimeWebSocketFactory,
  type RealtimeWebSocketLike,
  type RealtimeWebSocketState,
} from './openaiRealtimeWebSocketTransport';
export {
  OPENAI_REALTIME_WEBSOCKET_URL,
  buildRealtimeWebSocketUrl,
} from './protocol';
export { TranscriptReconciler } from './reconciler';
export {
  VoiceStateMachine,
  failureStateFor,
  initialVoiceSnapshot,
  isFailureState,
  type VoicePermissionState,
  type VoiceSnapshot,
  type VoiceState,
} from './stateMachine';
export {
  REALTIME_PCM_CHANNELS,
  REALTIME_PCM_SAMPLE_RATE,
  REALTIME_TRANSCRIPTION_MODEL,
  defaultRealtimeTranscriptionConfig,
  type NativeAudioCapture,
  type RealtimeClientSecret,
  type RealtimeClientSecretProvider,
  type RealtimeTranscriptionConfig,
  type RealtimeTranscriptionTransport,
  type RealtimeTransportEvent,
  type TranscriptionContext,
} from './types';
export { VoiceSession, type VoiceSessionDependencies } from './voiceSession';
