export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIProviderErrorCode =
  | "INSUFFICIENT_CREDITS"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "AUTH_REQUIRED"
  | "UNKNOWN";

export type AIProviderName = "AETHER Cloud";

export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  readonly provider: AIProviderName;

  constructor(
    code: AIProviderErrorCode,
    message: string,
    options?: {
      status?: number;
      retryAfterSeconds?: number;
      provider?: AIProviderName;
    },
  ) {
    super(message);
    this.name = "AIProviderError";
    this.code = code;
    this.status = options?.status;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.provider = options?.provider ?? "AETHER Cloud";
  }
}

export function getAIErrorMessage(error: unknown): string {
  if (error instanceof AIProviderError) {
    switch (error.code) {
      case "INSUFFICIENT_CREDITS":
        return "Assistant usage is exhausted for this period.";
      case "RATE_LIMITED":
        return error.retryAfterSeconds
          ? `Assistant is busy right now. Try again in about ${error.retryAfterSeconds} seconds.`
          : "Assistant is busy right now. Try again shortly.";
      case "PROVIDER_UNAVAILABLE":
        return "Assistant is temporarily unavailable. Try again shortly.";
      case "INVALID_REQUEST":
        return "Assistant could not process this request.";
      case "NETWORK_ERROR":
        return "Could not reach the assistant. Check your connection.";
      case "TIMEOUT":
        return "The assistant took too long to respond. Try again.";
      case "INVALID_RESPONSE":
        return "The assistant returned an unexpected response. Try again.";
      case "AUTH_REQUIRED":
        return "Assistant access needs attention. Try again shortly.";
      default:
        return "The assistant could not complete the request. Try again shortly.";
    }
  }
  return "Assistant is temporarily unavailable.";
}

export function isRetryableAIProviderErrorCode(code: string): boolean {
  return (
    code === "NETWORK_ERROR" ||
    code === "TIMEOUT" ||
    code === "RATE_LIMITED" ||
    code === "PROVIDER_UNAVAILABLE"
  );
}

export function isRetryableAIProviderError(
  error: unknown,
): error is AIProviderError {
  return (
    error instanceof AIProviderError &&
    isRetryableAIProviderErrorCode(error.code)
  );
}
