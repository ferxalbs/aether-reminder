import {
  AETHER_CLOUD_CAPABILITY,
  AETHER_CLOUD_TOOLSET_VERSION,
  AETHER_HOSTED_MODEL_ID,
  AetherCloudError,
  getAetherCloudClient,
  type AetherCloudClient,
} from "@/services/cloud";
import { reportNonFatalError } from "@/lib/nonFatalError";
import { createTimeoutSignal } from "@/lib/retry";
import { AIProviderError, getAIErrorMessage } from "../providers";
import { parseSseStream } from "./sse";
import type {
  InferenceMessage,
  InferenceProvider,
  InferenceRequest,
  InferenceUsage,
  ModelCapabilities,
  ModelEvent,
} from "./types";

const STREAM_IDLE_TIMEOUT_MS = 60_000;

const HOSTED_CAPABILITIES: ModelCapabilities = {
  textInput: true,
  textOutput: true,
  streaming: true,
  tools: true,
  toolChoice: true,
  structuredOutputs: false,
  compatibility: "FULL_AGENT",
};

type StreamDelta = {
  content?: string | null;
  tool_calls?: {
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }[];
};

type StreamChunk = {
  error?: { code?: string | number; message?: string };
  choices?: {
    index?: number;
    delta?: StreamDelta;
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export class AetherCloudInferenceProvider implements InferenceProvider {
  readonly id = "aether-cloud";

  constructor(private readonly client: () => AetherCloudClient = getAetherCloudClient) {}

  async getCapabilities(): Promise<ModelCapabilities> {
    return HOSTED_CAPABILITIES;
  }

  async *stream(
    request: InferenceRequest,
    signal: AbortSignal,
  ): AsyncIterable<ModelEvent> {
    if (signal.aborted) {
      yield { type: "stream.aborted" };
      return;
    }

    const messages = toCloudMessages(request.messages);
    if (messages.length === 0) {
      yield {
        type: "stream.error",
        error: {
          code: "INVALID_REQUEST",
          message: "A hosted turn requires at least one user, assistant, or tool message.",
        },
      };
      return;
    }

    let response: Response;
    try {
      response = await this.client().streamAssistantTurn(
        {
          capability: AETHER_CLOUD_CAPABILITY,
          toolsetVersion: AETHER_CLOUD_TOOLSET_VERSION,
          messages,
        },
        { signal },
      );
    } catch (error) {
      if (signal.aborted) {
        yield { type: "stream.aborted" };
        return;
      }
      yield streamError(mapCloudInferenceError(error));
      return;
    }

    yield { type: "stream.started", modelId: AETHER_HOSTED_MODEL_ID };

    const toolBuffers = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let usage: InferenceUsage | undefined;
    let sawData = false;
    let sawDone = false;
    const streamTimeout = createTimeoutSignal(signal, STREAM_IDLE_TIMEOUT_MS);

    try {
      if (!response.body) {
        yield streamError(
          new AIProviderError(
            "INVALID_RESPONSE",
            "AETHER Cloud returned no stream body.",
            { provider: "AETHER Cloud" },
          ),
        );
        return;
      }

      for await (const data of parseSseStream(response.body, streamTimeout.signal)) {
        if (signal.aborted) {
          yield { type: "stream.aborted" };
          return;
        }
        if (streamTimeout.didTimeout()) {
          yield streamError(
            new AIProviderError("TIMEOUT", "AETHER Cloud stream timed out.", {
              provider: "AETHER Cloud",
            }),
          );
          return;
        }

        sawData = true;
        if (data === "[DONE]") {
          sawDone = true;
          break;
        }

        let chunk: StreamChunk;
        try {
          chunk = JSON.parse(data) as StreamChunk;
        } catch (error) {
          reportNonFatalError("aether-cloud-malformed-event", error);
          yield streamError(
            new AIProviderError(
              "INVALID_RESPONSE",
              "AETHER Cloud returned a malformed stream event.",
              { provider: "AETHER Cloud" },
            ),
          );
          return;
        }

        if (chunk.error) {
          yield streamError(
            new AIProviderError(
              "PROVIDER_UNAVAILABLE",
              "AETHER Cloud reported a provider failure.",
              { provider: "AETHER Cloud" },
            ),
          );
          return;
        }

        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }

        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          yield { type: "text.delta", text: delta.content };
        }
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index ?? 0;
            const prev = toolBuffers.get(index) ?? {
              id: "",
              name: "",
              arguments: "",
            };
            if (toolCall.id) prev.id = toolCall.id;
            if (toolCall.function?.name) prev.name += toolCall.function.name;
            if (toolCall.function?.arguments) {
              prev.arguments += toolCall.function.arguments;
            }
            if (!prev.id) prev.id = `call_${index}`;
            toolBuffers.set(index, prev);
            yield {
              type: "tool_call.delta",
              toolCallId: prev.id,
              index,
              name: toolCall.function?.name,
              argumentsDelta: toolCall.function?.arguments,
            };
          }
        }
      }
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        yield { type: "stream.aborted" };
        return;
      }
      reportNonFatalError("aether-cloud-stream", error);
      yield {
        type: "stream.error",
        error: { code: "NETWORK_ERROR", message: "Stream interrupted." },
      };
      return;
    } finally {
      streamTimeout.cleanup();
    }

    if (signal.aborted) {
      yield { type: "stream.aborted" };
      return;
    }
    if (!sawData || !sawDone) {
      yield streamError(
        new AIProviderError(
          "INVALID_RESPONSE",
          "AETHER Cloud ended the stream unexpectedly.",
          { provider: "AETHER Cloud" },
        ),
      );
      return;
    }

    for (const [index, buffer] of toolBuffers) {
      if (!buffer.name) continue;
      yield {
        type: "tool_call.completed",
        toolCallId: buffer.id || `call_${index}`,
        index,
        name: buffer.name,
        arguments: buffer.arguments || "{}",
      };
    }

    yield { type: "stream.completed", usage };
  }
}

export const aetherCloudInferenceProvider = new AetherCloudInferenceProvider();

export function toCloudMessages(
  messages: InferenceMessage[],
): Record<string, unknown>[] {
  const accepted: Record<string, unknown>[] = [];
  for (const message of messages) {
    if (
      message.role !== "user" &&
      message.role !== "assistant" &&
      message.role !== "tool"
    ) {
      continue;
    }
    accepted.push({
      role: message.role,
      content: message.content ?? null,
      ...(typeof message.tool_call_id === "string"
        ? { tool_call_id: message.tool_call_id }
        : {}),
      ...(Array.isArray(message.tool_calls) ? { tool_calls: message.tool_calls } : {}),
      ...(typeof message.name === "string" ? { name: message.name } : {}),
    });
  }
  return accepted;
}

function mapCloudInferenceError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;
  if (!(error instanceof AetherCloudError)) {
    return new AIProviderError(
      "NETWORK_ERROR",
      "Could not reach AETHER Cloud.",
      { provider: "AETHER Cloud" },
    );
  }
  const code = inferenceCodeForCloud(error.code);
  return new AIProviderError(code, error.message, {
    status: error.status,
    retryAfterSeconds: error.retryAfterSeconds,
    provider: "AETHER Cloud",
  });
}

function inferenceCodeForCloud(
  code: AetherCloudError["code"],
): AIProviderError["code"] {
  switch (code) {
    case "CANCELLED":
    case "TIMEOUT":
    case "PROVIDER_TIMEOUT":
      return "TIMEOUT";
    case "NETWORK_ERROR":
      return "NETWORK_ERROR";
    case "INFERENCE_BUDGET_EXCEEDED":
      return "INSUFFICIENT_CREDITS";
    case "PROVIDER_RATE_LIMITED":
      return "RATE_LIMITED";
    case "PROVIDER_UNAVAILABLE":
    case "NOT_READY":
      return "PROVIDER_UNAVAILABLE";
    case "UNAUTHORIZED":
      return "INVALID_API_KEY";
    default:
      return "INVALID_REQUEST";
  }
}

function streamError(error: AIProviderError): ModelEvent {
  return {
    type: "stream.error",
    error: {
      code: error.code,
      message: getAIErrorMessage(error),
      status: error.status,
      retryAfterSeconds: error.retryAfterSeconds,
    },
  };
}
