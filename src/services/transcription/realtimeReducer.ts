import type { TranscriptionErrorCode } from './errors';

export type RealtimeTranscriptionState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'transcribing'
  | 'finalizing'
  | 'error';

export interface RealtimeTranscriptionSnapshot {
  state: RealtimeTranscriptionState;
  activeItemId: string | null;
  partialText: string;
  finalText: string;
  committed: boolean;
  error: TranscriptionErrorCode | null;
}

export type RealtimeServerEvent =
  | { type: 'session.ready' }
  | { type: 'transcription.delta'; itemId: string; delta: string }
  | { type: 'transcription.completed'; itemId: string; transcript: string }
  | { type: 'server.error'; code: TranscriptionErrorCode; message: string };

export const initialRealtimeTranscriptionSnapshot: RealtimeTranscriptionSnapshot = {
  state: 'idle',
  activeItemId: null,
  partialText: '',
  finalText: '',
  committed: false,
  error: null,
};

export function reduceRealtimeTranscription(
  snapshot: RealtimeTranscriptionSnapshot,
  event: RealtimeServerEvent | { type: 'client.commit' } | { type: 'reset' }
): RealtimeTranscriptionSnapshot {
  if (event.type === 'reset') return initialRealtimeTranscriptionSnapshot;

  if (event.type === 'client.commit') {
    return {
      ...snapshot,
      state: 'finalizing',
      committed: true,
    };
  }

  if (event.type === 'session.ready') {
    return {
      ...snapshot,
      state: 'listening',
      error: null,
    };
  }

  if (event.type === 'server.error') {
    return {
      ...snapshot,
      state: 'error',
      error: event.code,
    };
  }

  if (event.type === 'transcription.delta') {
    const startsNewItem = snapshot.activeItemId !== event.itemId;
    return {
      ...snapshot,
      state: 'transcribing',
      activeItemId: event.itemId,
      partialText: startsNewItem ? event.delta : snapshot.partialText + event.delta,
      finalText: '',
      error: null,
    };
  }

  // The completion event is authoritative. Do not concatenate it with deltas.
  return {
    ...snapshot,
    state: 'finalizing',
    activeItemId: event.itemId,
    finalText: event.transcript,
    partialText: event.transcript,
    committed: true,
    error: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function mapServerErrorCode(code: unknown, message: unknown): TranscriptionErrorCode {
  const diagnostic = `${typeof code === 'string' ? code : ''} ${typeof message === 'string' ? message : ''}`.toLowerCase();
  if (diagnostic.includes('auth') || diagnostic.includes('api_key') || diagnostic.includes('invalid key')) return 'INVALID_API_KEY';
  if (diagnostic.includes('insufficient_quota') || diagnostic.includes('billing') || diagnostic.includes('credit')) return 'INSUFFICIENT_CREDITS';
  if (diagnostic.includes('model_not_found') || diagnostic.includes('model access') || diagnostic.includes('not have access')) return 'MODEL_UNAVAILABLE';
  if (diagnostic.includes('rate') || diagnostic.includes('quota')) return 'RATE_LIMITED';
  if (diagnostic.includes('audio')) return 'INVALID_AUDIO';
  return 'SESSION_FAILED';
}

/** Parse only documented transcript/session/error fields; unknown event types are ignored. */
export function parseRealtimeServerEvent(value: unknown): RealtimeServerEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('Realtime event is missing a type.');
  }

  switch (value.type) {
    case 'session.created':
    case 'session.updated':
      return { type: 'session.ready' };
    case 'conversation.item.input_audio_transcription.delta':
      if (!isNonEmptyString(value.item_id) || typeof value.delta !== 'string') {
        throw new Error('Realtime transcript delta is malformed.');
      }
      return { type: 'transcription.delta', itemId: value.item_id, delta: value.delta };
    case 'conversation.item.input_audio_transcription.completed':
      if (!isNonEmptyString(value.item_id) || typeof value.transcript !== 'string') {
        throw new Error('Realtime transcript completion is malformed.');
      }
      return { type: 'transcription.completed', itemId: value.item_id, transcript: value.transcript };
    case 'error': {
      const error = isRecord(value.error) ? value.error : value;
      const message = typeof error.message === 'string' ? error.message : 'OpenAI realtime session error.';
      return {
        type: 'server.error',
        code: mapServerErrorCode(error.code, message),
        message,
      };
    }
    default:
      return null;
  }
}
