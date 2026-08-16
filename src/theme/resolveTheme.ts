import type { ThemePreference } from "@/types";

export type ResolvedTheme = "light" | "dark";

/**
 * Resolve user theme preference against the system appearance.
 * Preference `system` must follow the OS — never hardcode dark.
 */
export function resolveTheme(
  preference: ThemePreference,
  systemScheme: "light" | "dark" | null | undefined,
): ResolvedTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemScheme === "light" ? "light" : "dark";
}
