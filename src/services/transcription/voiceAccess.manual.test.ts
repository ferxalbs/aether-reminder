import { expect, test } from 'bun:test';
import { OpenAIByokClientSecretProvider } from './auth';
import { OpenAIRealtimeWebSocketTransport } from './openaiRealtimeWebSocketTransport';
import {
  buildRealtimeSessionPayload,
  buildRealtimeTranscriptionWebSocketUrl,
  isTranscriptionWebSocketUrl,
  nestedTranscriptionModel,
} from './protocol';
import {
  REALTIME_TRANSCRIPTION_MODEL,
  minimalRealtimeTranscriptionConfig,
  type RealtimeTransportEvent,
} from './types';

const apiKey = process.env.OPENAI_API_KEY ?? '';

type LiveStage =
  | 'CLIENT_SECRET'
  | 'WEBSOCKET'
  | 'SESSION_CONFIGURATION'
  | 'AUDIO_APPEND'
  | 'COMMIT'
  | 'TRANSCRIPTION';

function failAt(stage: LiveStage, detail: string): never {
  throw new Error(`LIVE OPENAI FAILED at ${stage}: ${detail}`);
}

function deterministicPcmFixture(): ArrayBuffer {
  const sampleRate = 24_000;
  const durationMs = 1_000;
  const samples = Math.floor(sampleRate * durationMs / 1_000);
  const data = new ArrayBuffer(samples * 2);
  const view = new DataView(data);
  for (let index = 0; index < samples; index += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 2_000);
    view.setInt16(index * 2, sample, true);
  }
  return data;
}

test.skipIf(!apiKey)('live: gpt-live-transcribe transcription session accepts PCM and completes', async () => {
  const session = buildRealtimeSessionPayload(minimalRealtimeTranscriptionConfig);
  expect(session.type).toBe('transcription');
  expect(session).not.toHaveProperty('model');
  expect(nestedTranscriptionModel(session)).toBe(REALTIME_TRANSCRIPTION_MODEL);
  expect(isTranscriptionWebSocketUrl(buildRealtimeTranscriptionWebSocketUrl())).toBe(true);

  let stage: LiveStage = 'CLIENT_SECRET';
  const transport = new OpenAIRealtimeWebSocketTransport({
    configurationTimeoutMs: 20_000,
    connectionTimeoutMs: 20_000,
    finalTranscriptTimeoutMs: 30_000,
  });
  let outcomeTimeout: ReturnType<typeof setTimeout> | null = null;
  const outcomePromise = new Promise<RealtimeTransportEvent>((resolve, reject) => {
    outcomeTimeout = setTimeout(() => reject(new Error('timed out waiting for provider completion')), 45_000);
    transport.subscribe((event) => {
      if (event.type !== 'completed' && event.type !== 'failed') return;
      if (outcomeTimeout) clearTimeout(outcomeTimeout);
      outcomeTimeout = null;
      resolve(event);
    });
  });

  try {
    let secret;
    try {
      secret = await new OpenAIByokClientSecretProvider(apiKey)
        .create(minimalRealtimeTranscriptionConfig);
    } catch (error) {
      failAt('CLIENT_SECRET', error instanceof Error ? error.message : String(error));
    }
    expect(secret.modelAccess).toBe('MODEL_EXISTS');

    stage = 'WEBSOCKET';
    try {
      await transport.connect(secret.value);
    } catch (error) {
      failAt('WEBSOCKET', error instanceof Error ? error.message : String(error));
    }

    stage = 'SESSION_CONFIGURATION';
    try {
      await transport.configure(minimalRealtimeTranscriptionConfig);
    } catch (error) {
      failAt('SESSION_CONFIGURATION', error instanceof Error ? error.message : String(error));
    }
    expect(transport.currentState).toBe('ready');

    stage = 'AUDIO_APPEND';
    try {
      transport.appendPcm(deterministicPcmFixture());
    } catch (error) {
      failAt('AUDIO_APPEND', error instanceof Error ? error.message : String(error));
    }

    stage = 'COMMIT';
    try {
      transport.commit();
    } catch (error) {
      failAt('COMMIT', error instanceof Error ? error.message : String(error));
    }

    stage = 'TRANSCRIPTION';
    let result: RealtimeTransportEvent;
    try {
      result = await outcomePromise;
    } catch (error) {
      failAt(stage, error instanceof Error ? error.message : String(error));
    }
    if (result.type === 'failed') {
      const provider = result.error.providerError;
      failAt('TRANSCRIPTION', [
        result.error.code,
        provider?.code,
        provider?.type,
        provider?.message,
        provider?.requestId,
      ].filter(Boolean).join(' '));
    }
    expect(result.type).toBe('completed');
    if (result.type === 'completed') {
      expect(result.itemId.length).toBeGreaterThan(0);
      expect(typeof result.transcript).toBe('string');
    }
  } finally {
    if (outcomeTimeout) clearTimeout(outcomeTimeout);
    transport.close();
  }
});

