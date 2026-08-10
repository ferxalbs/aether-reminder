import { describe, expect, test } from 'bun:test';
import {
  initialRealtimeTranscriptionSnapshot,
  parseRealtimeServerEvent,
  reduceRealtimeTranscription,
} from './realtimeReducer';

describe('OpenAI realtime transcription reducer', () => {
  test('moves from session readiness through partial and final transcript states', () => {
    const ready = reduceRealtimeTranscription(initialRealtimeTranscriptionSnapshot, { type: 'session.ready' });
    expect(ready.state).toBe('listening');

    const partial = reduceRealtimeTranscription(ready, parseRealtimeServerEvent({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-1',
      content_index: 0,
      delta: 'Create ',
    })!);
    const continued = reduceRealtimeTranscription(partial, parseRealtimeServerEvent({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-1',
      content_index: 0,
      delta: 'a task',
    })!);
    expect(continued.state).toBe('transcribing');
    expect(continued.partialText).toBe('Create a task');

    const final = reduceRealtimeTranscription(continued, parseRealtimeServerEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-1',
      content_index: 0,
      transcript: 'Create a task',
    })!);
    expect(final.state).toBe('finalizing');
    expect(final.finalText).toBe('Create a task');
    expect(final.committed).toBe(true);
  });

  test('commit enters finalizing without fabricating transcript text', () => {
    const next = reduceRealtimeTranscription(initialRealtimeTranscriptionSnapshot, { type: 'client.commit' });
    expect(next.state).toBe('finalizing');
    expect(next.finalText).toBe('');
    expect(next.committed).toBe(true);
  });

  test('malformed documented events fail closed and unknown events do not corrupt state', () => {
    expect(() => parseRealtimeServerEvent({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'item-1' })).toThrow();
    expect(parseRealtimeServerEvent({ type: 'rate_limits.updated', rate_limits: [] })).toBeNull();
  });

  test('classifies the actionable reason returned by OpenAI', () => {
    expect(parseRealtimeServerEvent({
      type: 'error',
      error: { code: 'insufficient_quota', message: 'Please check your billing details.' },
    })).toEqual({
      type: 'server.error',
      code: 'INSUFFICIENT_CREDITS',
      message: 'Please check your billing details.',
    });
    expect(parseRealtimeServerEvent({
      type: 'error',
      error: { code: 'invalid_request_error', message: 'Project does not have access to this model.' },
    })?.type).toBe('server.error');
    expect((parseRealtimeServerEvent({
      type: 'error',
      error: { code: 'invalid_request_error', message: 'Project does not have access to this model.' },
    }) as { code: string }).code).toBe('MODEL_UNAVAILABLE');
  });
});
