export type VoiceErrorCode =
  | 'MIC_PERMISSION_DENIED'
  | 'MIC_PERMISSION_BLOCKED'
  | 'AUDIO_STREAM_START_FAILED'
  | 'AUDIO_FORMAT_UNSUPPORTED'
  | 'RESAMPLE_FAILED'
  | 'REALTIME_AUTH_FAILED'
  | 'INVALID_CREDENTIAL'
  | 'ACCOUNT_NOT_AUTHORIZED'
  | 'TIER_NOT_SUPPORTED'
  | 'SESSION_CONFIGURATION_INVALID'
  | 'MODEL_TEMPORARILY_UNAVAILABLE'
  | 'REALTIME_CONNECT_FAILED'
  | 'REALTIME_CONNECTION_LOST'
  | 'REALTIME_TIMEOUT'
  | 'REALTIME_BACKPRESSURE'
  | 'REALTIME_PROTOCOL_ERROR'
  | 'TRANSCRIPTION_FAILED'
  | 'TRANSCRIPTION_TIMEOUT'
  | 'EMPTY_TRANSCRIPT'
  | 'PARSING_FAILED'
  | 'CANCELLED'
  | 'UNKNOWN';

export class VoiceError extends Error {
  readonly code: VoiceErrorCode;
  readonly cause?: unknown;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  readonly providerError?: {
    code?: string;
    message?: string;
    type?: string;
    param?: string;
    requestId?: string;
  };

  constructor(
    code: VoiceErrorCode,
    message: string,
    options?: {
      cause?: unknown;
      status?: number;
      retryAfterSeconds?: number;
      providerError?: VoiceError['providerError'];
    },
  ) {
    super(message);
    this.name = 'VoiceError';
    this.code = code;
    this.cause = options?.cause;
    this.status = options?.status;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.providerError = options?.providerError;
  }
}

export function toVoiceError(error: unknown, fallback: VoiceErrorCode = 'UNKNOWN'): VoiceError {
  if (error instanceof VoiceError) return error;
  return new VoiceError(
    fallback,
    error instanceof Error && error.message ? error.message : 'Voice capture failed.',
    { cause: error },
  );
}

export function isRetryableVoiceErrorCode(code: VoiceErrorCode): boolean {
  return code === 'MIC_PERMISSION_DENIED'
    || code === 'AUDIO_STREAM_START_FAILED'
    || code === 'REALTIME_AUTH_FAILED'
    || code === 'MODEL_TEMPORARILY_UNAVAILABLE'
    || code === 'REALTIME_CONNECT_FAILED'
    || code === 'REALTIME_CONNECTION_LOST'
    || code === 'REALTIME_TIMEOUT'
    || code === 'TRANSCRIPTION_FAILED'
    || code === 'TRANSCRIPTION_TIMEOUT';
}

export function getVoiceErrorTitle(code: VoiceErrorCode | null): string {
  if (code?.startsWith('MIC_') || code?.startsWith('AUDIO_') || code === 'RESAMPLE_FAILED') {
    return 'Microphone unavailable';
  }
  if (code === 'PARSING_FAILED') return 'Reminder processing unavailable';
  return 'Transcription unavailable';
}

export function getVoiceErrorMessage(error: VoiceError): string {
  switch (error.code) {
    case 'MIC_PERMISSION_DENIED':
      return 'Microphone permission is required to capture a voice reminder.';
    case 'MIC_PERMISSION_BLOCKED':
      return 'Microphone access is blocked. Enable it in system Settings to use voice capture.';
    case 'AUDIO_STREAM_START_FAILED':
      return 'The microphone stream could not start. Try again.';
    case 'AUDIO_FORMAT_UNSUPPORTED':
      return 'The microphone returned an unsupported audio format.';
    case 'RESAMPLE_FAILED':
      return 'The microphone audio could not be prepared for transcription.';
    case 'REALTIME_AUTH_FAILED':
      return 'OpenAI could not authorize realtime transcription.';
    case 'INVALID_CREDENTIAL':
      return 'The OpenAI API key was rejected. Check it in Settings.';
    case 'ACCOUNT_NOT_AUTHORIZED':
      return 'This OpenAI project is not authorized to use realtime transcription.';
    case 'TIER_NOT_SUPPORTED':
      return 'GPT Live Transcribe requires a supported OpenAI API usage tier.';
    case 'SESSION_CONFIGURATION_INVALID':
      return 'OpenAI rejected the realtime transcription session configuration.';
    case 'MODEL_TEMPORARILY_UNAVAILABLE':
      return 'GPT Live Transcribe is temporarily unavailable. Try again shortly.';
    case 'REALTIME_CONNECT_FAILED':
      return 'Could not connect to OpenAI realtime transcription. Check your connection.';
    case 'REALTIME_CONNECTION_LOST':
      return 'The realtime transcription connection was interrupted.';
    case 'REALTIME_TIMEOUT':
      return 'OpenAI realtime transcription did not respond in time. Try again.';
    case 'REALTIME_BACKPRESSURE':
      return 'Realtime transcription could not keep up with microphone audio. Try again.';
    case 'REALTIME_PROTOCOL_ERROR':
      return 'OpenAI returned an unexpected realtime protocol response.';
    case 'TRANSCRIPTION_FAILED':
      return 'OpenAI could not transcribe this voice turn.';
    case 'TRANSCRIPTION_TIMEOUT':
      return 'The final transcript took too long to arrive. Try again.';
    case 'EMPTY_TRANSCRIPT':
      return 'No speech was recognized. Nothing was sent to AETHER.';
    case 'PARSING_FAILED':
      return 'AETHER could not interpret that transcript. Try again.';
    case 'CANCELLED':
      return 'Voice capture was cancelled.';
    default:
      return 'Voice capture failed. Try again.';
  }
}
