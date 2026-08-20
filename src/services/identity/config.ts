export type SupabaseAuthConfig = {
  url: string;
  publishableKey: string;
};

function isProductionBuild(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    typeof __DEV__ !== "undefined" &&
    !__DEV__
  );
}

function readSupabaseUrl(
  env: Record<string, string | undefined>,
  isProduction: boolean,
): string {
  const raw = env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!raw) return "";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && !isProduction)
  ) {
    return "";
  }
  return raw.replace(/\/+$/, "");
}

export function resolveSupabaseAuthConfig(
  env: Record<string, string | undefined> = process.env,
  isProduction = isProductionBuild(),
): SupabaseAuthConfig | null {
  const url = readSupabaseUrl(env, isProduction);
  const publishableKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!url || !publishableKey || /\s/.test(publishableKey)) return null;
  return { url, publishableKey };
}

export function assertProductionSupabaseAuthConfig(
  env: Record<string, string | undefined> = process.env,
): SupabaseAuthConfig {
  const url = readSupabaseUrl(env, true);
  if (!url) {
    throw new Error(
      "Missing or invalid EXPO_PUBLIC_SUPABASE_URL in release/production configuration.",
    );
  }
  const publishableKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!publishableKey || /\s/.test(publishableKey)) {
    throw new Error(
      "Missing or invalid EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in release/production configuration.",
    );
  }
  return { url, publishableKey };
}

export function publicSupabaseEnvSnapshot(
  env: Record<string, string | undefined> = process.env,
): { configured: boolean; hasUrl: boolean; hasPublishableKey: boolean } {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  return {
    configured: Boolean(url && publishableKey),
    hasUrl: Boolean(url),
    hasPublishableKey: Boolean(publishableKey),
  };
}
