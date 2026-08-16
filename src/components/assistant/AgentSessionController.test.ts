import { describe, expect, test } from "bun:test";
import { resolveAgentModel } from "@/services/ai/modelSelection";
import type {
  InferenceProvider,
  ModelCapabilities,
} from "@/services/ai/inference";
import { AIProviderError } from "@/services/ai/providers";

const agentCapabilities: ModelCapabilities = {
  textInput: true,
  textOutput: true,
  streaming: true,
  tools: true,
  toolChoice: true,
  structuredOutputs: false,
  compatibility: "AGENT",
};

function providerFor(
  calls: string[],
  capabilities = agentCapabilities,
): InferenceProvider {
  return {
    id: "test-openrouter",
    getCapabilities: async (modelId) => {
      calls.push(modelId);
      return capabilities;
    },
    stream: async function* () {
      yield { type: "stream.completed", finishReason: "stop" };
    },
  };
}

describe("deterministic OpenRouter model selection", () => {
  test("validates the exact DeepSeek default instead of choosing a catalog fallback", async () => {
    const calls: string[] = [];
    await expect(
      resolveAgentModel("", "or-key", providerFor(calls)),
    ).resolves.toBe("deepseek/deepseek-v4-flash");
    expect(calls).toEqual(["deepseek/deepseek-v4-flash"]);
  });

  test("preserves an explicit selected model id after validation", async () => {
    const calls: string[] = [];
    await expect(
      resolveAgentModel("  provider/model  ", "or-key", providerFor(calls)),
    ).resolves.toBe("provider/model");
    expect(calls).toEqual(["provider/model"]);
  });

  test("fails clearly when the selected model cannot run the tool agent", async () => {
    const calls: string[] = [];
    const incompatible: ModelCapabilities = {
      ...agentCapabilities,
      tools: false,
      toolChoice: false,
      compatibility: "CONVERSATION_ONLY",
    };
    const result = resolveAgentModel(
      "provider/chat-only",
      "or-key",
      providerFor(calls, incompatible),
    );
    await expect(result).rejects.toBeInstanceOf(AIProviderError);
    await expect(result).rejects.toMatchObject({ code: "INCOMPATIBLE_MODEL" });
    expect(calls).toEqual(["provider/chat-only"]);
  });
});
