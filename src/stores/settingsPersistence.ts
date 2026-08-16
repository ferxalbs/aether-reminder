export {
  LEGACY_OPENAI_API_KEY_STORAGE_KEY,
  LEGACY_OPENROUTER_API_KEY_STORAGE_KEY,
} from "./secureCredentials";

export interface PersistedSettings {
  theme: "system" | "dark" | "light";
  /** Optional for backwards compatibility with snapshots created before Material colors existed. */
  materialColorsEnabled?: boolean;
  hapticsEnabled: boolean;
  autoSummarize: boolean;
  adaptiveNudgesEnabled?: boolean;
}

export type SettingsPersistenceInput = PersistedSettings;

/** The AsyncStorage boundary contains preferences only, never provider secrets. */
export function persistedSettingsSnapshot(
  state: SettingsPersistenceInput,
): PersistedSettings {
  return {
    theme: state.theme,
    materialColorsEnabled: state.materialColorsEnabled ?? false,
    hapticsEnabled: state.hapticsEnabled,
    autoSummarize: state.autoSummarize,
    adaptiveNudgesEnabled: state.adaptiveNudgesEnabled ?? false,
  };
}
