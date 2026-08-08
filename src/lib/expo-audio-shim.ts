/**
 * expo-audio shim for Expo Go only.
 *
 * Enable via EXPO_AUDIO_SHIM=1 in metro (see metro.config.js).
 * When active, permissions report denied and the recorder is a no-op.
 * Callers MUST treat that as failure — never fabricate a recording or transcript.
 */

export const RecordingPresets = {
  HIGH_QUALITY: {},
  LOW_QUALITY: {},
};

export const AudioModule = {
  requestRecordingPermissionsAsync: async () => ({ status: 'denied', granted: false }),
  getRecordingPermissionsAsync: async () => ({ status: 'denied', granted: false }),
};

export const setAudioModeAsync = async (_options: Record<string, unknown>) => {};

export function useAudioRecorder(_options: unknown) {
  return {
    isRecording: false,
    uri: null as string | null,
    prepareToRecordAsync: async () => {},
    record: () => {},
    stop: async () => {},
    pause: async () => {},
    getStatus: async () => ({}),
  };
}

export function useAudioRecorderState(_recorder: unknown) {
  return { isRecording: false, durationMillis: 0 };
}
