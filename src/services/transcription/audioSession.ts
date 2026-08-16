import { setAudioModeAsync } from "expo-audio";
import {
  createOwnedAudioSession,
  type AudioSessionGateway,
  type SetVoiceAudioMode,
} from "./audioSessionLease";

export type { AudioSessionGateway } from "./audioSessionLease";

export function createExpoAudioSession(
  setAudioMode: SetVoiceAudioMode = (mode) => setAudioModeAsync(mode),
): AudioSessionGateway {
  return createOwnedAudioSession(setAudioMode);
}

export const expoAudioSession = createExpoAudioSession();
