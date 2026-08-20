import { describe, expect, test } from "bun:test";
import { AetherCloudClient } from "./client";
import { AetherCloudError } from "./errors";

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("AetherCloudClient", () => {
  const config = {
    baseUrl: "http://cloud.test",
    authMode: "development" as const,
    userId: "e2e.mobile.physical.aether-reminder",
    deviceId: "e2e.device.physical.dev",
  };

  test("GET /health does not send development identity headers", async () => {
    const seen: RequestInit[] = [];
    const client = new AetherCloudClient(config, async (input, init) => {
      seen.push({ url: String(input), ...init });
      return jsonResponse(200, { status: "ok" });
    });
    await expect(client.getHealth()).resolves.toEqual({ status: "ok" });
    const headers = new Headers(seen[0]?.headers);
    expect(headers.get("X-Aether-User-Id")).toBeNull();
    expect(headers.get("X-Request-Id")).toBeTruthy();
  });

  test("development tooling sends development identity headers explicitly", async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const client = new AetherCloudClient(config, async (input, init) => {
      seen.push({ url: String(input), headers: new Headers(init?.headers) });
      return jsonResponse(200, {
        userId: config.userId,
        policy: { tier: "pro", hostedInference: true, liveTranscription: true },
      });
    });
    await client.getSubscription();
    expect(seen[0]?.url).toBe("http://cloud.test/v1/me/subscription");
    expect(seen[0]?.headers.get("X-Aether-User-Id")).toBe(config.userId);
    expect(seen[0]?.headers.get("X-Aether-Device-Id")).toBe(config.deviceId);
  });

  test("production transport sends a bearer token and canonical device hint", async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const client = new AetherCloudClient(
      {
        baseUrl: "https://cloud.aether.test",
        authMode: "bearer",
        deviceId: null,
      },
      async (input, init) => {
        seen.push({ url: String(input), headers: new Headers(init?.headers) });
        return jsonResponse(200, { account: { id: "account-1" } });
      },
      { getAccessToken: async () => "supabase-access-token" },
      async () => "canonical-device-1",
    );

    await expect(client.getMe()).resolves.toEqual({
      account: { id: "account-1" },
    });
    expect(seen[0]?.headers.get("Authorization")).toBe(
      "Bearer supabase-access-token",
    );
    expect(seen[0]?.headers.get("X-Aether-User-Id")).toBeNull();
    expect(seen[0]?.headers.get("X-Aether-Device-Id")).toBe(
      "canonical-device-1",
    );
  });

  test("production transport fails closed without an access token", async () => {
    let called = false;
    const client = new AetherCloudClient(
      { baseUrl: "https://cloud.aether.test", authMode: "bearer" },
      async () => {
        called = true;
        return jsonResponse(200, { account: { id: "account-1" } });
      },
      { getAccessToken: async () => "" },
    );
    await expect(client.getMe()).rejects.toMatchObject({
      name: "AetherCloudError",
      code: "UNAUTHORIZED",
    });
    expect(called).toBe(false);
  });

  test("decodes a stable Cloud error envelope", async () => {
    const client = new AetherCloudClient(config, async () =>
      jsonResponse(403, {
        error: {
          code: "VOICE_NOT_ENTITLED",
          message: "Voice access is unavailable.",
          requestId: "req-1",
        },
      }),
    );
    try {
      await client.createVoiceAuthorization({ language: "es" });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AetherCloudError);
      expect((error as AetherCloudError).code).toBe("VOICE_NOT_ENTITLED");
      expect((error as AetherCloudError).requestId).toBe("req-1");
    }
  });

  test("maps an unreachable Cloud as a bounded network error", async () => {
    const client = new AetherCloudClient(config, async () => {
      throw new TypeError("Network request failed");
    });
    await expect(client.getHealth()).rejects.toMatchObject({
      name: "AetherCloudError",
      code: "NETWORK_ERROR",
    });
  });

  test("propagates cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new AetherCloudClient(config, async (_input, init) => {
      if (init?.signal?.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      return jsonResponse(200, { status: "ok" });
    });
    await expect(
      client.getHealth({ signal: controller.signal }),
    ).rejects.toMatchObject({
      code: "CANCELLED",
    });
  });

  test("voice authorization request contains only language", async () => {
    let body = "";
    const client = new AetherCloudClient(config, async (_input, init) => {
      body = String(init?.body ?? "");
      return jsonResponse(
        201,
        {
          authorizationId: "auth-1",
          clientSecret: "ek_test_value",
          expiresAt: 1,
        },
        { "x-request-id": "voice-1" },
      );
    });
    const result = await client.createVoiceAuthorization({ language: "es" });
    expect(JSON.parse(body)).toEqual({ language: "es" });
    expect(result.authorizationId).toBe("auth-1");
    expect(result.clientSecret.startsWith("ek_")).toBe(true);
  });

  test("assistant turns omit provider credentials", async () => {
    let body = "";
    const client = new AetherCloudClient(config, async (_input, init) => {
      body = String(init?.body ?? "");
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    await client.streamAssistantTurn({
      capability: "assistant.turn",
      toolsetVersion: "aether.tasks.v1",
      messages: [{ role: "user", content: "hello" }],
    });
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("apiKey");
    expect(parsed).not.toHaveProperty("provider");
    expect(parsed).not.toHaveProperty("tools");
    expect(parsed).not.toHaveProperty("model");
    expect(parsed.capability).toBe("assistant.turn");
  });

  describe("getUsage", () => {
    test("decodes authoritative Free plan usage snapshot", async () => {
      const client = new AetherCloudClient(config, async (input) => {
        expect(String(input)).toBe("http://cloud.test/v1/me/usage");
        return jsonResponse(200, {
          plan: { tier: "free", displayName: "AETHER Free" },
          period: {
            startsAt: "2026-08-01T00:00:00Z",
            resetsAt: "2026-09-01T00:00:00Z",
          },
          ai: { used: 42, limit: 75, remaining: 33 },
          voice: { usedSeconds: 252, limitSeconds: 600, remainingSeconds: 348 },
          capabilities: {
            hostedInference: true,
            liveTranscription: true,
            cloudAutomations: false,
          },
        });
      });

      const usage = await client.getUsage();
      expect(usage.plan.tier).toBe("free");
      expect(usage.plan.displayName).toBe("AETHER Free");
      expect(usage.ai.used).toBe(42);
      expect(usage.ai.limit).toBe(75);
      expect(usage.voice.usedSeconds).toBe(252);
      expect(usage.period.resetsAt).toBe("2026-09-01T00:00:00Z");
      expect(usage.capabilities.hostedInference).toBe(true);
    });

    test("decodes Pro plan usage with automations", async () => {
      const client = new AetherCloudClient(config, async () =>
        jsonResponse(200, {
          plan: { tier: "pro", displayName: "AETHER Pro", source: "monthly" },
          period: {
            startsAt: "2026-08-15T00:00:00Z",
            resetsAt: "2026-09-15T00:00:00Z",
          },
          ai: { used: 120, limit: 1500, remaining: 1380 },
          voice: {
            usedSeconds: 1800,
            limitSeconds: 7200,
            remainingSeconds: 5400,
          },
          automations: { used: 15, limit: 500, remaining: 485 },
          capabilities: {
            hostedInference: true,
            liveTranscription: true,
            cloudAutomations: true,
          },
        }),
      );

      const usage = await client.getUsage();
      expect(usage.plan.tier).toBe("pro");
      expect(usage.plan.source).toBe("monthly");
      expect(usage.automations?.used).toBe(15);
      expect(usage.capabilities.cloudAutomations).toBe(true);
    });

    test("fails closed on malformed usage payload (e.g. negative values or invalid tier)", async () => {
      const client = new AetherCloudClient(config, async () =>
        jsonResponse(200, {
          plan: { tier: "enterprise" },
          ai: { used: -5 },
        }),
      );

      await expect(client.getUsage()).rejects.toMatchObject({
        name: "AetherCloudError",
        code: "INVALID_RESPONSE",
      });
    });

    test("returns typed NOT_READY / NOT_FOUND error when endpoint is not implemented on server", async () => {
      const client = new AetherCloudClient(config, async () =>
        jsonResponse(404, {
          error: {
            code: "INVALID_REQUEST",
            message: "Route not found",
          },
        }),
      );

      await expect(client.getUsage()).rejects.toMatchObject({
        name: "AetherCloudError",
        status: 404,
      });
    });

    test("network error does not fabricate zero usage", async () => {
      const client = new AetherCloudClient(config, async () => {
        throw new TypeError("Failed to fetch");
      });

      await expect(client.getUsage()).rejects.toMatchObject({
        name: "AetherCloudError",
        code: "NETWORK_ERROR",
      });
    });
  });
});
