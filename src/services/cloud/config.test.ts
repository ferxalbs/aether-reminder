import { describe, expect, test } from "bun:test";
import {
  DEFAULT_E2E_DEVICE_ID,
  DEFAULT_E2E_USER_ID,
  assertProductionCloudConfig,
  isAetherCloudConfigured,
  readAetherCloudBaseUrl,
  resolveAetherCloudConfig,
  validateAetherCloudUrl,
} from "./config";

describe("Aether Cloud configuration", () => {
  test("is unset until a public base URL is provided", () => {
    expect(isAetherCloudConfigured({})).toBe(false);
    expect(readAetherCloudBaseUrl({})).toBe("");
    expect(resolveAetherCloudConfig({})).toBeNull();
  });

  test("does not hardcode a loopback service URL", () => {
    expect(readAetherCloudBaseUrl({})).not.toContain("127.0.0.1");
    expect(readAetherCloudBaseUrl({})).not.toContain("localhost");
  });

  test("accepts a public development URL and deterministic E2E identity", () => {
    const config = resolveAetherCloudConfig(
      {
        EXPO_PUBLIC_AETHER_CLOUD_URL: "http://127.0.0.1:8080/",
      },
      false,
    );
    expect(config).toEqual({
      baseUrl: "http://127.0.0.1:8080",
      authMode: "development",
      userId: DEFAULT_E2E_USER_ID,
      deviceId: DEFAULT_E2E_DEVICE_ID,
    });
    expect(config?.userId.startsWith("e2e.")).toBe(true);
  });

  test("requires HTTPS in production builds", () => {
    const httpValidation = validateAetherCloudUrl(
      "http://api.aether.internal",
      true,
    );
    expect(httpValidation.valid).toBe(false);
    expect(httpValidation.reason).toContain("HTTPS");

    const httpsValidation = validateAetherCloudUrl(
      "https://api.aether.internal/",
      true,
    );
    expect(httpsValidation.valid).toBe(true);
    expect(httpsValidation.normalizedUrl).toBe("https://api.aether.internal");
  });

  test("production resolution selects bearer transport and no development identity", () => {
    expect(
      resolveAetherCloudConfig(
        {
          EXPO_PUBLIC_AETHER_CLOUD_URL: "https://cloud.aether.app",
          EXPO_PUBLIC_AETHER_DEV_USER_ID: "should-not-be-used",
          EXPO_PUBLIC_AETHER_DEV_DEVICE_ID: "should-not-be-used",
        },
        true,
      ),
    ).toEqual({
      baseUrl: "https://cloud.aether.app",
      authMode: "bearer",
      deviceId: null,
    });
  });

  test("assertProductionCloudConfig requires valid HTTPS URL", () => {
    expect(() => assertProductionCloudConfig({})).toThrow("Missing");
    expect(() =>
      assertProductionCloudConfig({
        EXPO_PUBLIC_AETHER_CLOUD_URL: "http://insecure.test",
      }),
    ).toThrow("Invalid production");

    const config = assertProductionCloudConfig({
      EXPO_PUBLIC_AETHER_CLOUD_URL: "https://cloud.aether.app/",
      EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    });
    expect(config.cloudOrigin).toBe("https://cloud.aether.app");
  });

  test("rejects an invalid development identity", () => {
    expect(() =>
      resolveAetherCloudConfig(
        {
          EXPO_PUBLIC_AETHER_CLOUD_URL: "http://127.0.0.1:8080",
          EXPO_PUBLIC_AETHER_DEV_USER_ID: "bad identity",
        },
        false,
      ),
    ).toThrow("development identity is invalid");
  });
});
