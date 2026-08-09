import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AccessibilityInfo, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useIsDark } from '@/theme/useResolvedTheme';
import type { ContextSnapshot } from '@/services/agent';
import { TranscriptionError } from '@/services/transcription';
import type { ActionReceipt } from '@/domain/receipts';
import { useAgentSessionController } from './AgentSessionController';
import { AppBottomNavigation } from './AppBottomNavigation';
import { AssistantSheet } from './AssistantSheet';
import type { AssistantSurfaceState } from './assistantTypes';
import { useVoiceController } from './VoiceController';
import { impactAsync, notificationAsync } from '@/lib/haptics';
import { reportNonFatalError } from '@/lib/nonFatalError';

interface AssistantHostProps {
  blurTarget?: RefObject<View | null>;
}

interface AssistantActionHandlers {
  openTextAssistant: () => void;
  startVoiceAssistant: () => void;
}

const defaultSnapshot: ContextSnapshot = {
  surface: 'home',
  selectedDate: new Date().toISOString().slice(0, 10),
  locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  invocationSource: 'app',
  visibleTaskIds: [],
};

interface AssistantSurfaceContextValue {
  snapshot: ContextSnapshot;
  setSnapshot: (snapshot: ContextSnapshot) => void;
  requestAssistant: (mode: keyof AssistantActionHandlers) => void;
  registerAssistantActions: (actions: AssistantActionHandlers | null) => void;
}

const AssistantSurfaceContext = createContext<AssistantSurfaceContextValue | null>(null);

export const AssistantSurfaceProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<ContextSnapshot>(defaultSnapshot);
  const actionsRef = useRef<AssistantActionHandlers | null>(null);
  const requestAssistant = useCallback((mode: keyof AssistantActionHandlers) => {
    actionsRef.current?.[mode]();
  }, []);
  const registerAssistantActions = useCallback((actions: AssistantActionHandlers | null) => {
    actionsRef.current = actions;
  }, []);
  const value = useMemo(
    () => ({ snapshot, setSnapshot, requestAssistant, registerAssistantActions }),
    [registerAssistantActions, requestAssistant, snapshot],
  );
  return <AssistantSurfaceContext.Provider value={value}>{children}</AssistantSurfaceContext.Provider>;
};

export function useAssistantSurface(snapshot: ContextSnapshot): void {
  const context = useContext(AssistantSurfaceContext);
  if (!context) throw new Error('useAssistantSurface must be used inside AssistantSurfaceProvider');
  const setSnapshot = context.setSnapshot;
  useEffect(() => {
    setSnapshot(snapshot);
  }, [setSnapshot, snapshot]);
}

export function useAssistantActions(): {
  openTextAssistant: () => void;
  startVoiceAssistant: () => void;
} {
  const context = useContext(AssistantSurfaceContext);
  if (!context) throw new Error('useAssistantActions must be used inside AssistantSurfaceProvider');
  return useMemo(
    () => ({
      openTextAssistant: () => context.requestAssistant('openTextAssistant'),
      startVoiceAssistant: () => context.requestAssistant('startVoiceAssistant'),
    }),
    [context],
  );
}

export const AssistantHost: React.FC<AssistantHostProps> = ({ blurTarget }) => {
  const router = useRouter();
  const isDark = useIsDark();
  const { snapshot, registerAssistantActions } = useContext(AssistantSurfaceContext) ?? {
    snapshot: defaultSnapshot,
    setSnapshot: () => undefined,
    requestAssistant: () => undefined,
    registerAssistantActions: () => undefined,
  };
  const [surface, setSurface] = useState<AssistantSurfaceState>('closed');
  const [composerValue, setComposerValue] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshToday = useTasksUiStore((state) => state.refreshToday);
  const refreshUpcoming = useTasksUiStore((state) => state.refreshUpcoming);
  const refreshAll = useTasksUiStore((state) => state.refreshAll);
  const setUndoReceipt = useTasksUiStore((state) => state.setUndoReceipt);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch((error: unknown) => {
        reportNonFatalError('assistant-reduce-motion', error);
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => () => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
  }, []);

  const updateKeyboardOffset = useCallback((event: { endCoordinates: { height: number } }) => {
    setKeyboardOffset(Math.max(0, event.endCoordinates.height));
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, updateKeyboardOffset);
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardOffset(0));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [updateKeyboardOffset]);

  const onNavigate = useCallback(
    (destination: string) => {
      const routeByDestination: Record<string, '/' | '/tasks' | '/all' | '/settings'> = {
        home: '/',
        tasks: '/tasks',
        all: '/all',
        settings: '/settings',
      };
      const destinationPath = routeByDestination[destination];
      if (destinationPath) router.replace(destinationPath as never);
    },
    [router]
  );

  const onMutation = useCallback(
    (toolId: string) => {
      if (!['tasks.create', 'tasks.update', 'tasks.complete', 'tasks.reopen', 'tasks.delete'].includes(toolId)) return;
      void refreshToday().catch((error: unknown) => {
        reportNonFatalError('assistant-refresh-today', error);
      });
      void refreshUpcoming().catch((error: unknown) => {
        reportNonFatalError('assistant-refresh-upcoming', error);
      });
      void refreshAll().catch((error: unknown) => {
        reportNonFatalError('assistant-refresh-all', error);
      });
    },
    [refreshAll, refreshToday, refreshUpcoming]
  );

  const onReceipt = useCallback((receipt: ActionReceipt) => {
    setUndoReceipt(receipt);
    // Keep feedback tied to a real completed receipt; no animation-only success state.
    if (receipt.risk !== 'READ' && useSettingsStore.getState().hapticsEnabled) {
      notificationAsync(Haptics.NotificationFeedbackType.Success).catch((error: unknown) => {
        reportNonFatalError('haptics', error);
      });
    }
  }, [setUndoReceipt]);

  const controller = useAgentSessionController({
    context: snapshot,
    onNavigate,
    onMutation,
    onReceipt,
  });

  const onVoiceTranscript = useCallback(async (text: string) => {
    setComposerValue('');
    setSurface('medium');
    const accepted = await controller.submit(text, { invocationSource: 'voice' });
    if (!accepted) {
      throw new TranscriptionError('HANDOFF_FAILED', 'AETHER could not receive the final transcript.');
    }
  }, [controller]);
  const voice = useVoiceController({ onTranscript: onVoiceTranscript });

  const openTextAssistant = useCallback(() => {
    if (voice.state !== 'idle' && voice.state !== 'error') void voice.cancel();
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    setSurface('compact');
  }, [voice]);

  const startVoiceAssistant = useCallback(() => {
    if (voice.state !== 'idle' && voice.state !== 'error') return;
    if (useSettingsStore.getState().hapticsEnabled) {
      impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error: unknown) => {
        reportNonFatalError('haptics', error);
      });
    }
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    Keyboard.dismiss();
    setSurface('compact');
    voice.beginLocked();
  }, [voice]);

  useEffect(() => {
    registerAssistantActions({ openTextAssistant, startVoiceAssistant });
    return () => registerAssistantActions(null);
  }, [openTextAssistant, registerAssistantActions, startVoiceAssistant]);

  const closeAssistant = useCallback(() => {
    if (voice.state !== 'idle') void voice.cancel();
    Keyboard.dismiss();
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    setSurface('closing');
    transitionTimerRef.current = setTimeout(() => setSurface('closed'), reduceMotion ? 100 : 220);
  }, [reduceMotion, voice]);

  const submit = useCallback(() => {
    const value = composerValue.trim();
    if (!value) return;
    setComposerValue('');
    setSurface('medium');
    void controller.submit(value).catch((error: unknown) => {
      reportNonFatalError('assistant-submit', error);
    });
  }, [composerValue, controller]);

  const showScrim = surface === 'medium' || surface === 'full';

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {showScrim ? (
        <Pressable
          onPress={closeAssistant}
          accessibilityLabel="Dismiss assistant surface"
          style={[styles.scrim, { backgroundColor: isDark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)' }]}
        />
      ) : null}
      <AssistantSheet
        surface={surface}
        messages={controller.messages}
        receipts={controller.receipts}
        semanticState={controller.semanticState}
        error={controller.error}
        canRetry={controller.canRetry}
        isRunning={controller.isRunning}
        pendingConfirmation={controller.pendingConfirmation}
        composerValue={composerValue}
        onComposerChange={setComposerValue}
        onSubmit={submit}
        onClose={closeAssistant}
        onExpand={() => setSurface((current) => (current === 'full' ? 'medium' : 'full'))}
        onConfirm={controller.confirm}
        onCancelConfirmation={controller.cancelConfirmation}
        onRetry={controller.retry}
        reduceMotion={reduceMotion}
        voiceState={voice.state}
        voiceLocked={voice.locked}
        voiceError={voice.error}
        voiceCanRetry={voice.canRetry}
        voiceRetryAttempt={voice.retryAttempt}
        voiceTranscript={voice.transcript}
        voiceAudioLevel={voice.audioLevel}
        onVoiceStop={voice.stopAndSend}
        onVoiceCancel={voice.cancel}
        onVoiceRetry={startVoiceAssistant}
        keyboardOffset={keyboardOffset}
        blurTarget={blurTarget}
        onVoicePress={startVoiceAssistant}
      />
      <AppBottomNavigation
        keyboardOffset={keyboardOffset}
        blurTarget={blurTarget}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
  },
});
