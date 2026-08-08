import { describe, expect, test } from 'bun:test';
import { fetchAvailableModels } from './openrouter';

const mockModel = {
  id: 'openai/gpt-4o-mini',
  name: 'GPT-4o Mini',
  architecture: {
    input_modalities: ['text'],
    output_modalities: ['text'],
  },
  supported_parameters: ['tools', 'tool_choice', 'structured_outputs'],
};

describe('fetchAvailableModels force refresh', () => {
  test('bypasses cache when forceRefresh is true', async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      callCount += 1;
      return new Response(JSON.stringify({ data: [mockModel] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      // First fetch fills cache
      const first = await fetchAvailableModels('sk-test', true);
      expect(first).toHaveLength(1);
      expect(callCount).toBe(1);

      // Normal fetch uses cache
      const cached = await fetchAvailableModels('sk-test', false);
      expect(cached).toHaveLength(1);
      expect(callCount).toBe(1);

      // Forced refresh bypasses cache
      const refreshed = await fetchAvailableModels('sk-test', true);
      expect(refreshed).toHaveLength(1);
      expect(callCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
