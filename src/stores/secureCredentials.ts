import { AIProviderError } from '@/services/ai/providers';

export type CredentialProvider = 'OpenRouter' | 'OpenAI';

export const OPENROUTER_API_KEY_STORAGE_KEY = 'aether-reminder.openrouter-api-key';
export const OPENAI_API_KEY_STORAGE_KEY = 'aether-reminder.openai-api-key';

export interface SecureStoreAdapter {
  isAvailableAsync: () => Promise<boolean>;
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: { keychainAccessible?: unknown }) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
}

export function storageKeyForProvider(provider: CredentialProvider): string {
  return provider === 'OpenRouter' ? OPENROUTER_API_KEY_STORAGE_KEY : OPENAI_API_KEY_STORAGE_KEY;
}

function secureStorageError(provider: CredentialProvider): AIProviderError {
  return new AIProviderError(
    'SECURE_STORAGE_UNAVAILABLE',
    `${provider} credentials cannot be stored because SecureStore is unavailable.`,
    { provider }
  );
}

function missingKeyError(provider: CredentialProvider): AIProviderError {
  return new AIProviderError('MISSING_API_KEY', `Enter an ${provider} API key first.`, { provider });
}

export async function isSecureStoreAvailable(adapter: SecureStoreAdapter): Promise<boolean> {
  try {
    return await adapter.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function loadProviderCredentials(adapter: SecureStoreAdapter): Promise<{
  openRouterApiKey: string;
  openAiApiKey: string;
}> {
  const [openRouterApiKey, openAiApiKey] = await Promise.all([
    readCredential(adapter, 'OpenRouter'),
    readCredential(adapter, 'OpenAI'),
  ]);
  return { openRouterApiKey, openAiApiKey };
}

async function readCredential(adapter: SecureStoreAdapter, provider: CredentialProvider): Promise<string> {
  try {
    return (await adapter.getItemAsync(storageKeyForProvider(provider)))?.trim() || '';
  } catch {
    return '';
  }
}

export async function saveProviderCredential(
  adapter: SecureStoreAdapter,
  provider: CredentialProvider,
  key: string,
  keychainAccessible?: unknown
): Promise<string> {
  const normalizedKey = key.trim();
  if (!normalizedKey) throw missingKeyError(provider);
  if (!(await isSecureStoreAvailable(adapter))) throw secureStorageError(provider);
  try {
    await adapter.setItemAsync(storageKeyForProvider(provider), normalizedKey, {
      keychainAccessible,
    });
  } catch {
    throw secureStorageError(provider);
  }
  return normalizedKey;
}

export async function deleteProviderCredential(
  adapter: SecureStoreAdapter,
  provider: CredentialProvider
): Promise<void> {
  if (!(await isSecureStoreAvailable(adapter))) throw secureStorageError(provider);
  try {
    await adapter.deleteItemAsync(storageKeyForProvider(provider));
  } catch {
    throw secureStorageError(provider);
  }
}
