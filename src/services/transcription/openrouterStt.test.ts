import { describe, expect, test } from 'bun:test';
import { OpenRouterSTTProvider } from './openrouterStt';
import { TranscriptionError } from './errors';
import { parseSpeechToTasks } from './parseSpeech';

describe('OpenRouterSTTProvider honesty', () => {
  const provider = new OpenRouterSTTProvider();

  test('rejects mock:// URIs without inventing a transcript', async () => {
    await expect(provider.transcribeAudio('mock://voice-recording', 'sk-or-test')).rejects.toBeInstanceOf(
      TranscriptionError
    );
    try {
      await provider.transcribeAudio('mock://voice-recording', 'sk-or-test');
    } catch (e) {
      expect(e).toBeInstanceOf(TranscriptionError);
      expect((e as TranscriptionError).code).toBe('INVALID_AUDIO');
    }
  });

  test('rejects missing API key with typed error', async () => {
    try {
      await provider.transcribeAudio('file:///tmp/audio.m4a', '');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(TranscriptionError);
      expect((e as TranscriptionError).code).toBe('MISSING_API_KEY');
    }
  });

  test('rejects empty URI', async () => {
    try {
      await provider.transcribeAudio('', 'sk-or-test');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(TranscriptionError);
      expect((e as TranscriptionError).code).toBe('INVALID_AUDIO');
    }
  });
});

describe('parseSpeechToTasks', () => {
  test('empty text yields empty candidates — not demo data', () => {
    expect(parseSpeechToTasks('')).toEqual({ text: '', taskCandidates: [] });
    expect(parseSpeechToTasks('   ')).toEqual({ text: '', taskCandidates: [] });
  });

  test('extracts priority keywords', () => {
    const result = parseSpeechToTasks('urgent call the bank and also buy milk later');
    expect(result.taskCandidates.length).toBeGreaterThanOrEqual(1);
    expect(result.taskCandidates.some((c) => c.priority === 'high')).toBe(true);
  });
});
