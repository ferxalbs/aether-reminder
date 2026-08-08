import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { deleteAsync } from 'expo-file-system/legacy';
import { OpenRouterSTTProvider, TranscriptionError, getTranscriptionErrorMessage } from '@/services/transcription';
import { useSettingsStore } from '@/stores/settings.store';

export type VoiceState = 'idle' | 'requesting_permission' | 'preparing' | 'listening' | 'finalizing' | 'transcribing' | 'ready' | 'cancelled' | 'error';

export interface VoiceMetrics {
  pressToRecordingMs?: number;
  finalizationMs?: number;
  transcriptionMs?: number;
  transcriptToAgentMs?: number;
}

interface VoiceControllerOptions {
  onTranscript: (text: string) => void;
}

interface VoiceControllerResult {
  state: VoiceState;
  locked: boolean;
  error: string | null;
  metrics: VoiceMetrics;
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

async function discardAudio(uri: string | null): Promise<void> {
  if (!uri) return;
  await deleteAsync(uri, { idempotent: true }).catch(() => {});
}

export function useVoiceController({ onTranscript }: VoiceControllerOptions): VoiceControllerResult {
  const apiKey = useSettingsStore((state) => state.openRouterApiKey);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const providerRef = useRef(new OpenRouterSTTProvider());
  const abortRef = useRef<AbortController | null>(null);
  const audioUriRef = useRef<string | null>(null);
  const hasStartedRef = useRef(false);
  const [state, setState] = useState<VoiceState>('idle');
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<VoiceMetrics>({});

  const fail = useCallback((caught: unknown) => {
    const message = caught instanceof TranscriptionError ? getTranscriptionErrorMessage(caught) : caught instanceof Error ? caught.message : 'Voice capture failed. Try again.';
    setError(message);
    setState('error');
    haptic('error');
  }, []);

  const cleanup = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    await discardAudio(audioUriRef.current);
    audioUriRef.current = null;
    hasStartedRef.current = false;
    setLocked(false);
  }, []);

  const cancel = useCallback(async () => {
    if (state === 'idle' || state === 'cancelled') return;
    setState('cancelled');
    haptic('cancel');
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch {
      // The URI is still discarded below when native stop reports an interruption.
    }
    await cleanup();
    setError(null);
    setState('idle');
  }, [cleanup, recorder, state]);

  const transcribe = useCallback(async (uri: string) => {
    const started = Date.now();
    setState('transcribing');
    const abortController = new AbortController();
    abortRef.current = abortController;
    try {
      const result = await providerRef.current.transcribeAudio(uri, apiKey, abortController.signal);
      if (abortController.signal.aborted) return;
      if (!result.text.trim()) throw new TranscriptionError('INVALID_RESPONSE', 'OpenRouter returned an empty transcript.');
      setMetrics((previous) => ({ ...previous, transcriptionMs: Date.now() - started }));
      setState('ready');
      const submittedAt = Date.now();
      onTranscript(result.text);
      setMetrics((previous) => ({ ...previous, transcriptToAgentMs: Date.now() - submittedAt }));
      await discardAudio(uri);
      audioUriRef.current = null;
      setState('idle');
    } catch (caught) {
      if (abortController.signal.aborted) return;
      await discardAudio(uri);
      audioUriRef.current = null;
      fail(caught);
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
    }
  }, [apiKey, fail, onTranscript]);

  const finalize = useCallback(async () => {
    if (state !== 'listening') return;
    setState('finalizing');
    haptic('stop');
    const started = Date.now();
    try {
      if (recorder.isRecording) await recorder.stop();
      const uri = recorder.uri;
      setMetrics((previous) => ({ ...previous, finalizationMs: Date.now() - started }));
      audioUriRef.current = uri;
      hasStartedRef.current = false;
      if (!uri) throw new TranscriptionError('INVALID_AUDIO', 'The recording produced no audio file.');
      await transcribe(uri);
    } catch (caught) {
      await discardAudio(audioUriRef.current);
      audioUriRef.current = null;
      fail(caught);
    }
  }, [fail, recorder, state, transcribe]);

  const begin = useCallback(() => {
    if (!['idle', 'error', 'cancelled', 'ready'].includes(state)) return;
    void (async () => {
      setError(null);
      setLocked(false);
      setState('requesting_permission');
      const started = Date.now();
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) throw new TranscriptionError('PERMISSION_DENIED', 'Microphone permission was denied.');
        setState('preparing');
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'doNotMix' });
        await recorder.prepareToRecordAsync();
        recorder.record();
        if (!recorder.isRecording) throw new TranscriptionError('AUDIO_UNAVAILABLE', 'The native recorder did not start.');
        hasStartedRef.current = true;
        setMetrics((previous) => ({ ...previous, pressToRecordingMs: Date.now() - started }));
        setState('listening');
        haptic('start');
      } catch (caught) {
        await cleanup();
        fail(caught);
      }
    })();
  }, [cleanup, fail, recorder, state]);

  const release = useCallback(() => {
    if (!locked) void finalize();
  }, [finalize, locked]);

  const lock = useCallback(() => {
    if (state !== 'listening' || !hasStartedRef.current) return;
    setLocked(true);
    haptic('start');
  }, [state]);

  useEffect(() => {
    const onAppStateChange = (next: AppStateStatus) => {
      if (next !== 'active' && (state === 'listening' || state === 'preparing')) void cancel();
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [cancel, state]);

  useEffect(() => () => { void cleanup(); }, [cleanup]);

  return { state, locked, error, metrics, begin, release, lock, stopAndSend: finalize, cancel };
}
