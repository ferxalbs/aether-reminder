import { Platform } from "react-native";
import type { Material3ColorRoles } from "./types";

/**
 * Checks whether Android Material You dynamic wallpaper colors are available.
 * Returns true only on Android 12+ (API 31+) when @expo/ui/jetpack-compose is available.
 */
export function isAndroidDynamicColorAvailable(): boolean {
  if (Platform.OS !== "android") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const compose = require("@expo/ui/jetpack-compose");
    return Boolean(compose?.isDynamicColorAvailable);
  } catch {
    return false;
  }
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
  if (Platform.OS !== "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const compose = require("@expo/ui/jetpack-compose");
    if (!compose?.getMaterialColors) return null;
    const colors = compose.getMaterialColors({ scheme });
    if (!colors || typeof colors !== "object" || !colors.primary) {
      return null;
    }
    return colors as Material3ColorRoles;
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
  if (!enabled || Platform.OS !== "android") {
    return null;
  }
  return getAndroidMaterialColors(scheme);
}
