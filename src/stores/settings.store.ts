import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { UserSettings } from '@/types';
import { DEFAULT_OPENROUTER_MODEL_ID } from '@/services/ai/models';
import { reportNonFatalError } from '@/lib/nonFatalError';
import {
  persistedSettingsSnapshot,
} from './settingsPersistence';
import {
  deleteProviderCredential,
  isSecureStoreAvailable,
  loadProviderCredentials,
  saveProviderCredential,
  type SecureStoreAdapter,
} from './secureCredentials';

export { OPENAI_API_KEY_STORAGE_KEY, OPENROUTER_API_KEY_STORAGE_KEY, persistedSettingsSnapshot } from './settingsPersistence';
const LEGACY_SETTINGS_STORAGE_KEY = 'taskflow-settings-storage';

export interface SettingsState extends UserSettings {
  /** Loaded into memory only; excluded from the persisted Zustand snapshot below. */
  openRouterApiKey: string;
  /** Loaded into memory only; excluded from the persisted Zustand snapshot below. */
  openAiApiKey: string;
  openRouterKeyLoaded: boolean;
  openAiKeyLoaded: boolean;
  openRouterConfigured: boolean;
  openAiConfigured: boolean;
  secureStoreAvailable: boolean;
  loadCredentials: () => Promise<void>;
  setOpenRouterApiKey: (key: string) => Promise<void>;
  deleteOpenRouterApiKey: () => Promise<void>;
  setOpenAiApiKey: (key: string) => Promise<void>;
  deleteOpenAiApiKey: () => Promise<void>;
  setModel: (model: string) => void;
  setTheme: (theme: UserSettings['theme']) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setAutoSummarize: (enabled: boolean) => void;
  resetSettings: () => Promise<void>;
}

export const initialSettings: UserSettings = {
  selectedModel: DEFAULT_OPENROUTER_MODEL_ID,
  theme: 'dark',
  hapticsEnabled: true,
  autoSummarize: true,
};

const secureStoreAdapter: SecureStoreAdapter = {
  isAvailableAsync: () => SecureStore.isAvailableAsync(),
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value, options) => SecureStore.setItemAsync(
    key,
    value,
    options as Parameters<typeof SecureStore.setItemAsync>[2]
  ),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...initialSettings,
      openRouterApiKey: '',
      openAiApiKey: '',
      openRouterKeyLoaded: false,
      openAiKeyLoaded: false,
      openRouterConfigured: false,
      openAiConfigured: false,
      secureStoreAvailable: false,

      loadCredentials: async () => {
        const available = await isSecureStoreAvailable(secureStoreAdapter);
        // Remove the pre-BYOK settings blob, which could contain a legacy plaintext key.
        await AsyncStorage.removeItem(LEGACY_SETTINGS_STORAGE_KEY).catch((error: unknown) => {
          reportNonFatalError('legacy-settings-cleanup', error);
        });

        if (!available) {
          set({
            openRouterApiKey: '',
            openAiApiKey: '',
            openRouterKeyLoaded: true,
            openAiKeyLoaded: true,
            openRouterConfigured: false,
            openAiConfigured: false,
            secureStoreAvailable: false,
          });
          return;
        }

        const { openRouterApiKey, openAiApiKey } = await loadProviderCredentials(secureStoreAdapter);
        set({
          openRouterApiKey,
          openAiApiKey,
          openRouterKeyLoaded: true,
          openAiKeyLoaded: true,
          openRouterConfigured: Boolean(openRouterApiKey),
          openAiConfigured: Boolean(openAiApiKey),
          secureStoreAvailable: true,
        });
      },

      setOpenRouterApiKey: async (key) => {
        const normalizedKey = await saveProviderCredential(secureStoreAdapter, 'OpenRouter', key, SecureStore.WHEN_UNLOCKED);
        set({
          openRouterApiKey: normalizedKey,
          openRouterKeyLoaded: true,
          openRouterConfigured: true,
          secureStoreAvailable: true,
        });
      },

      deleteOpenRouterApiKey: async () => {
        await deleteProviderCredential(secureStoreAdapter, 'OpenRouter');
        set({
          openRouterApiKey: '',
          openRouterKeyLoaded: true,
          openRouterConfigured: false,
          secureStoreAvailable: true,
        });
      },

      setOpenAiApiKey: async (key) => {
        const normalizedKey = await saveProviderCredential(secureStoreAdapter, 'OpenAI', key, SecureStore.WHEN_UNLOCKED);
        set({
          openAiApiKey: normalizedKey,
          openAiKeyLoaded: true,
          openAiConfigured: true,
          secureStoreAvailable: true,
        });
      },

      deleteOpenAiApiKey: async () => {
        await deleteProviderCredential(secureStoreAdapter, 'OpenAI');
        set({
          openAiApiKey: '',
          openAiKeyLoaded: true,
          openAiConfigured: false,
          secureStoreAvailable: true,
        });
      },

      setModel: (model) => set({ selectedModel: model.trim() || DEFAULT_OPENROUTER_MODEL_ID }),
      setTheme: (theme) => set({ theme }),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      setAutoSummarize: (enabled) => set({ autoSummarize: enabled }),
      resetSettings: async () => {
        await Promise.all([
          deleteProviderCredential(secureStoreAdapter, 'OpenRouter'),
          deleteProviderCredential(secureStoreAdapter, 'OpenAI'),
        ]);
        set({
          ...initialSettings,
          openRouterApiKey: '',
          openAiApiKey: '',
          openRouterKeyLoaded: true,
          openAiKeyLoaded: true,
          openRouterConfigured: false,
          openAiConfigured: false,
          secureStoreAvailable: true,
        });
      },
    }),
    {
      name: 'aether-reminder-settings',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      // Only non-secret preferences are serialized. The API keys never reach AsyncStorage.
      partialize: (state: SettingsState) => persistedSettingsSnapshot(state),
      merge: (persisted, current) => {
        const stored = persisted as Partial<UserSettings> | undefined;
        return {
          ...current,
          selectedModel: stored?.selectedModel?.trim() || DEFAULT_OPENROUTER_MODEL_ID,
          theme: stored?.theme ?? current.theme,
          hapticsEnabled: stored?.hapticsEnabled ?? current.hapticsEnabled,
          autoSummarize: stored?.autoSummarize ?? current.autoSummarize,
        };
      },
    }
  )
);
