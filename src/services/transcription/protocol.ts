import type { RealtimeTranscriptionConfig } from './types';

export const OPENAI_REALTIME_WEBSOCKET_URL = 'wss://api.openai.com/v1/realtime';
export const OPENAI_REALTIME_TRANSCRIPTION_INTENT = 'transcription';

/**
 * Dedicated transcription WebSocket bootstrap.
 *
 * Official conversational Realtime sessions use `?model=<realtime-model>`.
 * Dedicated transcription sessions do not: `gpt-live-transcribe` is the
 * nested transcription model, not a top-level Realtime conversation model.
 * The current transcription connection is `?intent=transcription`.
 */
export function buildRealtimeTranscriptionWebSocketUrl(
  baseUrl: string = OPENAI_REALTIME_WEBSOCKET_URL,
): string {
  if (!/^wss?:\/\//i.test(baseUrl)) {
    throw new Error('Realtime transcription WebSocket URL must be an absolute ws/wss URL.');
  }
  const url = new URL(baseUrl);
  url.searchParams.delete('model');
  url.searchParams.set('intent', OPENAI_REALTIME_TRANSCRIPTION_INTENT);
  return url.toString();
}

/** @alias buildRealtimeTranscriptionWebSocketUrl */
export function buildRealtimeWebSocketUrl(
  baseUrl: string = OPENAI_REALTIME_WEBSOCKET_URL,
): string {
  return buildRealtimeTranscriptionWebSocketUrl(baseUrl);
}

export function isTranscriptionWebSocketUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('intent') === OPENAI_REALTIME_TRANSCRIPTION_INTENT
      && !parsed.searchParams.has('model');
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function nestedTranscriptionModel(session: Record<string, unknown>): unknown {
  const audio = asRecord(session.audio);
  const input = audio ? asRecord(audio.input) : null;
  const transcription = input ? asRecord(input.transcription) : null;
  return transcription?.model;
}

/**
 * Builds the current transcription-session shape shared by client-secret
 * creation and the Realtime WebSocket `session.update` event.
 *
 * `gpt-live-transcribe` belongs only at `audio.input.transcription.model`.
 * Never send both `language` and `languages`.
 */
export function buildRealtimeSessionPayload(
  config: RealtimeTranscriptionConfig,
): Record<string, unknown> {
  const transcription: Record<string, unknown> = {
    model: config.model,
  };
  if (config.context.prompt) transcription.prompt = config.context.prompt;
  if (config.context.languages?.length) transcription.languages = config.context.languages;
  if (config.context.keywords?.length) transcription.keywords = config.context.keywords;

  return {
    type: 'transcription',
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: config.sampleRate },
        transcription,
        turn_detection: config.turnDetection,
      },
    },
  };
}

export function buildRealtimeSessionUpdateEvent(
  config: RealtimeTranscriptionConfig,
): { type: 'session.update'; session: Record<string, unknown> } {
  return { type: 'session.update', session: buildRealtimeSessionPayload(config) };
}

