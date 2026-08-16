import { VoiceError } from "./errors";

export interface MicrophonePermissionResponse {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}

export interface MicrophonePermissionGateway {
  get(): Promise<MicrophonePermissionResponse>;
  request(): Promise<MicrophonePermissionResponse>;
}

export async function ensureMicrophonePermission(
  gateway: MicrophonePermissionGateway,
): Promise<"granted"> {
  const current = await gateway.get();
  if (current.granted) return "granted";
  if (!current.canAskAgain) {
    throw new VoiceError(
      "MIC_PERMISSION_BLOCKED",
      "Microphone permission is permanently denied.",
    );
  }
  const requested = await gateway.request();
  if (requested.granted) return "granted";
  throw new VoiceError(
    requested.canAskAgain ? "MIC_PERMISSION_DENIED" : "MIC_PERMISSION_BLOCKED",
    "Microphone permission was denied.",
  );
}
