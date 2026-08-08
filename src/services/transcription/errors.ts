export type TranscriptionErrorCode =
  | 'PERMISSION_DENIED'
  | 'AUDIO_UNAVAILABLE'
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'INSUFFICIENT_CREDITS'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'INVALID_AUDIO'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'CANCELLED'
  | 'UNKNOWN';

export class TranscriptionError extends Error {
  readonly code: TranscriptionErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: TranscriptionErrorCode,
    message: string,
    options?: { status?: number; retryAfterSeconds?: number; cause?: unknown }
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
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
        return 'Audio recording is unavailable in this environment. Use a development build with native audio.';
      case 'MISSING_API_KEY':
        return 'Add your OpenRouter API key in Settings before using voice transcription.';
      case 'INVALID_API_KEY':
        return 'The OpenRouter API key was rejected. Check it in Settings.';
      case 'INSUFFICIENT_CREDITS':
        return 'OpenRouter needs available credits for transcription.';
      case 'RATE_LIMITED':
        return error.retryAfterSeconds
          ? `Transcription rate limit reached. Try again in about ${error.retryAfterSeconds} seconds.`
          : 'Transcription rate limit reached. Try again shortly.';
      case 'NETWORK_ERROR':
        return 'Could not reach the transcription service. Check your connection.';
      case 'INVALID_AUDIO':
        return 'The recording could not be processed. Try recording again.';
      case 'PROVIDER_UNAVAILABLE':
        return 'The speech provider is temporarily unavailable. Try again shortly.';
      case 'INVALID_RESPONSE':
        return 'The transcription service returned an unexpected response.';
      case 'CANCELLED':
        return 'Transcription was cancelled.';
      default:
        return 'Transcription failed. Try again.';
    }
  }
  return 'Transcription failed. Try again.';
}
