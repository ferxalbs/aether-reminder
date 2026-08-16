import { getSemanticColors } from "./tokens";
import { useSettingsStore } from "@/stores/settings.store";
import { useIsDark } from "./useResolvedTheme";

export function useSemanticColors() {
  const isDark = useIsDark();
  const materialColorsEnabled = useSettingsStore(
    (state) => state.materialColorsEnabled,
  );
  return getSemanticColors(isDark ? "dark" : "light", materialColorsEnabled);
}
