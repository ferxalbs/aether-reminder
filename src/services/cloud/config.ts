export const AETHER_CLOUD_TOOLSET_VERSION = "aether.tasks.v1";
export const AETHER_CLOUD_CAPABILITY = "assistant.turn";
export const AETHER_HOSTED_MODEL_ID = "deepseek/deepseek-v4-flash-0731";

export const DEFAULT_E2E_USER_ID = "e2e.mobile.physical.aether-reminder";
export const DEFAULT_E2E_DEVICE_ID = "e2e.device.physical.dev";

const USER_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export type AetherCloudConfig = {
  baseUrl: string;
  userId: string;
  deviceId: string;
};

export type AetherRuntimeConfig = {
  cloudOrigin: string;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function validateAetherCloudUrl(
  url: string,
  isProduction = process.env.NODE_ENV === "production" &&
    typeof __DEV__ !== "undefined" &&
    !__DEV__,
): { valid: boolean; normalizedUrl: string; reason?: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false, normalizedUrl: "", reason: "Cloud URL is empty." };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalizedUrl: "",
      reason: "Cloud URL is not a valid URL format.",
    };
  }

  if (isProduction && parsed.protocol !== "https:") {
    return {
      valid: false,
      normalizedUrl: "",
      reason: "Production builds require HTTPS for AETHER Cloud.",
    };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      valid: false,
      normalizedUrl: "",
      reason: "Cloud URL protocol must be HTTPS (or HTTP in development).",
    };
  }

  return {
    valid: true,
    normalizedUrl: stripTrailingSlash(trimmed),
  };
}

export function readAetherCloudBaseUrl(
  env: Record<string, string | undefined> = process.env,
  isProduction = process.env.NODE_ENV === "production" &&
    typeof __DEV__ !== "undefined" &&
    !__DEV__,
): string {
  const raw = env.EXPO_PUBLIC_AETHER_CLOUD_URL?.trim() ?? "";
  if (!raw) return "";
  const validation = validateAetherCloudUrl(raw, isProduction);
  return validation.valid ? validation.normalizedUrl : "";
}

export function isAetherCloudConfigured(
  env: Record<string, string | undefined> = process.env,
  isProduction = process.env.NODE_ENV === "production" &&
    typeof __DEV__ !== "undefined" &&
    !__DEV__,
): boolean {
  return readAetherCloudBaseUrl(env, isProduction).length > 0;
}

export function resolveAetherCloudConfig(
  env: Record<string, string | undefined> = process.env,
  isProduction = process.env.NODE_ENV === "production" &&
    typeof __DEV__ !== "undefined" &&
    !__DEV__,
): AetherCloudConfig | null {
  const baseUrl = readAetherCloudBaseUrl(env, isProduction);
  if (!baseUrl) return null;

  const userId =
    env.EXPO_PUBLIC_AETHER_DEV_USER_ID?.trim() || DEFAULT_E2E_USER_ID;
  const deviceId =
    env.EXPO_PUBLIC_AETHER_DEV_DEVICE_ID?.trim() || DEFAULT_E2E_DEVICE_ID;

  if (!USER_ID_RE.test(userId) || !DEVICE_ID_RE.test(deviceId)) {
    throw new Error("AETHER Cloud development identity is invalid.");
  }

  return { baseUrl, userId, deviceId };
}

export function assertProductionCloudConfig(
  env: Record<string, string | undefined> = process.env,
): AetherRuntimeConfig {
  const raw = env.EXPO_PUBLIC_AETHER_CLOUD_URL?.trim() ?? "";
  if (!raw) {
    throw new Error(
      "Missing EXPO_PUBLIC_AETHER_CLOUD_URL in release/production configuration.",
    );
  }
  const validation = validateAetherCloudUrl(raw, true);
  if (!validation.valid) {
    throw new Error(
      `Invalid production AETHER Cloud URL: ${validation.reason}`,
    );
  }
  return { cloudOrigin: validation.normalizedUrl };
}

export function publicCloudEnvSnapshot(): {
  configured: boolean;
  hasUserOverride: boolean;
  hasDeviceOverride: boolean;
} {
  return {
    configured: isAetherCloudConfigured(),
    hasUserOverride: Boolean(
      process.env.EXPO_PUBLIC_AETHER_DEV_USER_ID?.trim(),
    ),
    hasDeviceOverride: Boolean(
      process.env.EXPO_PUBLIC_AETHER_DEV_DEVICE_ID?.trim(),
    ),
  };
}
