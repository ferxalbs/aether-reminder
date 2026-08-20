const APP_USER_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export interface RevenueCatClient {
  configure(configuration: { apiKey: string }): void;
  getAppUserID(): Promise<string>;
  logIn(appUserId: string): Promise<unknown>;
}

export type RevenueCatBootstrapOptions = {
  platform?: string;
  apiKey?: string;
  loadClient?: () => Promise<RevenueCatClient>;
};

let configuredApiKey: string | null = null;
let clientPromise: Promise<RevenueCatClient | null> | null = null;

async function loadNativeClient(): Promise<RevenueCatClient> {
  const module = await import("react-native-purchases");
  return module.default;
}

async function initializeRevenueCat(
  options: RevenueCatBootstrapOptions = {},
): Promise<RevenueCatClient | null> {
  const platform =
    options.platform ?? (await import("react-native")).Platform.OS;
  if (platform !== "android") return null;
  const apiKey =
    options.apiKey ??
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() ??
    "";
  if (!apiKey) return null;

  if (!clientPromise) {
    clientPromise = (options.loadClient ?? loadNativeClient)()
      .then((client) => {
        if (configuredApiKey !== apiKey) {
          client.configure({ apiKey });
          configuredApiKey = apiKey;
        }
        return client;
      })
      .catch(() => null);
  }
  return clientPromise;
}

/** Initialize Android commerce without making it a prerequisite for identity. */
export async function initializeRevenueCatForAndroid(
  options: RevenueCatBootstrapOptions = {},
): Promise<boolean> {
  return (await initializeRevenueCat(options)) !== null;
}

/** Bind RevenueCat to an already-resolved canonical AETHER account. */
export async function bindRevenueCatAccount(
  accountId: string,
  options: RevenueCatBootstrapOptions = {},
): Promise<boolean> {
  if (!APP_USER_ID_RE.test(accountId)) return false;
  const client = await initializeRevenueCat(options);
  if (!client) return false;
  try {
    const current = await client.getAppUserID();
    if (current !== accountId) await client.logIn(accountId);
    return true;
  } catch {
    // Billing availability must not alter AETHER identity or local authority.
    return false;
  }
}

export function resetRevenueCatForTests(): void {
  configuredApiKey = null;
  clientPromise = null;
}
