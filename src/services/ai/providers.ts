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
        return "Hosted AI usage is exhausted for this period.";
      case "RATE_LIMITED":
        return error.retryAfterSeconds
          ? `AETHER Cloud rate limit reached. Try again in about ${error.retryAfterSeconds} seconds.`
          : `AETHER Cloud rate limit reached. Try again shortly.`;
      case "PROVIDER_UNAVAILABLE":
        return "AETHER AI is temporarily unavailable. Try again shortly.";
      case "INVALID_REQUEST":
        return "AETHER Cloud could not process this request.";
      case "NETWORK_ERROR":
        return "Could not reach AETHER Cloud. Check your connection.";
      case "TIMEOUT":
        return "AETHER Cloud took too long to respond. Try again.";
      case "INVALID_RESPONSE":
        return "AETHER Cloud returned an unexpected response. Try again.";
      case "AUTH_REQUIRED":
        return "AETHER Cloud authentication is required.";
      default:
        return "AETHER Cloud could not complete the request. Try again shortly.";
    }
  }
  return "AETHER AI is temporarily unavailable.";
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
