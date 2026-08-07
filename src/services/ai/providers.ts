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
  | 'INVALID_RESPONSE'
  | 'SECURE_STORAGE_UNAVAILABLE'
  | 'UNKNOWN';

export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(code: AIProviderErrorCode, message: string, options?: { status?: number; retryAfterSeconds?: number }) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.status = options?.status;
    this.retryAfterSeconds = options?.retryAfterSeconds;
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
    switch (error.code) {
      case 'MISSING_API_KEY': return 'Add your OpenRouter API key in Settings to enable AI features.';
      case 'INVALID_API_KEY': return 'The OpenRouter API key was rejected. Check it in Settings.';
      case 'INSUFFICIENT_CREDITS': return 'OpenRouter needs available credits for this request.';
      case 'RATE_LIMITED': return error.retryAfterSeconds
        ? `OpenRouter rate limit reached. Try again in about ${error.retryAfterSeconds} seconds.`
        : 'OpenRouter rate limit reached. Try again shortly.';
      case 'PROVIDER_UNAVAILABLE': return 'The selected model provider is temporarily unavailable. Try another model or retry shortly.';
      case 'INVALID_REQUEST': return 'OpenRouter rejected the request. Try a different supported model.';
      case 'NETWORK_ERROR': return 'Could not reach OpenRouter. Check your connection and try again.';
      case 'INVALID_RESPONSE': return 'OpenRouter returned an unexpected response. Try again or choose another model.';
      case 'SECURE_STORAGE_UNAVAILABLE': return 'Secure storage is unavailable on this device, so the key was not saved.';
      default: return 'The AI provider could not complete the request. Try again shortly.';
    }
  }
  return 'The AI provider could not complete the request. Try again shortly.';
}

