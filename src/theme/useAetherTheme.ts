import { useMemo } from "react";
import { useSettingsStore } from "@/stores/settings.store";
import {
  isAndroidDynamicColorAvailable,
  useAndroidMaterialPalette,
} from "./materialYou";
import { resolveAetherTheme } from "./resolveAetherTheme";
import type { AetherTheme } from "./types";
import { useResolvedTheme } from "./useResolvedTheme";

/**
 * Primary React hook for consuming the unified AETHER design system theme.
 * Resolves appearance (light/dark) and color source (AETHER monochrome vs Android Material You)
 * seamlessly across Android, iOS, and iPadOS.
 */
export function useAetherTheme(): AetherTheme {
  const mode = useResolvedTheme();
  const materialColorsEnabled = useSettingsStore(
    (state) => state.materialColorsEnabled,
  );
  const isDynamicColorAvailable = isAndroidDynamicColorAvailable();
  const dynamicPalette = useAndroidMaterialPalette(mode, materialColorsEnabled);

  return useMemo(
    () =>
      resolveAetherTheme(
        mode,
        materialColorsEnabled,
        dynamicPalette,
        isDynamicColorAvailable,
      ),
    [mode, materialColorsEnabled, dynamicPalette, isDynamicColorAvailable],
  );
}
