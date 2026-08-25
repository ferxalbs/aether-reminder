import { createId, isPlausibleId } from "@/lib/id";
import { IdentityError } from "./errors";

const INSTALLATION_ID_KEY = "aether-reminder.identity.installation-id";
const DEVICE_ID_KEY = "aether-reminder.identity.device-id";
const DEVICE_ACCOUNT_ID_KEY = "aether-reminder.identity.device-account-id";

export interface SecureStringStore {
  isAvailableAsync(): Promise<boolean>;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const defaultStore: SecureStringStore = {
  isAvailableAsync: async () =>
    (await import("expo-secure-store")).isAvailableAsync(),
  getItemAsync: async (key) =>
    (await import("expo-secure-store")).getItemAsync(key),
  setItemAsync: async (key, value) =>
    (await import("expo-secure-store")).setItemAsync(key, value),
  deleteItemAsync: async (key) =>
    (await import("expo-secure-store")).deleteItemAsync(key),
};

export class DeviceIdentityStore {
  constructor(private readonly store: SecureStringStore = defaultStore) {}

  async getOrCreateInstallationId(): Promise<string> {
    await this.requireAvailable();
    const existing = await this.store.getItemAsync(INSTALLATION_ID_KEY);
    if (existing && isPlausibleId(existing)) return existing;
    const installationId = createId();
    await this.store.setItemAsync(INSTALLATION_ID_KEY, installationId);
    return installationId;
  }

  /**
   * Rotate the installation identity after Cloud permanently revokes it.
   * The canonical device is cleared so the next registration cannot continue
   * sending requests under the revoked device identity.
   */
  async rotateInstallationId(): Promise<string> {
    await this.requireAvailable();
    const installationId = createId();
    await this.store.setItemAsync(INSTALLATION_ID_KEY, installationId);
    await this.store.deleteItemAsync(DEVICE_ID_KEY);
    return installationId;
  }

  async setActiveAccount(accountId: string): Promise<void> {
    await this.requireAvailable();
    const previous = await this.store.getItemAsync(DEVICE_ACCOUNT_ID_KEY);
    if (previous !== accountId) {
      await this.store.deleteItemAsync(DEVICE_ID_KEY);
    }
    await this.store.setItemAsync(DEVICE_ACCOUNT_ID_KEY, accountId);
  }

  async getCanonicalDeviceId(): Promise<string | null> {
    await this.requireAvailable();
    const value = await this.store.getItemAsync(DEVICE_ID_KEY);
    return value && isPlausibleId(value) ? value : null;
  }

  async setCanonicalDeviceId(deviceId: string): Promise<void> {
    await this.requireAvailable();
    if (!isPlausibleId(deviceId)) {
      throw new IdentityError(
        "STORAGE_UNAVAILABLE",
        "AETHER returned an invalid canonical device ID.",
      );
    }
    await this.store.setItemAsync(DEVICE_ID_KEY, deviceId);
  }

  private async requireAvailable(): Promise<void> {
    try {
      if (!(await this.store.isAvailableAsync())) {
        throw new IdentityError(
          "STORAGE_UNAVAILABLE",
          "Secure device identity storage is unavailable.",
        );
      }
    } catch (error) {
      if (error instanceof IdentityError) throw error;
      throw new IdentityError(
        "STORAGE_UNAVAILABLE",
        "Secure device identity storage is unavailable.",
        error,
      );
    }
  }
}

let sharedDeviceIdentityStore: DeviceIdentityStore | null = null;

export function getDeviceIdentityStore(): DeviceIdentityStore {
  if (!sharedDeviceIdentityStore) {
    sharedDeviceIdentityStore = new DeviceIdentityStore();
  }
  return sharedDeviceIdentityStore;
}

export function resetDeviceIdentityStoreForTests(): void {
  sharedDeviceIdentityStore = null;
}
