import { afterEach, describe, expect, test } from 'bun:test';
import { OpenAIByokClientSecretProvider, buildRealtimeSessionPayload } from './auth';
import { defaultRealtimeTranscriptionConfig } from './types';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe('Realtime client-secret authentication', () => {
  test('mints a short-lived secret with the requested transcription session', async () => {
    let authorization = '';
    let body = '';
    globalThis.fetch = (async (_input, init) => {
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      body = String(init?.body);
      return new Response(JSON.stringify({ value: 'ek_test', expires_at: 12345 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const secret = await new OpenAIByokClientSecretProvider('user-standard-key')
      .create(defaultRealtimeTranscriptionConfig);
    expect(secret).toEqual({ value: 'ek_test', expiresAt: 12345, modelAccess: 'MODEL_EXISTS' });
    expect(authorization).toBe('Bearer user-standard-key');
    expect(JSON.parse(body).session).toEqual(buildRealtimeSessionPayload(defaultRealtimeTranscriptionConfig));
  });

  test('preserves invalid-credential status and provider details without exposing the key', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      error: { code: 'invalid_api_key', message: 'Incorrect API key.', type: 'invalid_request_error' },
    }), { status: 401, headers: { 'x-request-id': 'req_1' } })) as typeof fetch;
    await expect(new OpenAIByokClientSecretProvider('secret-value')
      .create(defaultRealtimeTranscriptionConfig)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIAL',
      status: 401,
      providerError: {
        code: 'invalid_api_key',
        message: 'Incorrect API key.',
        type: 'invalid_request_error',
        requestId: 'req_1',
      },
    });
  });

  test('distinguishes tier, account, configuration, and temporary model failures', async () => {
    const cases = [
      [403, 'tier_not_supported', 'Free tier not supported', 'TIER_NOT_SUPPORTED'],
      [403, 'model_not_found', 'Project does not have access', 'ACCOUNT_NOT_AUTHORIZED'],
      [400, 'invalid_request_error', 'Invalid session configuration', 'SESSION_CONFIGURATION_INVALID'],
      [503, 'server_error', 'Temporarily unavailable', 'MODEL_TEMPORARILY_UNAVAILABLE'],
    ] as const;
    for (const [status, code, message, expected] of cases) {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code, message } }), {
        status,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
      await expect(new OpenAIByokClientSecretProvider('key')
        .create(defaultRealtimeTranscriptionConfig)).rejects.toMatchObject({ code: expected });
    }
  });

  test('supports configurable language, keyword, and prompt hints', () => {
    const session = buildRealtimeSessionPayload({
      ...defaultRealtimeTranscriptionConfig,
      context: { languages: ['en', 'es'], keywords: ['AETHER'], prompt: 'Personal reminder.' },
    }) as { audio: { input: { transcription: Record<string, unknown> } } };
    expect(session.audio.input.transcription).toMatchObject({
      languages: ['en', 'es'],
      keywords: ['AETHER'],
      prompt: 'Personal reminder.',
    });
  });
});
