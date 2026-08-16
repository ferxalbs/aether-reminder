import { describe, expect, test } from "bun:test";
import { AetherCloudClient } from "@/services/cloud";
import { AetherCloudClientSecretProvider } from "./aetherCloudClientSecret";
import { VoiceError } from "./errors";
import { defaultRealtimeTranscriptionConfig } from "./types";

describe("AetherCloudClientSecretProvider", () => {
  test("requests authorization immediately and keeps the secret in memory", async () => {
    let calls = 0;
    const client = new AetherCloudClient(
      {
        baseUrl: "http://cloud.test",
        userId: "e2e.mobile.physical.aether-reminder",
        deviceId: "e2e.device.physical.dev",
      },
      async (_input, init) => {
        calls += 1;
        expect(JSON.parse(String(init?.body))).toEqual({ language: "en" });
        return new Response(
          JSON.stringify({
            authorizationId: "auth-1",
            clientSecret: "ek_memory_only",
            expiresAt: Math.floor(Date.now() / 1000) + 10,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    const secret = await new AetherCloudClientSecretProvider(client).create(
      defaultRealtimeTranscriptionConfig,
    );
    expect(calls).toBe(1);
    expect(secret.value).toBe("ek_memory_only");
    expect(secret.requestId).toBe("auth-1");
  });

  test("does not reuse an already expired authorization", async () => {
    const client = new AetherCloudClient(
      {
        baseUrl: "http://cloud.test",
        userId: "e2e.mobile.physical.aether-reminder",
        deviceId: "e2e.device.physical.dev",
      },
      async () =>
        new Response(
          JSON.stringify({
            authorizationId: "auth-expired",
            clientSecret: "ek_expired_secret",
            expiresAt: Math.floor(Date.now() / 1000) - 1,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
    );
    await expect(
      new AetherCloudClientSecretProvider(client).create(
        defaultRealtimeTranscriptionConfig,
      ),
    ).rejects.toMatchObject({
      name: "VoiceError",
      code: "REALTIME_AUTH_FAILED",
    });
  });

  test("maps Cloud unavailability to a recoverable voice error", async () => {
    const client = new AetherCloudClient(
      {
        baseUrl: "http://cloud.test",
        userId: "e2e.mobile.physical.aether-reminder",
        deviceId: "e2e.device.physical.dev",
      },
      async () => {
        throw new TypeError("Network request failed");
      },
    );
    try {
      await new AetherCloudClientSecretProvider(client).create(
        defaultRealtimeTranscriptionConfig,
      );
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(VoiceError);
      expect((error as VoiceError).code).toBe("REALTIME_AUTH_FAILED");
    }
  });
});
