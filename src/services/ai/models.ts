import {
  capabilitiesFromOpenRouterMetadata,
  type OpenRouterModelMetadata,
} from './inference/capabilities';
import type { ModelCapabilities, ModelCompatibilityClass } from './inference/types';

export type AIModelAvailability = 'available' | 'unavailable';

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextLength?: number;
  availability: AIModelAvailability;
  capabilities: ModelCapabilities;
  compatibility: ModelCompatibilityClass;
}

export type OpenRouterModelPayload = OpenRouterModelMetadata;

export interface OpenRouterModelsResponse {
  data?: OpenRouterModelPayload[];
}

function formatProviderName(providerId: string): string {
  const brandedNames: Record<string, string> = {
    anthropic: 'Anthropic',
    google: 'Google',
    meta: 'Meta',
    'meta-llama': 'Meta Llama',
    openai: 'OpenAI',
  };

  if (brandedNames[providerId]) return brandedNames[providerId];

  return providerId.split(/[-_]/g).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function supportsTextChat(model: OpenRouterModelPayload): boolean {
  const inputModalities = model.architecture?.input_modalities;
  const outputModalities = model.architecture?.output_modalities;
  return (!inputModalities || inputModalities.includes('text')) && (!outputModalities || outputModalities.includes('text'));
}

function isExpired(expirationDate?: string | null): boolean {
  if (!expirationDate) return false;
  const expirationTime = Date.parse(expirationDate);
  return Number.isFinite(expirationTime) && expirationTime <= Date.now();
}

export function normalizeOpenRouterModels(payload: OpenRouterModelsResponse): AIModel[] {
  return (payload.data ?? [])
    .filter((model): model is OpenRouterModelPayload & { id: string } =>
      Boolean(model.id && supportsTextChat(model))
    )
    .map((model) => {
      const providerId = model.id.split('/')[0] || 'OpenRouter';
      const capabilities = capabilitiesFromOpenRouterMetadata(model);
      return {
        id: model.id,
        name: model.name?.trim() || model.id,
        provider: formatProviderName(providerId),
        description: model.description?.trim() || 'OpenAI-compatible text model',
        contextLength: model.context_length ?? capabilities.contextLength,
        availability: (isExpired(model.expiration_date)
          ? 'unavailable'
          : 'available') as AIModelAvailability,
        capabilities,
        compatibility: capabilities.compatibility,
      };
    })
    .sort((left, right) =>
      left.availability === right.availability
        ? left.name.localeCompare(right.name)
        : left.availability === 'available'
          ? -1
          : 1
    );
}

export function maskApiKey(apiKey?: string): string {
  const normalizedKey = apiKey?.trim();
  return normalizedKey ? `••••••••••••${normalizedKey.slice(-4)}` : '';
}
