import { expect, test } from 'bun:test';
import { OpenAIByokClientSecretProvider } from './auth';
import { defaultRealtimeTranscriptionConfig } from './types';

const enabled = process.env.RUN_AETHER_VOICE_INTEGRATION === '1';
const apiKey = process.env.OPENAI_API_KEY ?? '';

test.skipIf(!enabled || !apiKey)('manual: configured account can create a GPT Live Transcribe client secret', async () => {
  const result = await new OpenAIByokClientSecretProvider(apiKey)
    .create(defaultRealtimeTranscriptionConfig);
  expect(result.modelAccess).toBe('MODEL_EXISTS');
  expect(result.value.length).toBeGreaterThan(10);
  expect(result.expiresAt).toBeGreaterThan(Date.now() / 1000);
});
