import { describe, expect, test } from "bun:test";
import {
  DEFAULT_E2E_DEVICE_ID,
  DEFAULT_E2E_USER_ID,
  isAetherCloudConfigured,
  readAetherCloudBaseUrl,
  resolveAetherCloudConfig,
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
    const config = resolveAetherCloudConfig({
      EXPO_PUBLIC_AETHER_CLOUD_URL: "http://127.0.0.1:8080/",
    });
    expect(config).toEqual({
      baseUrl: "http://127.0.0.1:8080",
      userId: DEFAULT_E2E_USER_ID,
      deviceId: DEFAULT_E2E_DEVICE_ID,
    });
    expect(config?.userId.startsWith("e2e.")).toBe(true);
  });

  test("rejects an invalid development identity", () => {
    expect(() =>
      resolveAetherCloudConfig({
        EXPO_PUBLIC_AETHER_CLOUD_URL: "http://127.0.0.1:8080",
        EXPO_PUBLIC_AETHER_DEV_USER_ID: "bad identity",
      }),
    ).toThrow("development identity is invalid");
  });
});
