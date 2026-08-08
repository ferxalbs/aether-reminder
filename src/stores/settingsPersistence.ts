import { DEFAULT_OPENROUTER_MODEL_ID } from '@/services/ai/models';
export {
  OPENAI_API_KEY_STORAGE_KEY,
  OPENROUTER_API_KEY_STORAGE_KEY,
} from './secureCredentials';

export interface PersistedSettings {
  selectedModel: string;
  theme: 'system' | 'dark' | 'light';
  hapticsEnabled: boolean;
  autoSummarize: boolean;
}

export interface SettingsPersistenceInput extends PersistedSettings {
  openRouterApiKey?: string;
  openAiApiKey?: string;
}

/** The AsyncStorage boundary contains preferences only, never either provider secret. */
export function persistedSettingsSnapshot(state: SettingsPersistenceInput): PersistedSettings {
  return {
    selectedModel: state.selectedModel?.trim() || DEFAULT_OPENROUTER_MODEL_ID,
    theme: state.theme,
    hapticsEnabled: state.hapticsEnabled,
    autoSummarize: state.autoSummarize,
  };
}
