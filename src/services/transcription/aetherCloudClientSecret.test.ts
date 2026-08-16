import { beforeEach, describe, expect, test } from "bun:test";
import {
  AetherCloudClient,
  resetCommercialPolicyCacheForTests,
} from "@/services/cloud";
import { AetherCloudClientSecretProvider } from "./aetherCloudClientSecret";
import { VoiceError } from "./errors";
import { defaultRealtimeTranscriptionConfig } from "./types";

function subscriptionResponse() {
  return new Response(
    JSON.stringify({
      userId: "e2e.mobile.physical.aether-reminder",
      policy: {
        version: "v1",
        tier: "pro",
        source: "promo",
        hostedInference: true,
        liveTranscription: true,
        cloudAutomations: true,
        limits: {
          voiceAuthorizations: 30,
          inferenceBudget: 200000,
          automationRuns: 100,
        },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("AetherCloudClientSecretProvider", () => {
  beforeEach(() => {
    resetCommercialPolicyCacheForTests();
  });
  test("requests authorization immediately and keeps the secret in memory", async () => {
    let calls = 0;
    const client = new AetherCloudClient(
      {
        baseUrl: "http://cloud.test",
        userId: "e2e.mobile.physical.aether-reminder",
        deviceId: "e2e.device.physical.dev",
      },
      async (input, init) => {
        if (String(input).endsWith("/v1/me/subscription")) {
          return subscriptionResponse();
        }
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
      async (input) => {
        if (String(input).endsWith("/v1/me/subscription")) {
          return subscriptionResponse();
        }
        return new Response(
          JSON.stringify({
            authorizationId: "auth-expired",
            clientSecret: "ek_expired_secret",
            expiresAt: Math.floor(Date.now() / 1000) - 1,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      },
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

  test("returns an exhausted-usage error without receiving a client secret", async () => {
    let authorizationRequested = false;
    const client = new AetherCloudClient(
      {
        baseUrl: "http://cloud.test",
        userId: "e2e.mobile.physical.aether-reminder",
        deviceId: "e2e.device.physical.dev",
      },
      async (input) => {
        if (String(input).endsWith("/v1/me/subscription")) {
          return subscriptionResponse();
        }
        authorizationRequested = true;
        return new Response(
          JSON.stringify({
            error: { code: "VOICE_QUOTA_EXCEEDED", message: "Usage exhausted" },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      },
    );

    await expect(
      new AetherCloudClientSecretProvider(client).create(
        defaultRealtimeTranscriptionConfig,
      ),
    ).rejects.toMatchObject({ code: "HOSTED_USAGE_EXHAUSTED" });
    expect(authorizationRequested).toBe(true);
  });
});
