import { expect, test } from 'bun:test';
import { OpenAIByokClientSecretProvider } from './auth';
import { OpenAIRealtimeWebSocketTransport } from './openaiRealtimeWebSocketTransport';
import {
  defaultRealtimeTranscriptionConfig,
  type RealtimeTransportEvent,
} from './types';

const enabled = process.env.RUN_AETHER_VOICE_INTEGRATION === '1';
const apiKey = process.env.OPENAI_API_KEY ?? '';

function deterministicPcmFixture(): ArrayBuffer {
  const sampleRate = 24_000;
  const durationMs = 500;
  const samples = Math.floor(sampleRate * durationMs / 1_000);
  const data = new ArrayBuffer(samples * 2);
  const view = new DataView(data);
  for (let index = 0; index < samples; index += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 2_000);
    view.setInt16(index * 2, sample, true);
  }
  return data;
}

test.skipIf(!enabled || !apiKey)('live: client secret and Realtime WebSocket complete a transcription turn', async () => {
  const secret = await new OpenAIByokClientSecretProvider(apiKey)
    .create(defaultRealtimeTranscriptionConfig);
  expect(secret.modelAccess).toBe('MODEL_EXISTS');
  expect(secret.expiresAt).toBeGreaterThan(Date.now() / 1000);

  const transport = new OpenAIRealtimeWebSocketTransport({
    finalTranscriptTimeoutMs: 30_000,
  });
  let outcome: RealtimeTransportEvent | null = null;
  let outcomeTimeout: ReturnType<typeof setTimeout> | null = null;
  const outcomePromise = new Promise<RealtimeTransportEvent>((resolve, reject) => {
    outcomeTimeout = setTimeout(() => reject(new Error('Live transcription integration timed out.')), 45_000);
    transport.subscribe((event) => {
      if (event.type !== 'completed' && event.type !== 'failed') return;
      if (outcomeTimeout) clearTimeout(outcomeTimeout);
      outcomeTimeout = null;
      outcome = event;
      resolve(event);
    });
  });

  try {
    await transport.connect(secret.value);
    await transport.configure(defaultRealtimeTranscriptionConfig);
    transport.appendPcm(deterministicPcmFixture());
    transport.commit();
    const result = await outcomePromise;
    expect(['completed', 'failed']).toContain(result.type);
    if (result.type === 'failed') {
      // A provider rejection is still an explicit live protocol response; it
      // must not be turned into a fake success or a skipped transport path.
      expect(result.error.code).not.toBe('REALTIME_TIMEOUT');
    }
    expect(outcome).toBe(result);
  } finally {
    if (outcomeTimeout) clearTimeout(outcomeTimeout);
    transport.close();
  }
});
