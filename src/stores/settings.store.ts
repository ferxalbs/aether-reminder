import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { UserSettings } from '@/types';
import { AIProviderError } from '@/services/ai/providers';

const OPENROUTER_API_KEY_STORAGE_KEY = 'aether-reminder.openrouter-api-key';

interface SettingsState extends UserSettings {
  /** Loaded into memory only; excluded from the persisted Zustand snapshot below. */
  openRouterApiKey: string;
  apiKeyLoaded: boolean;
  secureStoreAvailable: boolean;
  loadApiKey: () => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  deleteApiKey: () => Promise<void>;
  setModel: (model: string) => void;
  setTheme: (theme: UserSettings['theme']) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setAutoSummarize: (enabled: boolean) => void;
  resetSettings: () => Promise<void>;
}

const initialSettings: UserSettings = {
  openRouterApiKey: '',
  selectedModel: '',
  theme: 'dark',
  hapticsEnabled: true,
  autoSummarize: true,
};

async function getSecureStoreAvailability(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

function secureStorageError(): AIProviderError {
  return new AIProviderError('SECURE_STORAGE_UNAVAILABLE', 'Secure storage is unavailable on this device.');
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...initialSettings,
      apiKeyLoaded: false,
      secureStoreAvailable: false,

      loadApiKey: async () => {
        const available = await getSecureStoreAvailability();
        if (!available) {
          set({ apiKeyLoaded: true, secureStoreAvailable: false, openRouterApiKey: '' });
          return;
        }

        try {
          const apiKey = await SecureStore.getItemAsync(OPENROUTER_API_KEY_STORAGE_KEY);
          set({ apiKeyLoaded: true, secureStoreAvailable: true, openRouterApiKey: apiKey?.trim() || '' });
        } catch {
          // A key can be invalidated by the platform. Do not surface or log its value.
          set({ apiKeyLoaded: true, secureStoreAvailable: true, openRouterApiKey: '' });
        }
      },

      setApiKey: async (key) => {
        const normalizedKey = key.trim();
        if (!normalizedKey) throw new AIProviderError('MISSING_API_KEY', 'Enter an OpenRouter API key first.');
        if (!(await getSecureStoreAvailability())) throw secureStorageError();

        try {
          await SecureStore.setItemAsync(OPENROUTER_API_KEY_STORAGE_KEY, normalizedKey, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED,
          });
          set({ apiKeyLoaded: true, secureStoreAvailable: true, openRouterApiKey: normalizedKey });
        } catch {
          throw secureStorageError();
        }
      },

      deleteApiKey: async () => {
        if (!(await getSecureStoreAvailability())) throw secureStorageError();
        try {
          await SecureStore.deleteItemAsync(OPENROUTER_API_KEY_STORAGE_KEY);
          set({ openRouterApiKey: '', apiKeyLoaded: true, secureStoreAvailable: true });
        } catch {
          throw secureStorageError();
        }
      },

      setModel: (model) => set({ selectedModel: model }),
      setTheme: (theme) => set({ theme }),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      setAutoSummarize: (enabled) => set({ autoSummarize: enabled }),
      resetSettings: async () => {
        await get().deleteApiKey();
        set({ ...initialSettings, apiKeyLoaded: true, secureStoreAvailable: true });
      },
    }),
    {
      name: 'aether-reminder-settings',
      storage: createJSONStorage(() => AsyncStorage),
      // Only non-secret preferences are serialized. The API key never reaches AsyncStorage.
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        theme: state.theme,
        hapticsEnabled: state.hapticsEnabled,
        autoSummarize: state.autoSummarize,
      }),
    }
  )
);

