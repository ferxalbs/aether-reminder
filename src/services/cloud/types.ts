export type CommercialTier = "free" | "pro";
export type CommercialSource =
  "monthly" | "yearly" | "lifetime" | "promo" | "free" | "unknown";

export type CommercialPolicy = {
  version: string;
  tier: CommercialTier;
  source: CommercialSource;
  hostedInference: boolean;
  liveTranscription: boolean;
  cloudAutomations: boolean;
  limits: {
    voiceAuthorizations: number;
    inferenceBudget: number;
    automationRuns: number;
  };
};

export type SubscriptionResponse = {
  userId: string;
  policy: CommercialPolicy;
};

export type VoiceAuthorizationRequest = {
  language?: string;
};

export type VoiceAuthorizationResponse = {
  authorizationId: string;
  clientSecret: string;
  expiresAt: number;
};

export type InferenceTurnRequest = {
  capability: "assistant.turn";
  toolsetVersion: string;
  messages: Record<string, unknown>[];
  modelPreference?: string;
};

export type HealthResponse = {
  status: string;
};
