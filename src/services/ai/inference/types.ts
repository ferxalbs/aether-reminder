/**
 * Production inference abstraction (Slice 3).
 * AETHER Cloud is the only hosted inference boundary; no local provider path exists.
 */

export type ModelCompatibilityClass =
  "FULL_AGENT" | "AGENT" | "LIMITED_ASSISTANT" | "CONVERSATION_ONLY";

export interface ModelCapabilities {
  textInput: boolean;
  textOutput: boolean;
  streaming: boolean;
  tools: boolean;
  toolChoice: boolean;
  structuredOutputs: boolean;
  contextLength?: number;
  /** Derived agent compatibility — never silently overstate. */
  compatibility: ModelCompatibilityClass;
}

export type InferenceMessageRole = "system" | "user" | "assistant" | "tool";

export interface InferenceToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface InferenceMessage {
  role: InferenceMessageRole;
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: InferenceToolCall[];
}

export interface InferenceToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface InferenceRequest {
  modelId?: string;
  messages: InferenceMessage[];
  tools?: InferenceToolDefinition[];
  toolChoice?:
    | "auto"
    | "none"
    | { type: "function"; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  /** JSON schema response format when model supports structured outputs. */
  responseFormat?: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict?: boolean;
      schema: Record<string, unknown>;
    };
  };
}

export type ModelEvent =
  | { type: "stream.started"; modelId: string }
  | { type: "text.delta"; text: string }
  | {
      type: "tool_call.delta";
      toolCallId: string;
      index: number;
      name?: string;
      argumentsDelta?: string;
    }
  | {
      type: "tool_call.completed";
      toolCallId: string;
      index: number;
      name: string;
      arguments: string;
    }
  | {
      type: "stream.completed";
      finishReason?: string | null;
      usage?: InferenceUsage;
    }
  | { type: "stream.error"; error: InferenceErrorShape }
  | { type: "stream.aborted" };

export interface InferenceUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
}

export interface InferenceErrorShape {
  code: string;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
}

export interface InferenceProvider {
  readonly id: string;

  getCapabilities(modelId?: string): Promise<ModelCapabilities>;

  stream(
    request: InferenceRequest,
    signal: AbortSignal,
  ): AsyncIterable<ModelEvent>;
}
