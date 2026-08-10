import { VoiceError } from './errors';

export interface AudioSessionGateway {
  activate(owner: symbol): Promise<void>;
  deactivate(owner: symbol): Promise<void>;
}

export interface VoiceAudioMode {
  allowsRecording: boolean;
  allowsBackgroundRecording: boolean;
  playsInSilentMode?: boolean;
  shouldPlayInBackground: boolean;
}

export type SetVoiceAudioMode = (mode: VoiceAudioMode) => Promise<void>;

export function createOwnedAudioSession(setAudioMode: SetVoiceAudioMode): AudioSessionGateway {
  let activeOwner: symbol | null = null;
  let operation: Promise<void> = Promise.resolve();

  const serialize = (task: () => Promise<void>): Promise<void> => {
    const next = operation.then(task, task);
    operation = next.then(() => undefined, () => undefined);
    return next;
  };

  return {
    activate(owner) {
      return serialize(async () => {
        if (activeOwner && activeOwner !== owner) {
          throw new VoiceError('AUDIO_STREAM_START_FAILED', 'Another microphone session is already active.');
        }
        activeOwner = owner;
        try {
          await setAudioMode({
            allowsRecording: true,
            allowsBackgroundRecording: false,
            playsInSilentMode: true,
            shouldPlayInBackground: false,
          });
        } catch (error) {
          activeOwner = null;
          throw new VoiceError('AUDIO_STREAM_START_FAILED', 'Expo audio session activation failed.', { cause: error });
        }
      });
    },

    deactivate(owner) {
      return serialize(async () => {
        if (activeOwner !== owner) return;
        activeOwner = null;
        try {
          await setAudioMode({
            allowsRecording: false,
            allowsBackgroundRecording: false,
            shouldPlayInBackground: false,
          });
        } catch (error) {
          throw new VoiceError('AUDIO_STREAM_START_FAILED', 'Expo audio session deactivation failed.', { cause: error });
        }
      });
    },
  };
}
