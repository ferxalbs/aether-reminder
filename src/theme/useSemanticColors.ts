import { useAetherTheme } from "./useAetherTheme";
import type { SemanticColors } from "./types";

/**
 * Returns the resolved semantic color palette for the current theme and color source.
 * Fully compatible with existing call sites and enhanced with rich semantic tokens.
 */
export function useSemanticColors(): SemanticColors {
  return useAetherTheme().colors;
}
