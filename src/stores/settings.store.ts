import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { UserSettings } from "@/types";
import { reportNonFatalError } from "@/lib/nonFatalError";
import { persistedSettingsSnapshot } from "./settingsPersistence";
import {
  cleanupLegacyProviderCredentials,
  type SecureStoreAdapter,
} from "./secureCredentials";

export {
  LEGACY_OPENAI_API_KEY_STORAGE_KEY,
  LEGACY_OPENROUTER_API_KEY_STORAGE_KEY,
  persistedSettingsSnapshot,
} from "./settingsPersistence";
const LEGACY_SETTINGS_STORAGE_KEY = "taskflow-settings-storage";

export interface SettingsState extends UserSettings {
  loadSettings: () => Promise<void>;
  setTheme: (theme: UserSettings["theme"]) => void;
  setMaterialColorsEnabled: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setAutoSummarize: (enabled: boolean) => void;
  setAdaptiveNudgesEnabled: (enabled: boolean) => void;
  resetSettings: () => Promise<void>;
}

export const initialSettings: UserSettings = {
  theme: "system",
  materialColorsEnabled: false,
  hapticsEnabled: true,
  autoSummarize: true,
  adaptiveNudgesEnabled: false,
};

const secureStoreAdapter: SecureStoreAdapter = {
  isAvailableAsync: () => SecureStore.isAvailableAsync(),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialSettings,

      loadSettings: async () => {
        // Run bounded one-time legacy SecureStore key cleanup.
        await cleanupLegacyProviderCredentials(secureStoreAdapter).catch(
          (error: unknown) => {
            reportNonFatalError("legacy-byok-cleanup", error);
          },
        );

        // Remove the pre-BYOK legacy settings blob if still present on disk.
        await AsyncStorage.removeItem(LEGACY_SETTINGS_STORAGE_KEY).catch(
          (error: unknown) => {
            reportNonFatalError("legacy-settings-cleanup", error);
          },
        );
      },

      setTheme: (theme) => set({ theme }),
      setMaterialColorsEnabled: (enabled) =>
        set({ materialColorsEnabled: enabled }),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      setAutoSummarize: (enabled) => set({ autoSummarize: enabled }),
      setAdaptiveNudgesEnabled: (enabled) =>
        set({ adaptiveNudgesEnabled: enabled }),
      resetSettings: async () => {
        set({
          ...initialSettings,
        });
      },
    }),
    {
      name: "aether-reminder-settings",
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      partialize: (state: SettingsState) => persistedSettingsSnapshot(state),
      merge: (persisted, current) => {
        const stored = persisted as Partial<UserSettings> | undefined;
        return {
          ...current,
          theme: stored?.theme ?? current.theme,
          materialColorsEnabled:
            stored?.materialColorsEnabled ?? current.materialColorsEnabled,
          hapticsEnabled: stored?.hapticsEnabled ?? current.hapticsEnabled,
          autoSummarize: stored?.autoSummarize ?? current.autoSummarize,
          adaptiveNudgesEnabled:
            stored?.adaptiveNudgesEnabled ?? current.adaptiveNudgesEnabled,
        };
      },
    },
  ),
);
