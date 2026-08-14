import type { RealtimeTranscriptionConfig } from './types';
import { REALTIME_TRANSCRIPTION_MODEL } from './types';

export const OPENAI_REALTIME_WEBSOCKET_URL = 'wss://api.openai.com/v1/realtime';

/**
 * Builds the current transcription-session shape shared by client-secret
 * creation and the Realtime WebSocket `session.update` event.
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

export function buildRealtimeWebSocketUrl(
  model: string = REALTIME_TRANSCRIPTION_MODEL,
  baseUrl: string = OPENAI_REALTIME_WEBSOCKET_URL,
): string {
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}model=${encodeURIComponent(model)}`;
}

