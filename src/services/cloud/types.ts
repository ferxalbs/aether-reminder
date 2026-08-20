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

export type UsageMetric = {
  used: number;
  limit: number | null;
  remaining: number | null;
};

export type VoiceUsageMetric = {
  usedSeconds: number;
  limitSeconds: number | null;
  remainingSeconds: number | null;
};

export type AetherUsageSnapshot = {
  plan: {
    tier: CommercialTier;
    source?: CommercialSource;
    displayName: string;
  };
  period: {
    startsAt?: string;
    resetsAt?: string;
  };
  ai: UsageMetric;
  voice: VoiceUsageMetric;
  automations?: UsageMetric;
  capabilities: {
    hostedInference: boolean;
    liveTranscription: boolean;
    cloudAutomations: boolean;
  };
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
};

export type HealthResponse = {
  status: string;
};

export type AetherAccountResponse = {
  account: { id: string };
};

export type AetherDevice = {
  id: string;
  installationId: string;
  platform: "android" | "ios" | "ipados" | "macos" | null;
  appVersion: string | null;
  buildVersion: string | null;
  syncProtocolVersion: number | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
};

export type RegisterDeviceRequest = {
  installationId: string;
  platform: "android" | "ios" | "ipados" | "macos";
  appVersion?: string | null;
  buildVersion?: string | null;
  syncProtocolVersion?: number | null;
};

export type RegisterDeviceResponse = {
  device: AetherDevice;
};
