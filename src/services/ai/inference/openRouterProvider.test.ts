import { describe, expect, test } from "bun:test";
import {
  __clearOpenRouterModelsCache,
  OpenRouterProvider,
} from "./openRouterProvider";

const compatibleModel = {
  id: "deepseek/deepseek-v4-flash",
  name: "DeepSeek V4 Flash",
  architecture: {
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  supported_parameters: [
    "tools",
    "tool_choice",
    "structured_outputs",
    "temperature",
    "max_tokens",
  ],
};

describe("OpenRouter capability validation", () => {
  test("validates the exact selected model against current metadata", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [compatibleModel] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    try {
      __clearOpenRouterModelsCache();
      const capabilities = await new OpenRouterProvider().getCapabilities(
        "deepseek/deepseek-v4-flash",
        "openrouter-key",
      );
      expect(capabilities.compatibility).toBe("FULL_AGENT");
      expect(capabilities.tools).toBe(true);
      expect(capabilities.toolChoice).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      __clearOpenRouterModelsCache();
    }
  });

  test("fails for a missing model instead of selecting another catalog entry", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "some/other-model",
              architecture: {
                input_modalities: ["text"],
                output_modalities: ["text"],
              },
              supported_parameters: ["tools", "tool_choice"],
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;

    try {
      __clearOpenRouterModelsCache();
      await expect(
        new OpenRouterProvider().getCapabilities(
          "deepseek/deepseek-v4-flash",
          "openrouter-key",
        ),
      ).rejects.toMatchObject({
        code: "MODEL_NOT_FOUND",
        provider: "OpenRouter",
      });
    } finally {
      globalThis.fetch = originalFetch;
      __clearOpenRouterModelsCache();
    }
  });

  test("turns malformed SSE JSON into a visible stream error instead of false completion", async () => {
    const originalFetch = globalThis.fetch;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode("data: {not-json}\n\ndata: [DONE]\n\n"),
        );
        controller.close();
      },
    });
    globalThis.fetch = (async (input) => {
      if (String(input).endsWith("/models")) {
        return new Response(JSON.stringify({ data: [compatibleModel] }), {
          status: 200,
        });
      }
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;

    try {
      __clearOpenRouterModelsCache();
      const events = [];
      for await (const event of new OpenRouterProvider().stream(
        {
          modelId: compatibleModel.id,
          messages: [{ role: "user", content: "hello" }],
          apiKey: "openrouter-key",
        },
        new AbortController().signal,
      )) {
        events.push(event);
      }
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "stream.error",
          error: expect.objectContaining({ code: "INVALID_RESPONSE" }),
        }),
      );
      expect(events.some((event) => event.type === "stream.completed")).toBe(
        false,
      );
    } finally {
      globalThis.fetch = originalFetch;
      __clearOpenRouterModelsCache();
    }
  });
});
