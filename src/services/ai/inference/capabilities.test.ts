import { describe, expect, test } from "bun:test";
import {
  capabilitiesFromOpenRouterMetadata,
  classifyCompatibility,
  canRunAsAgent,
} from "./capabilities";

describe("model capabilities", () => {
  test("FULL_AGENT when tools + tool_choice + streaming + structured", () => {
    const caps = capabilitiesFromOpenRouterMetadata({
      id: "test/full",
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      supported_parameters: [
        "tools",
        "tool_choice",
        "response_format",
        "structured_outputs",
      ],
      context_length: 128000,
    });
    expect(caps.tools).toBe(true);
    expect(caps.compatibility).toBe("FULL_AGENT");
    expect(canRunAsAgent(caps)).toBe(true);
  });

  test("AGENT when tools + streaming without structured", () => {
    const caps = capabilitiesFromOpenRouterMetadata({
      id: "test/agent",
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      supported_parameters: ["tools", "tool_choice"],
    });
    expect(caps.compatibility).toBe("AGENT");
    expect(canRunAsAgent(caps)).toBe(true);
  });

  test("CONVERSATION_ONLY without tools metadata", () => {
    const caps = capabilitiesFromOpenRouterMetadata({
      id: "test/chat",
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    });
    expect(caps.tools).toBe(false);
    expect(caps.compatibility).toBe("LIMITED_ASSISTANT");
    expect(canRunAsAgent(caps)).toBe(false);
  });

  test("classifyCompatibility matrix", () => {
    expect(
      classifyCompatibility({
        textInput: true,
        textOutput: true,
        streaming: false,
        tools: false,
        toolChoice: false,
        structuredOutputs: false,
      }),
    ).toBe("CONVERSATION_ONLY");
  });
});
