import { setAudioModeAsync } from 'expo-audio';
import { VoiceError } from './errors';

export interface AudioSessionGateway {
  activate(owner: symbol): Promise<void>;
  deactivate(owner: symbol): Promise<void>;
}

let activeOwner: symbol | null = null;

export const expoAudioSession: AudioSessionGateway = {
  async activate(owner) {
    if (activeOwner && activeOwner !== owner) {
      throw new VoiceError('AUDIO_STREAM_START_FAILED', 'Another microphone session is already active.');
    }
    activeOwner = owner;
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        allowsBackgroundRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
    } catch (error) {
      activeOwner = null;
      throw new VoiceError('AUDIO_STREAM_START_FAILED', 'Expo audio session activation failed.', { cause: error });
    }
  },

  async deactivate(owner) {
    if (activeOwner !== owner) return;
    activeOwner = null;
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        allowsBackgroundRecording: false,
        shouldPlayInBackground: false,
      });
    } catch (error) {
      throw new VoiceError('AUDIO_STREAM_START_FAILED', 'Expo audio session deactivation failed.', { cause: error });
    }
  },
};
