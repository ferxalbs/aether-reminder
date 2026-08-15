import { describe, expect, test } from 'bun:test';
import {
  OPENAI_API_KEY_STORAGE_KEY,
  OPENROUTER_API_KEY_STORAGE_KEY,
  persistedSettingsSnapshot,
} from './settingsPersistence';
import {
  deleteProviderCredential,
  loadProviderCredentials,
  saveProviderCredential,
  storageKeyForProvider,
  type SecureStoreAdapter,
} from './secureCredentials';
import { DEFAULT_OPENROUTER_MODEL_ID } from '@/services/ai/models';

describe('independent provider credentials', () => {
  test('uses distinct SecureStore keys and never persists either secret', () => {
    expect(OPENROUTER_API_KEY_STORAGE_KEY).not.toBe(OPENAI_API_KEY_STORAGE_KEY);
    const snapshot = persistedSettingsSnapshot({
      selectedModel: DEFAULT_OPENROUTER_MODEL_ID,
      theme: 'dark',
      hapticsEnabled: true,
      autoSummarize: true,
      openRouterApiKey: 'or-secret',
      openAiApiKey: 'oa-secret',
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('or-secret');
    expect(serialized).not.toContain('oa-secret');
    expect(serialized).not.toContain('ApiKey');
    expect(snapshot.selectedModel).toBe(DEFAULT_OPENROUTER_MODEL_ID);
  });

  test('material colors remain opt-in and persist when enabled', () => {
    const defaults = persistedSettingsSnapshot({
      selectedModel: DEFAULT_OPENROUTER_MODEL_ID,
      theme: 'system',
      hapticsEnabled: true,
      autoSummarize: true,
    });
    expect(defaults.materialColorsEnabled).toBe(false);

    const enabled = persistedSettingsSnapshot({
      ...defaults,
      materialColorsEnabled: true,
    });
    expect(enabled.materialColorsEnabled).toBe(true);
  });

  test('blank persisted model data resolves to the deterministic default', () => {
    const snapshot = persistedSettingsSnapshot({
      theme: 'dark',
      hapticsEnabled: true,
      autoSummarize: true,
      selectedModel: '',
    });
    expect(snapshot.selectedModel).toBe(DEFAULT_OPENROUTER_MODEL_ID);
  });

  test('save, load, and delete keep OpenRouter and OpenAI credentials isolated', async () => {
    const values = new Map<string, string>();
    const writes: string[] = [];
    const adapter: SecureStoreAdapter = {
      isAvailableAsync: async () => true,
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => {
        writes.push(key);
        values.set(key, value);
      },
      deleteItemAsync: async (key) => {
        writes.push(`delete:${key}`);
        values.delete(key);
      },
    };
    await saveProviderCredential(adapter, 'OpenRouter', ' or-key ');
    await saveProviderCredential(adapter, 'OpenAI', ' oa-key ');
    expect(await loadProviderCredentials(adapter)).toEqual({ openRouterApiKey: 'or-key', openAiApiKey: 'oa-key' });
    await deleteProviderCredential(adapter, 'OpenAI');
    expect(await loadProviderCredentials(adapter)).toEqual({ openRouterApiKey: 'or-key', openAiApiKey: '' });
    expect(writes).toEqual([
      storageKeyForProvider('OpenRouter'),
      storageKeyForProvider('OpenAI'),
      `delete:${storageKeyForProvider('OpenAI')}`,
    ]);
  });
});
