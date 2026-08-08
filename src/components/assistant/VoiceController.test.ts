import { describe, expect, test } from 'bun:test';
import { getVoiceReleaseAction } from './voiceRelease';

describe('getVoiceReleaseAction', () => {
  test('defers release while the realtime session is still connecting', () => {
    expect(getVoiceReleaseAction('connecting', true, false)).toBe('defer');
  });

  test('commits release after the microphone starts listening', () => {
    expect(getVoiceReleaseAction('listening', true, false)).toBe('commit');
    expect(getVoiceReleaseAction('transcribing', true, false)).toBe('commit');
  });

  test('ignores release for inactive or locked sessions', () => {
    expect(getVoiceReleaseAction('idle', false, false)).toBe('ignore');
    expect(getVoiceReleaseAction('listening', true, true)).toBe('ignore');
  });
});
