export type TranscriptionErrorCode =
  | 'PERMISSION_DENIED'
  | 'AUDIO_UNAVAILABLE'
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'INSUFFICIENT_CREDITS'
  | 'MODEL_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INVALID_AUDIO'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_EVENT'
  | 'SESSION_FAILED'
  | 'EMPTY_TRANSCRIPT'
  | 'HANDOFF_FAILED'
  | 'CANCELLED'
  | 'UNKNOWN';

export class TranscriptionError extends Error {
  readonly code: TranscriptionErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: TranscriptionErrorCode,
    message: string,
    options?: { status?: number; retryAfterSeconds?: number }
  ) {
    super(message);
    this.name = 'TranscriptionError';
    this.code = code;
    this.status = options?.status;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export function getTranscriptionErrorMessage(error: unknown): string {
  if (error instanceof TranscriptionError) {
    switch (error.code) {
      case 'PERMISSION_DENIED':
        return 'Microphone permission was denied. Enable it in system settings to use voice capture.';
      case 'AUDIO_UNAVAILABLE':
        return 'Realtime audio is unavailable in this environment. Use an Expo development build with native audio.';
      case 'MISSING_API_KEY':
        return 'Add an OpenAI API key in Settings before using voice transcription.';
      case 'INVALID_API_KEY':
        return 'The OpenAI API key was rejected. Check it in Settings.';
      case 'INSUFFICIENT_CREDITS':
        return 'OpenAI billing or credits do not allow realtime transcription. Add credits and confirm your API usage tier.';
      case 'MODEL_UNAVAILABLE':
        return 'This OpenAI project does not have access to the realtime transcription model.';
      case 'RATE_LIMITED':
        return error.retryAfterSeconds
          ? `OpenAI rate limit reached. Try again in about ${error.retryAfterSeconds} seconds.`
          : 'OpenAI rate limit reached. Try again shortly.';
      case 'NETWORK_ERROR':
        return 'Could not reach OpenAI realtime transcription. Check your connection.';
      case 'TIMEOUT':
        return 'OpenAI realtime transcription took too long to respond. Try again.';
      case 'INVALID_AUDIO':
        return 'The microphone did not provide the required 24 kHz mono PCM audio.';
      case 'PROVIDER_UNAVAILABLE':
        return 'OpenAI realtime transcription is temporarily unavailable. Try again shortly.';
      case 'INVALID_EVENT':
        return 'OpenAI returned an invalid realtime event. The voice session was stopped safely.';
      case 'SESSION_FAILED':
        return error.message && error.message !== 'The OpenAI realtime transcription session failed.'
          ? `OpenAI rejected the realtime transcription session: ${error.message}`
          : 'The OpenAI realtime transcription session failed.';
      case 'EMPTY_TRANSCRIPT':
        return 'No speech was captured. Nothing was sent to AETHER.';
      case 'HANDOFF_FAILED':
        return 'AETHER could not receive that transcript. Try voice capture again.';
      case 'CANCELLED':
        return 'Voice capture was cancelled.';
      default:
        return 'Voice transcription failed. Try again.';
    }
  }
  return 'Voice transcription failed. Try again.';
}

export function isRetryableTranscriptionErrorCode(code: string): boolean {
  return code === 'NETWORK_ERROR'
    || code === 'TIMEOUT'
    || code === 'RATE_LIMITED'
    || code === 'PROVIDER_UNAVAILABLE';
}

export function isRetryableTranscriptionError(error: unknown): error is TranscriptionError {
  return error instanceof TranscriptionError && isRetryableTranscriptionErrorCode(error.code);
}
