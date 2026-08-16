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

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function readAetherCloudBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.EXPO_PUBLIC_AETHER_CLOUD_URL?.trim() ?? "";
  return raw ? stripTrailingSlash(raw) : "";
}

export function isAetherCloudConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return readAetherCloudBaseUrl(env).length > 0;
}

export function resolveAetherCloudConfig(
  env: Record<string, string | undefined> = process.env,
): AetherCloudConfig | null {
  const baseUrl = readAetherCloudBaseUrl(env);
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
