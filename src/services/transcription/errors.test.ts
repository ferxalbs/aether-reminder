import { describe, expect, test } from 'bun:test';
import {
  isRetryableTranscriptionError,
  TranscriptionError,
  getTranscriptionErrorMessage,
  getTranscriptionErrorTitle,
  needsTranscriptionProviderSettings,
  toTranscriptionError,
} from './errors';
import { AIProviderError } from '@/services/ai/providers';

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

  test('explains billing and unknown OpenAI session failures', () => {
    expect(getTranscriptionErrorMessage(new TranscriptionError('INSUFFICIENT_CREDITS', 'insufficient_quota')))
      .toContain('billing or credits');
    expect(getTranscriptionErrorMessage(new TranscriptionError('SESSION_FAILED', 'Unsupported transcription configuration.')))
      .toBe('The OpenAI realtime transcription session failed.');
  });

  test('maps provider access failures into explicit voice error states', () => {
    expect(toTranscriptionError(new AIProviderError('INVALID_API_KEY', 'rejected', {
      status: 401,
      provider: 'OpenAI',
    }))).toMatchObject({ code: 'INVALID_API_KEY', status: 401 });
    expect(toTranscriptionError(new AIProviderError('MODEL_NOT_FOUND', 'no access', {
      provider: 'OpenAI',
    }))).toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    expect(toTranscriptionError(new AIProviderError('INVALID_REQUEST', 'provider payload', {
      provider: 'OpenAI',
    }))).toMatchObject({ code: 'SESSION_FAILED' });
    expect(needsTranscriptionProviderSettings('INVALID_API_KEY')).toBe(true);
    expect(needsTranscriptionProviderSettings('NETWORK_ERROR')).toBe(false);
    expect(getTranscriptionErrorTitle('HANDOFF_FAILED')).toBe('Reminder processing unavailable');
  });
});
