import { describe, expect, test } from "bun:test";
import { AetherCloudClient } from "./client";
import { AetherCloudError } from "./errors";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("AetherCloudClient", () => {
  const config = {
    baseUrl: "http://cloud.test",
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

  test("authenticated routes send development identity headers", async () => {
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
    await expect(client.getHealth({ signal: controller.signal })).rejects.toMatchObject({
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
});
