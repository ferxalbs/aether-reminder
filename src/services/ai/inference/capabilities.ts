import type { ModelCapabilities, ModelCompatibilityClass } from "./types";

export function classifyCompatibility(
  caps: Omit<ModelCapabilities, "compatibility">,
): ModelCompatibilityClass {
  if (!caps.textInput || !caps.textOutput) return "CONVERSATION_ONLY";
  if (
    caps.tools &&
    caps.toolChoice &&
    caps.streaming &&
    caps.structuredOutputs
  ) {
    return "FULL_AGENT";
  }
  if (caps.tools && caps.toolChoice && caps.streaming) {
    return "AGENT";
  }
  if (caps.streaming || caps.structuredOutputs) {
    return "LIMITED_ASSISTANT";
  }
  return "CONVERSATION_ONLY";
}

/** Conservative defaults when only a model id is known (no catalog entry). */
export function unknownModelCapabilities(): ModelCapabilities {
  const base = {
    textInput: true,
    textOutput: true,
    streaming: true,
    tools: false,
    toolChoice: false,
    structuredOutputs: false,
  };
  return { ...base, compatibility: classifyCompatibility(base) };
}

export function canRunAsAgent(caps: ModelCapabilities): boolean {
  return caps.compatibility === "FULL_AGENT" || caps.compatibility === "AGENT";
}
