import { useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";
import type { Material3ColorRoles } from "./types";

type ComposeMaterialColorsModule = {
  isDynamicColorAvailable?: boolean;
  getMaterialColors?: (options: {
    scheme: "light" | "dark";
  }) => Material3ColorRoles;
};

function getComposeMaterialColorsModule(): ComposeMaterialColorsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@expo/ui/jetpack-compose") as ComposeMaterialColorsModule;
  } catch {
    return null;
  }
}

/**
 * Checks whether Android Material You dynamic wallpaper colors are available.
 * Returns true only on Android 12+ (API 31+) when @expo/ui/jetpack-compose is available.
 */
export function isAndroidDynamicColorAvailable(): boolean {
  if (Platform.OS !== "android") return false;
  return Boolean(getComposeMaterialColorsModule()?.isDynamicColorAvailable);
}

/**
 * Synchronously retrieves the Android Material 3 dynamic color scheme from @expo/ui/jetpack-compose.
 *
 * CRITICAL: We pass ONLY `{ scheme }` with NO seedColor.
 * Passing seedColor forces Compose to generate a SchemeTonalSpot palette from that seed,
 * preventing extraction of the user's actual wallpaper palette.
 */
export function getAndroidMaterialColors(
  scheme: "light" | "dark",
): Material3ColorRoles | null {
  // The SDK returns the static Material 3 baseline when dynamic colors are
  // unavailable. Do not accept that baseline as Material You.
  if (!isAndroidDynamicColorAvailable()) return null;

  const compose = getComposeMaterialColorsModule();
  if (!compose?.getMaterialColors) return null;

  try {
    const colors = compose.getMaterialColors({ scheme });
    if (!colors || typeof colors !== "object" || !colors.primary) return null;
    return colors;
  } catch {
    return null;
  }
}

/**
 * Retrieves the Android dynamic palette when enabled on Android.
 */
export function useAndroidMaterialPalette(
  scheme: "light" | "dark",
  enabled: boolean,
): Material3ColorRoles | null {
  const [foregroundRevision, setForegroundRevision] = useState(0);

  useEffect(() => {
    if (!enabled || Platform.OS !== "android") return undefined;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        // Wallpaper and system palette changes can happen while AETHER is
        // backgrounded. Re-read the native palette on the next foreground.
        setForegroundRevision((revision) => revision + 1);
      }
    });

    return () => subscription.remove();
  }, [enabled]);

  const paletteReadKey = `${scheme}:${foregroundRevision}`;
  return useMemo(() => {
    const paletteScheme = paletteReadKey.startsWith("light:")
      ? "light"
      : "dark";
    return enabled ? getAndroidMaterialColors(paletteScheme) : null;
  }, [enabled, paletteReadKey]);
}
