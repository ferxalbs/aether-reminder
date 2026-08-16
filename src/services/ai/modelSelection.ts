import { canRunAsAgent, type InferenceProvider } from "./inference";
import { openRouterInferenceProvider } from "./inference/openRouterProvider";
import { DEFAULT_OPENROUTER_MODEL_ID } from "./models";
import { AIProviderError } from "./providers";

/** Resolve and validate one exact OpenRouter model; there is no catalog-order fallback. */
export async function resolveAgentModel(
  selectedModel: string,
  apiKey: string,
  provider: InferenceProvider = openRouterInferenceProvider,
): Promise<string> {
  const modelId = selectedModel.trim() || DEFAULT_OPENROUTER_MODEL_ID;
  const capabilities = await provider.getCapabilities(modelId, apiKey);
  if (!canRunAsAgent(capabilities)) {
    throw new AIProviderError(
      "INCOMPATIBLE_MODEL",
      `OpenRouter model ${modelId} cannot run AETHER's tool-enabled agent.`,
      { provider: "OpenRouter" },
    );
  }
  return modelId;
}
