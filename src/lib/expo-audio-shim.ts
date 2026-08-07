/**
 * expo-audio shim for Expo Go / environments where the native module is unavailable.
 * All APIs are no-ops that resolve safely. The transcribe screen's try/catch blocks
 * handle the fallback UX automatically.
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
