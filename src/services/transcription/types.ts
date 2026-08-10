import type { NativePcmBuffer } from './audio';
import type { VoiceError } from './errors';

export const REALTIME_TRANSCRIPTION_MODEL = 'gpt-live-transcribe';
export const REALTIME_PCM_SAMPLE_RATE = 24000;
export const REALTIME_PCM_CHANNELS = 1;

export interface TranscriptionContext {
  languages?: string[];
  keywords?: string[];
  prompt?: string;
}

export interface RealtimeTranscriptionConfig {
  model: string;
  sampleRate: 24000;
  turnDetection: null;
  context: TranscriptionContext;
}

export const defaultRealtimeTranscriptionConfig: RealtimeTranscriptionConfig = {
  model: REALTIME_TRANSCRIPTION_MODEL,
  sampleRate: REALTIME_PCM_SAMPLE_RATE,
  turnDetection: null,
  context: {
    languages: ['en', 'es'],
    prompt: 'Short personal reminders, including tasks, names, dates, times, locations, and short notes. English and Spanish may be code-switched.',
  },
};

export type RealtimeTransportEvent =
  | { type: 'connected' }
  | { type: 'speechDelta'; itemId: string; delta: string }
  | { type: 'completed'; itemId: string; transcript: string }
  | { type: 'failed'; error: VoiceError }
  | { type: 'closed'; expected: boolean };

export type RealtimeTransportListener = (event: RealtimeTransportEvent) => void;

export interface RealtimeTranscriptionTransport {
  connect(clientSecret: string): Promise<void>;
  configure(config: RealtimeTranscriptionConfig): Promise<void>;
  appendPcm(data: ArrayBuffer): void;
  commit(): void;
  cancel(): void;
  close(): void;
  subscribe(listener: RealtimeTransportListener): () => void;
}

export interface RealtimeClientSecret {
  value: string;
  expiresAt: number;
  modelAccess: 'MODEL_EXISTS';
  requestId?: string;
}

export interface RealtimeClientSecretProvider {
  create(config: RealtimeTranscriptionConfig, signal?: AbortSignal): Promise<RealtimeClientSecret>;
}

export interface NativeAudioCapture {
  start(onBuffer: (buffer: NativePcmBuffer) => void): Promise<void>;
  stop(): Promise<void>;
}
