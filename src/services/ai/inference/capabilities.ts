import type { ModelCapabilities, ModelCompatibilityClass } from './types';

export interface OpenRouterModelMetadata {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  expiration_date?: string | null;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  /** OpenRouter may expose supported_parameters for tools / response_format / etc. */
  supported_parameters?: string[];
  top_provider?: { is_moderated?: boolean };
}

function hasParam(params: string[] | undefined, name: string): boolean {
  if (!params) return false;
  return params.some((p) => p.toLowerCase() === name.toLowerCase());
}

export function classifyCompatibility(caps: Omit<ModelCapabilities, 'compatibility'>): ModelCompatibilityClass {
  if (!caps.textInput || !caps.textOutput) return 'CONVERSATION_ONLY';
  if (caps.tools && caps.toolChoice && caps.streaming && caps.structuredOutputs) {
    return 'FULL_AGENT';
  }
  if (caps.tools && caps.streaming) {
    return 'AGENT';
  }
  if (caps.streaming || caps.structuredOutputs) {
    return 'LIMITED_ASSISTANT';
  }
  return 'CONVERSATION_ONLY';
}

/**
 * Derive capabilities from OpenRouter model metadata.
 * Prefer metadata over hardcoded model-name assumptions.
 * When `supported_parameters` is absent, tools support is unknown → conservative false
 * (caller may still attempt if user forced a model; runtime surfaces incompatibility).
 */
export function capabilitiesFromOpenRouterMetadata(
  model: OpenRouterModelMetadata
): ModelCapabilities {
  const input = model.architecture?.input_modalities;
  const output = model.architecture?.output_modalities;
  const textInput = !input || input.includes('text');
  const textOutput = !output || output.includes('text');
  const params = model.supported_parameters;

  // Streaming is standard for chat completions on OpenRouter when text output is available.
  const streaming = textOutput;

  const tools = hasParam(params, 'tools') || hasParam(params, 'tool_choice');
  const toolChoice = hasParam(params, 'tool_choice') || tools;
  const structuredOutputs =
    hasParam(params, 'structured_outputs') ||
    hasParam(params, 'response_format') ||
    hasParam(params, 'json_schema');

  const base = {
    textInput,
    textOutput,
    streaming,
    tools,
    toolChoice,
    structuredOutputs,
    contextLength: model.context_length,
  };

  return {
    ...base,
    compatibility: classifyCompatibility(base),
  };
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
  return caps.compatibility === 'FULL_AGENT' || caps.compatibility === 'AGENT';
}
