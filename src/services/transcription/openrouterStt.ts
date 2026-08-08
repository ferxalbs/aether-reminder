import { TranscriptionResult } from '@/types';
import { TranscriptionError, TranscriptionErrorCode } from './errors';
import { parseSpeechToTasks } from './parseSpeech';

const OPENROUTER_STT_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';

export interface SpeechToTextProvider {
  readonly id: string;
  readonly name: string;
  transcribeAudio(audioUri: string, apiKey?: string): Promise<TranscriptionResult>;
}

function getRetryAfterSeconds(response: Response): number | undefined {
  const retryAfter = Number(response.headers.get('Retry-After'));
  return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : undefined;
}

function mapHttpStatus(status: number): TranscriptionErrorCode {
  if (status === 401) return 'INVALID_API_KEY';
  if (status === 402) return 'INSUFFICIENT_CREDITS';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400 || status === 413 || status === 415) return 'INVALID_AUDIO';
  if (status === 502 || status === 503) return 'PROVIDER_UNAVAILABLE';
  return 'UNKNOWN';
}

/**
 * Remote speech-to-text via OpenRouter.
 * Uses the OpenRouter API key against OpenRouter only — never OpenAI.
 * Never fabricates transcripts on failure.
 */
export class OpenRouterSTTProvider implements SpeechToTextProvider {
  readonly id = 'openrouter-stt';
  readonly name = 'OpenRouter Speech-to-Text';

  async transcribeAudio(audioUri: string, apiKey?: string): Promise<TranscriptionResult> {
    if (!audioUri || audioUri.startsWith('mock://')) {
      throw new TranscriptionError(
        'INVALID_AUDIO',
        'No valid recording URI was provided. Capture audio before transcribing.'
      );
    }

    const keyToUse = apiKey?.trim();
    if (!keyToUse) {
      throw new TranscriptionError(
        'MISSING_API_KEY',
        'Add an OpenRouter API key in Settings before using voice transcription.'
      );
    }

    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    } as unknown as Blob);
    // OpenRouter-compatible STT model id (Whisper family via OpenRouter).
    formData.append('model', 'openai/whisper-1');

    let response: Response;
    try {
      response = await fetch(OPENROUTER_STT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${keyToUse}`,
          'HTTP-Referer': 'https://aether-reminder.app',
          'X-Title': 'AETHER Reminder',
        },
        body: formData,
      });
    } catch (cause) {
      throw new TranscriptionError('NETWORK_ERROR', 'Could not reach OpenRouter transcription.', {
        cause,
      });
    }

    if (!response.ok) {
      // Do not attach response body to the error — it may contain sensitive material.
      throw new TranscriptionError(
        mapHttpStatus(response.status),
        'OpenRouter transcription request failed.',
        {
          status: response.status,
          retryAfterSeconds: getRetryAfterSeconds(response),
        }
      );
    }

    let payload: { text?: string };
    try {
      payload = (await response.json()) as { text?: string };
    } catch (cause) {
      throw new TranscriptionError('INVALID_RESPONSE', 'OpenRouter returned non-JSON transcription.', {
        cause,
      });
    }

    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text) {
      throw new TranscriptionError('INVALID_RESPONSE', 'OpenRouter returned an empty transcript.');
    }

    return parseSpeechToTasks(text);
  }
}

export const defaultTranscriptionProvider: SpeechToTextProvider = new OpenRouterSTTProvider();
