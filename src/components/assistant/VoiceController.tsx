import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import { requestRecordingPermissionsAsync, useAudioStream } from 'expo-audio';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import {
  createOpenAIRealtimeTranscriptionSession,
  initialRealtimeTranscriptionSnapshot,
  OPENAI_REALTIME_TRANSCRIPTION_CHANNELS,
  OPENAI_REALTIME_TRANSCRIPTION_SAMPLE_RATE,
  parseRealtimeServerEvent,
  reduceRealtimeTranscription,
  TranscriptionError,
  getTranscriptionErrorMessage,
  deliverFinalTranscript,
  pcm16AudioLevel,
  normalizePcm16,
  type OpenAIRealtimeSession,
  type RealtimeTranscriptionSnapshot,
  type RealtimeTranscriptionState,
} from '@/services/transcription';
import { useSettingsStore } from '@/stores/settings.store';

export type VoiceState = RealtimeTranscriptionState;

interface AudioStreamBuffer {
  data: ArrayBuffer;
  sampleRate: number;
  channels: number;
  timestamp: number;
}

interface VoiceControllerOptions {
  onTranscript: (text: string) => void | Promise<void>;
}

interface VoiceControllerResult {
  state: VoiceState;
  locked: boolean;
  error: string | null;
  transcript: string;
  audioLevel: SharedValue<number>;
  begin: () => void;
  release: () => void;
  lock: () => void;
  stopAndSend: () => void;
  cancel: () => void;
}

function haptic(kind: 'start' | 'stop' | 'cancel' | 'error'): void {
  if (!useSettingsStore.getState().hapticsEnabled) return;
  const action = kind === 'error'
    ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    : kind === 'cancel'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      : Haptics.impactAsync(kind === 'start' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  action.catch(() => {});
}

export function useVoiceController({ onTranscript }: VoiceControllerOptions): VoiceControllerResult {
  const openAiApiKey = useSettingsStore((state) => state.openAiApiKey);
  const openAiKeyLoaded = useSettingsStore((state) => state.openAiKeyLoaded);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const sessionRef = useRef<OpenAIRealtimeSession | null>(null);
  const activeRef = useRef(false);
  const stateRef = useRef<VoiceState>('idle');
  const snapshotRef = useRef<RealtimeTranscriptionSnapshot>(initialRealtimeTranscriptionSnapshot);
  const audioBytesRef = useRef(0);
  const finishingRef = useRef(false);
  const finalSubmittedRef = useRef(false);
  const lastAudioLevelAtRef = useRef(0);
  const mountedRef = useRef(true);
  const streamRef = useRef<{ stop: () => void } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [state, setState] = useState<VoiceState>('idle');
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RealtimeTranscriptionSnapshot>(initialRealtimeTranscriptionSnapshot);
  const audioLevel = useSharedValue(0);

  const setVoiceState = useCallback((next: VoiceState) => {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  }, []);

  const setRealtimeSnapshot = useCallback((next: RealtimeTranscriptionSnapshot) => {
    snapshotRef.current = next;
    if (mountedRef.current) setSnapshot(next);
  }, []);

  const cleanupResources = useCallback((cancelSession: boolean) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeRef.current = false;
    finishingRef.current = false;
    streamRef.current?.stop();
    streamRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      if (cancelSession) session.cancel();
      else session.close();
    }
    audioBytesRef.current = 0;
    finalSubmittedRef.current = false;
    lastAudioLevelAtRef.current = 0;
    audioLevel.set(0);
  }, [audioLevel]);

  const fail = useCallback((caught: unknown) => {
    const transcriptionError = caught instanceof TranscriptionError
      ? caught
      : new TranscriptionError('SESSION_FAILED', 'The OpenAI realtime transcription session failed.');
    cleanupResources(true);
    setVoiceState('error');
    if (mountedRef.current) {
      setError(getTranscriptionErrorMessage(transcriptionError));
      setLocked(false);
    }
    haptic('error');
  }, [cleanupResources, setVoiceState]);

  const handleRealtimeEvent = useCallback((rawEvent: unknown) => {
    if (!activeRef.current) return;
    let parsed;
    try {
      parsed = parseRealtimeServerEvent(rawEvent);
    } catch {
      fail(new TranscriptionError('INVALID_EVENT', 'OpenAI returned a malformed realtime event.'));
      return;
    }
    if (!parsed) return;
    const next = reduceRealtimeTranscription(snapshotRef.current, parsed);
    setRealtimeSnapshot(next);
    if (parsed.type === 'server.error') {
      fail(new TranscriptionError(parsed.code, 'OpenAI rejected the realtime transcription session.'));
      return;
    }
    setVoiceState(next.state);
    if (parsed.type === 'transcription.completed') {
      const finalText = next.finalText.trim();
      let submitted = false;
      try {
        submitted = deliverFinalTranscript(finalText, finalSubmittedRef, (committedText) => {
          const callbackResult = onTranscriptRef.current(committedText);
          if (callbackResult && typeof (callbackResult as Promise<void>).catch === 'function') {
            void (callbackResult as Promise<void>).catch(() => {});
          }
        });
      } catch (caught) {
        fail(caught);
        return;
      }
      if (!submitted) return;
      cleanupResources(false);
      setVoiceState('idle');
      if (mountedRef.current) {
        setLocked(false);
        setError(null);
      }
    }
  }, [cleanupResources, fail, setRealtimeSnapshot, setVoiceState]);

  const handleAudioBuffer = useCallback((buffer: AudioStreamBuffer) => {
    const session = sessionRef.current;
    if (!activeRef.current || !session) return;
    if (
      buffer.data.byteLength % 2 !== 0
    ) {
      fail(new TranscriptionError('INVALID_AUDIO', 'The native stream delivered incomplete PCM16 audio.'));
      return;
    }
    try {
      const normalized = normalizePcm16(buffer.data, buffer.sampleRate, buffer.channels, OPENAI_REALTIME_TRANSCRIPTION_SAMPLE_RATE);
      session.appendPcm16(normalized);
      audioBytesRef.current += normalized.byteLength;
      const now = Date.now();
      if (now - lastAudioLevelAtRef.current >= 50) {
        // Kept local to the voice controller; this never enters Zustand or persistence.
        lastAudioLevelAtRef.current = now;
        if (mountedRef.current) {
          audioLevel.set(pcm16AudioLevel(normalized));
        }
      }
    } catch (caught) {
      fail(caught);
    }
  }, [audioLevel, fail]);

  const audioStream = useAudioStream({
    sampleRate: OPENAI_REALTIME_TRANSCRIPTION_SAMPLE_RATE,
    channels: OPENAI_REALTIME_TRANSCRIPTION_CHANNELS,
    encoding: 'int16',
    onBuffer: handleAudioBuffer,
  });

  useEffect(() => {
    streamRef.current = audioStream.stream;
  }, [audioStream.stream]);

  const cancel = useCallback(() => {
    if (!activeRef.current && stateRef.current === 'idle') return;
    cleanupResources(true);
    setRealtimeSnapshot(initialRealtimeTranscriptionSnapshot);
    setVoiceState('idle');
    if (mountedRef.current) {
      setError(null);
      setLocked(false);
    }
    haptic('cancel');
  }, [cleanupResources, setRealtimeSnapshot, setVoiceState]);

  const stopAndSend = useCallback(() => {
    if (!activeRef.current || finishingRef.current) return;
    if (!['listening', 'transcribing'].includes(stateRef.current)) return;
    finishingRef.current = true;
    setVoiceState('finalizing');
    setRealtimeSnapshot(reduceRealtimeTranscription(snapshotRef.current, { type: 'client.commit' }));
    haptic('stop');
    streamRef.current?.stop();
    streamRef.current = null;
    const session = sessionRef.current;
    if (!session) {
      fail(new TranscriptionError('SESSION_FAILED', 'The OpenAI realtime session disappeared before commit.'));
      return;
    }
    if (audioBytesRef.current === 0) {
      fail(new TranscriptionError('EMPTY_TRANSCRIPT', 'No microphone audio was captured.'));
      return;
    }
    try {
      session.commit();
    } catch (caught) {
      fail(caught);
    }
  }, [fail, setRealtimeSnapshot, setVoiceState]);

  const release = useCallback(() => {
    if (!locked) stopAndSend();
  }, [locked, stopAndSend]);

  const lock = useCallback(() => {
    if (!activeRef.current || stateRef.current !== 'listening') return;
    setLocked(true);
    haptic('start');
  }, []);

  const begin = useCallback(() => {
    if (activeRef.current || !['idle', 'error'].includes(stateRef.current)) return;
    activeRef.current = true;
    finishingRef.current = false;
    finalSubmittedRef.current = false;
    audioBytesRef.current = 0;
    setError(null);
    setLocked(false);
    setRealtimeSnapshot({ ...initialRealtimeTranscriptionSnapshot, state: 'connecting' });
    setVoiceState('connecting');
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    streamRef.current = audioStream.stream;

    void (async () => {
      try {
        if (!openAiKeyLoaded) throw new TranscriptionError('SESSION_FAILED', 'Secure storage is still loading. Try again in a moment.');
        if (!openAiApiKey.trim()) throw new TranscriptionError('MISSING_API_KEY', 'An OpenAI API key is required.');
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) throw new TranscriptionError('PERMISSION_DENIED', 'Microphone permission was denied.');
        if (abortController.signal.aborted || !activeRef.current) return;

        const session = createOpenAIRealtimeTranscriptionSession(openAiApiKey, {
          onEvent: handleRealtimeEvent,
          onError: fail,
        });
        sessionRef.current = session;
        await session.connect();
        if (abortController.signal.aborted || !activeRef.current) return;
        await audioStream.stream.start();
        if (abortController.signal.aborted || !activeRef.current) return;
        setVoiceState('listening');
        haptic('start');
      } catch (caught) {
        if (activeRef.current) fail(caught);
      }
    })();
  }, [audioStream.stream, fail, handleRealtimeEvent, openAiApiKey, openAiKeyLoaded, setRealtimeSnapshot, setVoiceState]);

  useEffect(() => {
    const onAppStateChange = (next: AppStateStatus) => {
      if (next !== 'active' && activeRef.current) cancel();
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [cancel]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupResources(true);
    };
  }, [cleanupResources]);

  return {
    state,
    locked,
    error,
    transcript: snapshot.finalText || snapshot.partialText,
    audioLevel,
    begin,
    release,
    lock,
    stopAndSend,
    cancel,
  };
}
