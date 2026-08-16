import { getAetherCloudClient, type AetherCloudClient } from "./client";
import { AetherCloudError } from "./errors";
import type { CommercialPolicy, SubscriptionResponse } from "./types";

const CACHE_TTL_MS = 30_000;

let cached: {
  policy: CommercialPolicy;
  userId: string;
  fetchedAt: number;
} | null = null;

export async function getCommercialPolicy(
  signal?: AbortSignal,
  client: AetherCloudClient = getAetherCloudClient(),
): Promise<SubscriptionResponse> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { userId: cached.userId, policy: cached.policy };
  }
  const response = await client.getSubscription({ signal });
  if (!response.policy || typeof response.policy.tier !== "string") {
    throw new AetherCloudError(
      "INVALID_RESPONSE",
      "AETHER Cloud returned an invalid commercial policy.",
    );
  }
  cached = {
    policy: response.policy,
    userId: response.userId,
    fetchedAt: Date.now(),
  };
  return response;
}

export function requireLiveTranscription(policy: CommercialPolicy): void {
  if (!policy.liveTranscription) {
    throw new AetherCloudError(
      "VOICE_NOT_ENTITLED",
      "Hosted live transcription is unavailable for this plan.",
    );
  }
}

export function requireHostedInference(policy: CommercialPolicy): void {
  if (!policy.hostedInference) {
    throw new AetherCloudError(
      "INFERENCE_NOT_ENTITLED",
      "Hosted inference is unavailable for this plan.",
    );
  }
}

export function resetCommercialPolicyCacheForTests(): void {
  cached = null;
}
