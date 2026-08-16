import { beforeEach, describe, expect, test } from "bun:test";
import {
  AetherCloudClient,
  resetCommercialPolicyCacheForTests,
} from "@/services/cloud";
import {
  AetherCloudInferenceProvider,
  toCloudMessages,
} from "./aetherCloudProvider";
import type { InferenceMessage } from "./types";

describe("Aether Cloud inference provider", () => {
  beforeEach(() => {
    resetCommercialPolicyCacheForTests();
  });
  test("drops system messages and never sends tools or credentials", async () => {
    const messages: InferenceMessage[] = [
      { role: "system", content: "local system prompt" },
      { role: "user", content: "Create a reminder to buy milk" },
    ];
    expect(toCloudMessages(messages)).toEqual([
      { role: "user", content: "Create a reminder to buy milk" },
    ]);

    let body = "";
    const client = new AetherCloudClient(
      {
        baseUrl: "http://cloud.test",
        userId: "e2e.mobile.physical.aether-reminder",
        deviceId: "e2e.device.physical.dev",
      },
      async (input, init) => {
        if (String(input).endsWith("/v1/me/subscription")) {
          return new Response(
            JSON.stringify({
              userId: "e2e.mobile.physical.aether-reminder",
              policy: {
                version: "v1",
                tier: "pro",
                source: "promo",
                hostedInference: true,
                liveTranscription: true,
                cloudAutomations: false,
                limits: {
                  voiceAuthorizations: 30,
                  inferenceBudget: 200000,
                  automationRuns: 0,
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        body = String(init?.body ?? "");
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"Sure."}}]}\n\n',
              ),
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    );

    const provider = new AetherCloudInferenceProvider(() => client);
    const events = [];
    for await (const event of provider.stream(
      {
        modelId: "ignored",
        messages,
        tools: [
          {
            type: "function",
            function: { name: "tasks.create", parameters: {} },
          },
        ],
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }

    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("apiKey");
    expect(parsed).not.toHaveProperty("tools");
    expect(parsed).not.toHaveProperty("model");
    expect(parsed.messages).toEqual([
      { role: "user", content: "Create a reminder to buy milk" },
    ]);
    expect(events.some((event) => event.type === "text.delta")).toBe(true);
    expect(events.some((event) => event.type === "stream.completed")).toBe(
      true,
    );
  });

  test("surfaces a bounded error when Cloud is unreachable", async () => {
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
    const provider = new AetherCloudInferenceProvider(() => client);
    const events = [];
    for await (const event of provider.stream(
      {
        modelId: "hosted",
        messages: [{ role: "user", content: "hello" }],
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }
    expect(events[0]).toMatchObject({
      type: "stream.error",
      error: { code: "NETWORK_ERROR" },
    });
  });
});
