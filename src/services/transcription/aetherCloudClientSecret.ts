import {
  AetherCloudError,
  getAetherCloudClient,
  getCommercialPolicy,
  requireLiveTranscription,
  type AetherCloudClient,
} from "@/services/cloud";
import { VoiceError, type VoiceErrorCode } from "./errors";
import type {
  RealtimeClientSecret,
  RealtimeClientSecretProvider,
  RealtimeTranscriptionConfig,
} from "./types";

export class AetherCloudClientSecretProvider implements RealtimeClientSecretProvider {
  constructor(
    private readonly client?: AetherCloudClient,
    private readonly resolveClient: () => AetherCloudClient = getAetherCloudClient,
  ) {}

  async create(
    config: RealtimeTranscriptionConfig,
    signal?: AbortSignal,
  ): Promise<RealtimeClientSecret> {
    const language = config.context.languages?.find(
      (value) => typeof value === "string" && /^[a-z]{2}$/i.test(value),
    );
    let authorization;
    try {
      // Cloud configuration is intentionally resolved only when the user starts
      // voice. AssistantHost must stay mountable for local-first development.
      const client = this.client ?? this.resolveClient();
      const { policy } = await getCommercialPolicy(signal, client);
      requireLiveTranscription(policy);
      authorization = await client.createVoiceAuthorization(
        language ? { language: language.toLowerCase() } : {},
        { signal },
      );
    } catch (error) {
      throw mapCloudVoiceError(error);
    }

    if (
      typeof authorization.clientSecret !== "string" ||
      !authorization.clientSecret.startsWith("ek_") ||
      typeof authorization.expiresAt !== "number"
    ) {
      throw new VoiceError(
        "REALTIME_AUTH_FAILED",
        "AETHER Cloud returned an invalid voice authorization.",
      );
    }

    if (authorization.expiresAt * 1000 <= Date.now()) {
      throw new VoiceError(
        "REALTIME_AUTH_FAILED",
        "The hosted voice authorization expired before it could be used.",
      );
    }

    return {
      value: authorization.clientSecret,
      expiresAt: authorization.expiresAt,
      modelAccess: "MODEL_EXISTS",
      requestId: authorization.authorizationId,
    };
  }
}

function mapCloudVoiceError(error: unknown): VoiceError {
  if (error instanceof VoiceError) return error;
  if (!(error instanceof AetherCloudError)) {
    return new VoiceError(
      "REALTIME_AUTH_FAILED",
      "Could not authorize live transcription through AETHER Cloud.",
      { cause: error },
    );
  }

  const code = voiceCodeForCloud(error.code);
  return new VoiceError(code, voiceMessageForCloud(error), {
    cause: error,
    status: error.status,
    retryAfterSeconds: error.retryAfterSeconds,
    providerError: {
      code: error.code,
      message: error.message,
      requestId: error.requestId,
    },
  });
}

function voiceCodeForCloud(code: AetherCloudError["code"]): VoiceErrorCode {
  switch (code) {
    case "CANCELLED":
      return "CANCELLED";
    case "VOICE_NOT_ENTITLED":
    case "UNAUTHORIZED":
      return "ACCOUNT_NOT_AUTHORIZED";
    case "VOICE_QUOTA_EXCEEDED":
      return "HOSTED_USAGE_EXHAUSTED";
    case "PROVIDER_UNAUTHORIZED":
      return "INVALID_CREDENTIAL";
    case "PROVIDER_TIMEOUT":
    case "TIMEOUT":
      return "REALTIME_TIMEOUT";
    case "PROVIDER_UNAVAILABLE":
    case "NOT_READY":
      return "MODEL_TEMPORARILY_UNAVAILABLE";
    default:
      return "REALTIME_AUTH_FAILED";
  }
}

function voiceMessageForCloud(error: AetherCloudError): string {
  switch (error.code) {
    case "VOICE_NOT_ENTITLED":
      return "Hosted live transcription is unavailable for this plan.";
    case "VOICE_QUOTA_EXCEEDED":
      return "Hosted voice usage is exhausted for this period.";
    case "NETWORK_ERROR":
      return "Could not reach AETHER Cloud to authorize live transcription.";
    case "PROVIDER_UNAVAILABLE":
    case "NOT_READY":
      return "AETHER Cloud is temporarily unavailable for live transcription.";
    case "PROVIDER_TIMEOUT":
    case "TIMEOUT":
      return "AETHER Cloud took too long to authorize live transcription.";
    case "UNAUTHORIZED":
    case "FORBIDDEN":
      return "AETHER Cloud authentication is required for live transcription.";
    case "CANCELLED":
      return "Voice authorization was cancelled.";
    default:
      return "Could not authorize live transcription. Try again shortly.";
  }
}
