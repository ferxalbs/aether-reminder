import { describe, expect, test } from 'bun:test';
import {
  isRetryableTranscriptionError,
  TranscriptionError,
  getTranscriptionErrorMessage,
} from './errors';

describe('transcription error handling', () => {
  test('classifies transport failures as retryable but not validation failures', () => {
    expect(isRetryableTranscriptionError(new TranscriptionError('TIMEOUT', 'timed out'))).toBe(true);
    expect(isRetryableTranscriptionError(new TranscriptionError('NETWORK_ERROR', 'offline'))).toBe(true);
    expect(isRetryableTranscriptionError(new TranscriptionError('PERMISSION_DENIED', 'denied'))).toBe(false);
  });

  test('exposes a safe handoff error message', () => {
    expect(getTranscriptionErrorMessage(new TranscriptionError('HANDOFF_FAILED', 'private provider detail')))
      .toBe('AETHER could not receive that transcript. Try voice capture again.');
  });
});
