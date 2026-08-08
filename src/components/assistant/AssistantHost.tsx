import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useIsDark } from '@/theme/useResolvedTheme';
import type { ContextSnapshot } from '@/services/agent';
import type { ActionReceipt } from '@/domain/receipts';
import { useAgentSessionController } from './AgentSessionController';
import { AppBottomNavigation } from './AppBottomNavigation';
import { AssistantSheet } from './AssistantSheet';
import type { AssistantOrbState, AssistantSurfaceState } from './assistantTypes';
import { useVoiceController } from './VoiceController';

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
}

const AssistantSurfaceContext = createContext<AssistantSurfaceContextValue | null>(null);

export const AssistantSurfaceProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<ContextSnapshot>(defaultSnapshot);
  const value = useMemo(() => ({ snapshot, setSnapshot }), [snapshot]);
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

export const AssistantHost: React.FC = () => {
  const router = useRouter();
  const isDark = useIsDark();
  const { snapshot } = useContext(AssistantSurfaceContext) ?? {
    snapshot: defaultSnapshot,
    setSnapshot: () => undefined,
  };
  const [surface, setSurface] = useState<AssistantSurfaceState>('closed');
  const [composerValue, setComposerValue] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartedRef = useRef(false);
  const suppressNextTapRef = useRef(false);
  const orbStartYRef = useRef<number | null>(null);
  const refreshToday = useTasksUiStore((state) => state.refreshToday);
  const refreshUpcoming = useTasksUiStore((state) => state.refreshUpcoming);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => () => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
  }, []);

  const onNavigate = useCallback(
    (destination: string) => {
      const routeByDestination: Record<string, '/' | '/tasks' | '/settings'> = {
        home: '/',
        tasks: '/tasks',
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
      void refreshToday();
      void refreshUpcoming();
    },
    [refreshToday, refreshUpcoming]
  );

  const onReceipt = useCallback((receipt: ActionReceipt) => {
    // Keep feedback tied to a real completed receipt; no animation-only success state.
    if (receipt.risk !== 'READ' && useSettingsStore.getState().hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, []);

  const controller = useAgentSessionController({
    context: snapshot,
    onNavigate,
    onMutation,
    onReceipt,
  });

  const onVoiceTranscript = useCallback((text: string) => {
    setComposerValue('');
    setSurface('medium');
    void controller.submit(text, { invocationSource: 'voice' });
  }, [controller]);
  const voice = useVoiceController({ onTranscript: onVoiceTranscript });

  const onOrbPressIn = useCallback(() => {
    orbStartYRef.current = null;
    holdStartedRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      holdStartedRef.current = true;
      suppressNextTapRef.current = true;
      voice.begin();
    }, 180);
  }, [voice]);

  const onOrbPressOut = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    if (holdStartedRef.current) voice.release();
    orbStartYRef.current = null;
  }, [voice]);

  const onOrbPressMove = useCallback((event: { nativeEvent: { pageY: number } }) => {
    orbStartYRef.current ??= event.nativeEvent.pageY;
    if (orbStartYRef.current - event.nativeEvent.pageY > 64) voice.lock();
  }, [voice]);

  const openAssistant = useCallback(() => {
    if (suppressNextTapRef.current) {
      suppressNextTapRef.current = false;
      holdStartedRef.current = false;
      return;
    }
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    if (surface === 'closed' || surface === 'closing') {
      setSurface('opening');
      transitionTimerRef.current = setTimeout(() => setSurface('compact'), reduceMotion ? 80 : 220);
    } else {
      setSurface('closed');
    }
    if (surface === 'medium' || surface === 'full') Keyboard.dismiss();
  }, [reduceMotion, surface]);

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
    void controller.submit(value);
  }, [composerValue, controller]);

  const orbState: AssistantOrbState = surface === 'opening'
    ? 'opening'
    : surface === 'closing'
      ? 'closing'
      : voice.state === 'requesting_permission' || voice.state === 'preparing' || voice.state === 'listening' || voice.state === 'finalizing' || voice.state === 'transcribing'
        ? voice.state
        : voice.state === 'error'
          ? 'error'
      : controller.semanticState;
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
        isRunning={controller.isRunning}
        pendingConfirmation={controller.pendingConfirmation}
        composerValue={composerValue}
        onComposerChange={setComposerValue}
        onSubmit={submit}
        onClose={closeAssistant}
        onExpand={() => setSurface((current) => (current === 'full' ? 'medium' : 'full'))}
        onConfirm={controller.confirm}
        onCancelConfirmation={controller.cancelConfirmation}
        reduceMotion={reduceMotion}
        voiceState={voice.state}
        voiceLocked={voice.locked}
        voiceError={voice.error}
        onVoiceStop={voice.stopAndSend}
        onVoiceCancel={voice.cancel}
        onVoiceMic={() => { Keyboard.dismiss(); voice.begin(); }}
      />
      <AppBottomNavigation
        orbState={orbState}
        assistantExpanded={surface !== 'closed' && surface !== 'closing'}
        onOrbPress={openAssistant}
        onOrbPressIn={onOrbPressIn}
        onOrbPressOut={onOrbPressOut}
        onOrbPressMove={onOrbPressMove}
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
