import { describe, expect, test } from 'bun:test';
import { TranscriptionError } from './errors';
import { deliverFinalTranscript } from './finalTranscript';

describe('committed transcript delivery', () => {
  test('submits a final transcript exactly once', () => {
    const guard = { current: false };
    const submitted: string[] = [];
    expect(deliverFinalTranscript('  Create a task  ', guard, (text) => submitted.push(text))).toBe(true);
    expect(deliverFinalTranscript('Create a task', guard, (text) => submitted.push(text))).toBe(false);
    expect(submitted).toEqual(['Create a task']);
  });

  test('does not submit an empty final transcript', () => {
    expect(() => deliverFinalTranscript('  ', { current: false }, () => undefined)).toThrow(TranscriptionError);
  });
});
