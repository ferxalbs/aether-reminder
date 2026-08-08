export type AIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AIProviderErrorCode =
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'INSUFFICIENT_CREDITS'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'MODEL_NOT_FOUND'
  | 'INCOMPATIBLE_MODEL'
  | 'SECURE_STORAGE_UNAVAILABLE'
  | 'UNKNOWN';

export type AIProviderName = 'OpenRouter' | 'OpenAI';

export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  readonly provider: AIProviderName;

  constructor(
    code: AIProviderErrorCode,
    message: string,
    options?: { status?: number; retryAfterSeconds?: number; provider?: AIProviderName }
  ) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.status = options?.status;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.provider = options?.provider ?? 'OpenRouter';
  }
}

export interface AICompletionRequest {
  messages: AIMessage[];
  model?: string;
  apiKey: string;
}

export interface AIConnectionTestResult {
  provider: string;
  connected: boolean;
}

export interface AIProvider<Model> {
  readonly id: string;
  readonly name: string;
  complete(request: AICompletionRequest): Promise<string>;
  listModels(apiKey?: string): Promise<Model[]>;
  testConnection(apiKey: string): Promise<AIConnectionTestResult>;
}

export function requireUserApiKey(apiKey?: string): string {
  const normalizedKey = apiKey?.trim();
  if (!normalizedKey) {
    throw new AIProviderError('MISSING_API_KEY', 'Add an OpenRouter API key in Settings before using AI features.');
  }
  return normalizedKey;
}

export function getAIErrorMessage(error: unknown): string {
  if (error instanceof AIProviderError) {
    const provider = error.provider;
    switch (error.code) {
      case 'MISSING_API_KEY': return `Add your ${provider} API key in Settings to enable this feature.`;
      case 'INVALID_API_KEY': return `The ${provider} API key was rejected. Check it in Settings.`;
      case 'INSUFFICIENT_CREDITS': return `${provider} needs available credits for this request.`;
      case 'RATE_LIMITED': return error.retryAfterSeconds
        ? `${provider} rate limit reached. Try again in about ${error.retryAfterSeconds} seconds.`
        : `${provider} rate limit reached. Try again shortly.`;
      case 'PROVIDER_UNAVAILABLE': return `The selected ${provider} service is temporarily unavailable. Try another model or retry shortly.`;
      case 'INVALID_REQUEST': return `${provider} rejected the request. Try again with supported settings.`;
      case 'NETWORK_ERROR': return `Could not reach ${provider}. Check your connection and try again.`;
      case 'TIMEOUT': return `${provider} took too long to respond. Check your connection and try again.`;
      case 'INVALID_RESPONSE': return `${provider} returned an unexpected response. Try again.`;
      case 'MODEL_NOT_FOUND': return `OpenRouter could not find the selected model in its current catalog.`;
      case 'INCOMPATIBLE_MODEL': return `The selected OpenRouter model cannot run AETHER's tool-enabled agent.`;
      case 'SECURE_STORAGE_UNAVAILABLE': return `Secure storage is unavailable on this device, so the ${provider} key was not saved.`;
      default: return `${provider} could not complete the request. Try again shortly.`;
    }
  }
  return 'The AI provider could not complete the request. Try again shortly.';
}

export function isRetryableAIProviderErrorCode(code: string): boolean {
  return code === 'NETWORK_ERROR'
    || code === 'TIMEOUT'
    || code === 'RATE_LIMITED'
    || code === 'PROVIDER_UNAVAILABLE';
}

export function isRetryableAIProviderError(error: unknown): error is AIProviderError {
  return error instanceof AIProviderError && isRetryableAIProviderErrorCode(error.code);
}
