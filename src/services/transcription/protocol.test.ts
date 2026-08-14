import { describe, expect, test } from 'bun:test';
import {
  OPENAI_REALTIME_WEBSOCKET_URL,
  buildRealtimeSessionPayload,
  buildRealtimeSessionUpdateEvent,
  buildRealtimeTranscriptionWebSocketUrl,
  buildRealtimeWebSocketUrl,
  isTranscriptionWebSocketUrl,
  nestedTranscriptionModel,
} from './protocol';
import {
  REALTIME_TRANSCRIPTION_MODEL,
  defaultRealtimeTranscriptionConfig,
  minimalRealtimeTranscriptionConfig,
} from './types';

describe('Realtime transcription protocol', () => {
  test('does not treat gpt-live-transcribe as a top-level Realtime model query', () => {
    const url = buildRealtimeTranscriptionWebSocketUrl();
    expect(url).toBe('wss://api.openai.com/v1/realtime?intent=transcription');
    expect(url).not.toContain('model=');
    expect(url).not.toContain(REALTIME_TRANSCRIPTION_MODEL);
    expect(isTranscriptionWebSocketUrl(url)).toBe(true);
    expect(buildRealtimeWebSocketUrl()).toBe(url);
  });

  test('strips an accidental conversational ?model= override from the bootstrap URL', () => {
    const confused = `${OPENAI_REALTIME_WEBSOCKET_URL}?model=${REALTIME_TRANSCRIPTION_MODEL}`;
    expect(confused).toContain(`model=${REALTIME_TRANSCRIPTION_MODEL}`);
    const url = buildRealtimeTranscriptionWebSocketUrl(confused);
    expect(url).toBe('wss://api.openai.com/v1/realtime?intent=transcription');
    expect(isTranscriptionWebSocketUrl(confused)).toBe(false);
    expect(isTranscriptionWebSocketUrl(url)).toBe(true);
  });

  test('rejects using the transcription model as if it were a WebSocket URL', () => {
    expect(() => buildRealtimeTranscriptionWebSocketUrl(REALTIME_TRANSCRIPTION_MODEL))
      .toThrow(/absolute ws\/wss URL/);
  });

  test('places gpt-live-transcribe only at the nested transcription-model path', () => {
    const session = buildRealtimeSessionPayload(minimalRealtimeTranscriptionConfig);
    expect(session).toEqual({
      type: 'transcription',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: 24000 },
          transcription: { model: REALTIME_TRANSCRIPTION_MODEL },
          turn_detection: null,
        },
      },
    });
    expect(session).not.toHaveProperty('model');
    expect(JSON.stringify(session).match(/gpt-live-transcribe/g)).toEqual([REALTIME_TRANSCRIPTION_MODEL]);
    expect(nestedTranscriptionModel(session)).toBe(REALTIME_TRANSCRIPTION_MODEL);
    expect(session.audio).not.toHaveProperty('language');
    expect((session.audio as { input: { transcription: Record<string, unknown> } })
      .input.transcription).not.toHaveProperty('language');
  });

  test('does not send both language and languages when context is present', () => {
    const event = buildRealtimeSessionUpdateEvent(defaultRealtimeTranscriptionConfig);
    const transcription = (event.session.audio as {
      input: { transcription: Record<string, unknown> };
    }).input.transcription;
    expect(event.type).toBe('session.update');
    expect(event.session.type).toBe('transcription');
    expect(event.session).not.toHaveProperty('model');
    expect(transcription.model).toBe(REALTIME_TRANSCRIPTION_MODEL);
    expect(transcription.languages).toEqual(['en', 'es']);
    expect(transcription).not.toHaveProperty('language');
    expect(nestedTranscriptionModel(event.session)).toBe(REALTIME_TRANSCRIPTION_MODEL);
  });
});
