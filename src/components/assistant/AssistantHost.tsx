import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTasksUiStore } from "@/stores/tasksUi.store";
import { useSettingsStore } from "@/stores/settings.store";
import { useAetherTheme } from "@/theme/useAetherTheme";
import type { ContextSnapshot } from "@/services/agent";
import { getVoiceErrorTitle } from "@/services/transcription";
import type { ActionReceipt } from "@/domain/receipts";
import { getLocalDateString } from "@/temporal/localCalendar";
import { useAgentSessionController } from "./AgentSessionController";
import { AssistantSheet } from "./AssistantSheet";
import type { AssistantSurfaceState } from "./assistantTypes";
import { isVoiceFailureState, useVoiceController } from "./VoiceController";
import { impactAsync, notificationAsync } from "@/lib/haptics";
import { reportNonFatalError } from "@/lib/nonFatalError";

interface AssistantHostProps {
  blurTarget?: RefObject<View | null>;
}

interface AssistantActionHandlers {
  openTextAssistant: () => void;
  startVoiceAssistant: () => void;
}

const defaultSnapshot: ContextSnapshot = {
  surface: "home",
  selectedDate: getLocalDateString(),
  locale: Intl.DateTimeFormat().resolvedOptions().locale || "en-US",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  invocationSource: "app",
  visibleTaskIds: [],
};

interface AssistantSnapshotContextValue {
  snapshot: ContextSnapshot;
  setSnapshot: (snapshot: ContextSnapshot) => void;
}

interface AssistantControlContextValue {
  requestAssistant: (mode: keyof AssistantActionHandlers) => void;
  registerAssistantActions: (actions: AssistantActionHandlers | null) => void;
  assistantActive: boolean;
  setAssistantActive: (active: boolean) => void;
}

const AssistantSnapshotContext =
  createContext<AssistantSnapshotContextValue | null>(null);
const AssistantControlContext =
  createContext<AssistantControlContextValue | null>(null);

const defaultAssistantControls: AssistantControlContextValue = {
  requestAssistant: () => undefined,
  registerAssistantActions: () => undefined,
  assistantActive: false,
  setAssistantActive: () => undefined,
};

export const AssistantSurfaceProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [snapshot, setSnapshot] = useState<ContextSnapshot>(defaultSnapshot);
  const actionsRef = useRef<AssistantActionHandlers | null>(null);
  const requestAssistant = useCallback(
    (mode: keyof AssistantActionHandlers) => {
      actionsRef.current?.[mode]();
    },
    [],
  );
  const [assistantActive, setAssistantActive] = useState(false);
  const registerAssistantActions = useCallback(
    (actions: AssistantActionHandlers | null) => {
      actionsRef.current = actions;
    },
    [],
  );
  const snapshotValue = useMemo(
    () => ({ snapshot, setSnapshot }),
    [setSnapshot, snapshot],
  );
  const controlValue = useMemo(
    () => ({
      requestAssistant,
      registerAssistantActions,
      assistantActive,
      setAssistantActive,
    }),
    [
      assistantActive,
      registerAssistantActions,
      requestAssistant,
      setAssistantActive,
    ],
  );
  return (
    <AssistantSnapshotContext.Provider value={snapshotValue}>
      <AssistantControlContext.Provider value={controlValue}>
        {children}
      </AssistantControlContext.Provider>
    </AssistantSnapshotContext.Provider>
  );
};

export function useAssistantSurface(snapshot: ContextSnapshot): void {
  const context = useContext(AssistantSnapshotContext);
  if (!context)
    throw new Error(
      "useAssistantSurface must be used inside AssistantSurfaceProvider",
    );
  const setSnapshot = context.setSnapshot;
  useFocusEffect(
    useCallback(() => {
      setSnapshot(snapshot);
    }, [setSnapshot, snapshot]),
  );
}

export function useAssistantActive(): boolean {
  const context = useContext(AssistantControlContext);
  return context?.assistantActive ?? false;
}

export function useAssistantActions(): {
  openTextAssistant: () => void;
  startVoiceAssistant: () => void;
} {
  const context = useContext(AssistantControlContext);
  if (!context)
    throw new Error(
      "useAssistantActions must be used inside AssistantSurfaceProvider",
    );
  return useMemo(
    () => ({
      openTextAssistant: () => context.requestAssistant("openTextAssistant"),
      startVoiceAssistant: () =>
        context.requestAssistant("startVoiceAssistant"),
    }),
    [context],
  );
}

export const AssistantHost = React.memo(function AssistantHost({
  blurTarget,
}: AssistantHostProps) {
  const router = useRouter();
  const { colors } = useAetherTheme();
  const snapshot =
    useContext(AssistantSnapshotContext)?.snapshot ?? defaultSnapshot;
  const { registerAssistantActions, setAssistantActive } =
    useContext(AssistantControlContext) ?? defaultAssistantControls;
  const [surface, setSurface] = useState<AssistantSurfaceState>("closed");
  const [composerValue, setComposerValue] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshAllSurfaces = useTasksUiStore(
    (state) => state.refreshAllSurfaces,
  );
  const refreshRecovery = useTasksUiStore((state) => state.refreshRecovery);
  const setUndoReceipt = useTasksUiStore((state) => state.setUndoReceipt);
  const captureText = useTasksUiStore((state) => state.captureText);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch((error: unknown) => {
        reportNonFatalError("assistant-reduce-motion", error);
      });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(
    () => () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    },
    [],
  );

  const updateKeyboardOffset = useCallback(
    (event: { endCoordinates: { height: number } }) => {
      setKeyboardOffset(Math.max(0, event.endCoordinates.height));
    },
    [],
  );

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(
      showEvent,
      updateKeyboardOffset,
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () =>
      setKeyboardOffset(0),
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [updateKeyboardOffset]);

  const onNavigate = useCallback(
    (destination: string) => {
      const routeByDestination: Record<
        string,
        "/" | "/tasks" | "/all" | "/settings"
      > = {
        home: "/",
        tasks: "/tasks",
        all: "/all",
        settings: "/settings",
      };
      const destinationPath = routeByDestination[destination];
      if (destinationPath) router.replace(destinationPath as never);
    },
    [router],
  );

  const onMutation = useCallback(
    (toolId: string) => {
      const taskSurfaceMutations = [
        "tasks.create",
        "tasks.create_recurring",
        "tasks.update",
        "tasks.complete",
        "tasks.reopen",
        "tasks.delete",
      ];
      if (!taskSurfaceMutations.includes(toolId)) return;
      void Promise.all([refreshAllSurfaces(), refreshRecovery()]).catch(
        (error: unknown) => {
          reportNonFatalError("assistant-refresh-task-surfaces", error);
        },
      );
    },
    [refreshAllSurfaces, refreshRecovery],
  );

  const onReceipt = useCallback(
    (receipt: ActionReceipt) => {
      setUndoReceipt(receipt);
      // Keep feedback tied to a real completed receipt; no animation-only success state.
      if (
        receipt.risk !== "READ" &&
        useSettingsStore.getState().hapticsEnabled
      ) {
        notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          (error: unknown) => {
            reportNonFatalError("haptics", error);
          },
        );
      }
    },
    [setUndoReceipt],
  );

  const controller = useAgentSessionController({
    context: snapshot,
    onNavigate,
    onMutation,
    onReceipt,
  });

  const onVoiceTranscript = useCallback(
    async (text: string) => {
      setComposerValue("");
      await captureText(text, "voice");
      setSurface("closed");
    },
    [captureText],
  );
  const voice = useVoiceController({ onTranscript: onVoiceTranscript });

  const openTextAssistant = useCallback(() => {
    if (
      !["idle", "review", "committed"].includes(voice.state) &&
      !isVoiceFailureState(voice.state)
    )
      void voice.cancel();
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    setSurface("compact");
  }, [voice]);

  const startVoiceAssistant = useCallback(() => {
    if (
      !["idle", "review", "committed"].includes(voice.state) &&
      !isVoiceFailureState(voice.state)
    )
      return;
    if (useSettingsStore.getState().hapticsEnabled) {
      impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error: unknown) => {
        reportNonFatalError("haptics", error);
      });
    }
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    Keyboard.dismiss();
    setSurface("compact");
    voice.beginLocked();
  }, [voice]);

  useEffect(() => {
    registerAssistantActions({ openTextAssistant, startVoiceAssistant });
    return () => registerAssistantActions(null);
  }, [openTextAssistant, registerAssistantActions, startVoiceAssistant]);

  const closeAssistant = useCallback(() => {
    if (voice.state !== "idle") void voice.cancel();
    Keyboard.dismiss();
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    setSurface("closing");
    transitionTimerRef.current = setTimeout(
      () => setSurface("closed"),
      reduceMotion ? 100 : 220,
    );
  }, [reduceMotion, voice]);

  useEffect(() => {
    if (Platform.OS !== "android" || surface === "closed") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (surface !== "closing") closeAssistant();
        return true;
      },
    );
    return () => subscription.remove();
  }, [closeAssistant, surface]);

  const openMicrophoneSettings = useCallback(() => {
    closeAssistant();
    void Linking.openSettings().catch((error: unknown) => {
      reportNonFatalError("open-microphone-settings", error);
    });
  }, [closeAssistant]);

  const openVoiceConfiguration = useCallback(() => {
    closeAssistant();
    router.replace("/settings" as never);
  }, [closeAssistant, router]);

  const submit = useCallback(() => {
    const value = composerValue.trim();
    if (!value) return;
    setComposerValue("");
    setSurface("medium");
    void controller.submit(value).catch((error: unknown) => {
      reportNonFatalError("assistant-submit", error);
    });
  }, [composerValue, controller]);

  useEffect(() => {
    setAssistantActive(surface !== "closed" && surface !== "closing");
  }, [surface, setAssistantActive]);

  const showScrim = surface !== "closed" && surface !== "closing";

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {showScrim ? (
        <Pressable
          onPress={closeAssistant}
          accessibilityLabel="Dismiss assistant surface"
          style={[styles.scrim, { backgroundColor: colors.scrim }]}
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
        onExpand={() =>
          setSurface((current) => (current === "full" ? "medium" : "full"))
        }
        onConfirm={controller.confirm}
        onCancelConfirmation={controller.cancelConfirmation}
        onRetry={controller.retry}
        reduceMotion={reduceMotion}
        voiceState={voice.state}
        voiceLocked={voice.locked}
        voiceError={voice.error}
        voiceErrorTitle={getVoiceErrorTitle(voice.errorCode)}
        voiceNeedsSystemSettings={voice.errorCode === "MIC_PERMISSION_BLOCKED"}
        voiceNeedsAppSettings={
          voice.errorCode === "REALTIME_AUTH_FAILED" ||
          voice.errorCode === "INVALID_CREDENTIAL" ||
          voice.errorCode === "ACCOUNT_NOT_AUTHORIZED" ||
          voice.errorCode === "TIER_NOT_SUPPORTED"
        }
        voiceCanRetry={voice.canRetry}
        voiceRetryAttempt={voice.retryAttempt}
        voiceTranscript={voice.transcript}
        voiceAudioLevel={voice.audioLevel}
        onVoiceStop={voice.stopAndSend}
        onVoiceCancel={voice.cancel}
        onVoiceRetry={voice.retry}
        onVoiceDismiss={voice.cancel}
        onVoiceOpenAppSettings={openVoiceConfiguration}
        onVoiceOpenSettings={openMicrophoneSettings}
        keyboardOffset={keyboardOffset}
        blurTarget={blurTarget}
        onVoicePress={startVoiceAssistant}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
  },
});
