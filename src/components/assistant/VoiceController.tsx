import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  useAudioStream,
  type AudioStreamBuffer,
} from 'expo-audio';
import { usePathname } from 'expo-router';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import {
  OpenAIByokClientSecretProvider,
  OpenAIRealtimeWebSocketTransport,
  VoiceSession,
  defaultRealtimeTranscriptionConfig,
  expoAudioSession,
  getVoiceErrorMessage,
  initialVoiceSnapshot,
  isFailureState,
  isRetryableVoiceErrorCode,
  type NativeAudioCapture,
  type VoiceErrorCode,
  type VoicePermissionState,
  type VoiceSnapshot,
  type VoiceState,
} from '@/services/transcription';
import { useSettingsStore } from '@/stores/settings.store';
import { reportNonFatalError } from '@/lib/nonFatalError';

export type { VoiceState } from '@/services/transcription';

interface VoiceControllerOptions {
  onTranscript: (text: string) => void | Promise<void>;
}

export interface VoiceControllerResult {
  state: VoiceState;
  permission: VoicePermissionState;
  locked: boolean;
  error: string | null;
  errorCode: VoiceErrorCode | null;
  canRetry: boolean;
  retryAttempt: number;
  partialTranscript: string;
  finalTranscript: string;
  transcript: string;
  audioLevel: SharedValue<number>;
  begin: () => void;
  beginLocked: () => void;
  release: () => void;
  lock: () => void;
  stopAndSend: () => void;
  retry: () => void;
  cancel: () => void;
}

export function useVoiceController({ onTranscript }: VoiceControllerOptions): VoiceControllerResult {
  const pathname = usePathname();
  const openAiApiKey = useSettingsStore((state) => state.openAiApiKey);
  const openAiKeyLoaded = useSettingsStore((state) => state.openAiKeyLoaded);
  const bufferListenerRef = useRef<((buffer: AudioStreamBuffer) => void) | null>(null);
  const previousPathnameRef = useRef(pathname);
  const wasStreamingRef = useRef(false);
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>(initialVoiceSnapshot);
  const audioLevel = useSharedValue(0);

  const audioStream = useAudioStream({
    sampleRate: defaultRealtimeTranscriptionConfig.sampleRate,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => bufferListenerRef.current?.(buffer),
  });

  const capture = useMemo<NativeAudioCapture>(() => ({
    async start(onBuffer) {
      bufferListenerRef.current = onBuffer;
      await audioStream.stream.start();
    },
    async stop() {
      bufferListenerRef.current = null;
      audioStream.stream.stop();
    },
  }), [audioStream.stream]);

  // VoiceSession's constructor only stores these callbacks; it does not invoke ref-backed capture during render.
  // eslint-disable-next-line react-hooks/refs
  const voiceSession = useMemo(() => new VoiceSession({
    permission: {
      get: getRecordingPermissionsAsync,
      request: requestRecordingPermissionsAsync,
    },
    audioSession: expoAudioSession,
    capture,
    clientSecrets: new OpenAIByokClientSecretProvider(openAiKeyLoaded ? openAiApiKey : ''),
    createTransport: () => new OpenAIRealtimeWebSocketTransport({
      model: defaultRealtimeTranscriptionConfig.model,
    }),
    config: defaultRealtimeTranscriptionConfig,
    onFinalTranscript: onTranscript,
    onAudioLevel: (level) => audioLevel.set(level),
    onTechnicalError: (error) => reportNonFatalError('voice-cleanup', error),
  }), [audioLevel, capture, onTranscript, openAiApiKey, openAiKeyLoaded]);

  useEffect(() => voiceSession.subscribe((next) => {
    setSnapshot(next);
    if (next.error) {
      reportNonFatalError(
        'voice-session',
        new Error(`code=${next.error.code} message=${next.error.message}`, { cause: next.error.cause }),
      );
    }
  }), [voiceSession]);

  useEffect(() => () => {
    void voiceSession.dispose();
  }, [voiceSession]);

  const cancel = useCallback(() => {
    void voiceSession.cancel();
  }, [voiceSession]);

  useEffect(() => {
    const onAppStateChange = (next: AppStateStatus) => {
      if (next !== 'active' && voiceSession.snapshot.state !== 'idle') cancel();
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [cancel, voiceSession]);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      if (voiceSession.snapshot.state !== 'idle') cancel();
    }
  }, [cancel, pathname, voiceSession]);

  useEffect(() => {
    if (audioStream.isStreaming) {
      wasStreamingRef.current = true;
      return;
    }
    if (wasStreamingRef.current
      && (voiceSession.snapshot.state === 'connecting' || voiceSession.snapshot.state === 'listening')) {
      wasStreamingRef.current = false;
      void voiceSession.captureInterrupted();
    }
  }, [audioStream.isStreaming, voiceSession]);

  const begin = useCallback(() => {
    void voiceSession.start();
  }, [voiceSession]);
  const stopAndSend = useCallback(() => {
    void voiceSession.stop();
  }, [voiceSession]);
  const retry = useCallback(() => {
    void voiceSession.retry();
  }, [voiceSession]);

  const error = snapshot.error ? getVoiceErrorMessage(snapshot.error) : null;
  return {
    state: snapshot.state,
    permission: snapshot.permission,
    locked: snapshot.state === 'listening',
    error,
    errorCode: snapshot.error?.code ?? null,
    canRetry: snapshot.error ? isRetryableVoiceErrorCode(snapshot.error.code) : false,
    retryAttempt: snapshot.retryAttempt,
    partialTranscript: snapshot.partialTranscript,
    finalTranscript: snapshot.finalTranscript,
    transcript: snapshot.finalTranscript || snapshot.partialTranscript,
    audioLevel,
    begin,
    beginLocked: begin,
    release: stopAndSend,
    lock: () => undefined,
    stopAndSend,
    retry,
    cancel,
  };
}

export function isVoiceFailureState(state: VoiceState): boolean {
  return isFailureState(state);
}
