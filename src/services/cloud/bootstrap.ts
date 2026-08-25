import {
  getDeviceIdentityStore,
  type DeviceIdentityStore,
} from "@/services/identity/device";
import { AetherCloudClient, getAetherCloudClient } from "./client";
import { AetherCloudError } from "./errors";
import type { AetherDevice } from "./types";

export type CloudIdentityBootstrap = {
  accountId: string;
  device: AetherDevice;
};

export type CloudIdentityBootstrapOptions = {
  platform?: "android" | "ios";
  appVersion?: string | null;
  buildVersion?: string | null;
};

async function currentPlatform(
  requested?: "android" | "ios",
): Promise<"android" | "ios"> {
  if (requested) return requested;
  const { Platform } = await import("react-native");
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "ios") return "ios";
  throw new AetherCloudError(
    "INVALID_REQUEST",
    "AETHER device registration is only supported on native mobile platforms.",
  );
}

/** Resolve the canonical account, then register this installation as an AETHER device. */
export async function bootstrapCloudIdentity(
  client: AetherCloudClient = getAetherCloudClient(),
  deviceStore: DeviceIdentityStore = getDeviceIdentityStore(),
  options: CloudIdentityBootstrapOptions = {},
): Promise<CloudIdentityBootstrap> {
  const account = await client.getMe();
  await deviceStore.setActiveAccount(account.account.id);
  const installationId = await deviceStore.getOrCreateInstallationId();
  const platform = await currentPlatform(options.platform);
  let appVersion = options.appVersion;
  let buildVersion = options.buildVersion;
  if (appVersion === undefined || buildVersion === undefined) {
    const Constants = (await import("expo-constants")).default;
    appVersion ??= Constants.expoConfig?.version ?? null;
    buildVersion ??=
      platform === "android" && Constants.expoConfig?.android?.versionCode
        ? String(Constants.expoConfig.android.versionCode)
        : null;
  }
  const registration = {
    installationId,
    platform,
    appVersion,
    buildVersion,
    syncProtocolVersion: 1,
  } as const;
  let deviceResponse;
  try {
    deviceResponse = await client.registerDevice(registration);
  } catch (error) {
    if (
      !(error instanceof AetherCloudError) ||
      error.code !== "DEVICE_REVOKED"
    ) {
      throw error;
    }

    // Cloud intentionally keeps revoked installations unusable. Rotate once,
    // then use the normal registration endpoint to obtain a new device.
    deviceResponse = await client.registerDevice({
      ...registration,
      installationId: await deviceStore.rotateInstallationId(),
    });
  }
  await deviceStore.setCanonicalDeviceId(deviceResponse.device.id);
  return { accountId: account.account.id, device: deviceResponse.device };
}
