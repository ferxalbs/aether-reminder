import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBar, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { LayoutTokens, Radius, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { Typography } from "@/components/ui/Typography";
import { TaskList } from "@/components/ui/TaskList";
import { TaskEditorSheet } from "@/components/ui/TaskEditorSheet";
import { TaskUndoBanner } from "@/components/ui/TaskUndoBanner";
import { RecoverySheet } from "@/components/ui/RecoverySurface";
import { AttentionSurface } from "@/components/ui/AttentionSurface";
import { AetherComposer } from "@/components/ui/AetherComposer";
import { useTasksUiStore } from "@/stores/tasksUi.store";
import { getLocalDateString } from "@/temporal/localCalendar";
import {
  useAssistantActions,
  useAssistantSurface,
  useAssistantActive,
} from "@/components/assistant/AssistantHost";
import { getDatabaseErrorMessage } from "@/db";
import { useBottomChromeGeometry } from "@/theme/useBottomChromeGeometry";
import { reportNonFatalError } from "@/lib/nonFatalError";
import { useMotionPreset } from "@/motion";
import { canUndoTaskReceipt } from "@/stores/taskUndo";
import type { TaskListItem } from "@/domain/entities";

export default function TodayScreen() {
  const theme = useAetherTheme();
  const { colors } = theme;
  const reduceMotion = useReducedMotion();
  const enterPreset = useMotionPreset("navigation.push");
  const titleEntering =
    reduceMotion || enterPreset.mode === "none"
      ? undefined
      : FadeInDown.duration(enterPreset.durationMs)
          .springify()
          .damping(enterPreset.damping)
          .stiffness(enterPreset.stiffness);
  const fadeEntering =
    reduceMotion || enterPreset.mode === "none"
      ? undefined
      : FadeIn.duration(Math.min(enterPreset.durationMs, 180)).delay(80);
  const { width } = useWindowDimensions();
  const horizontalPadding =
    width >= 980
      ? LayoutTokens.screenHorizontalWide
      : LayoutTokens.screenHorizontal;
  const { startVoiceAssistant } = useAssistantActions();
  const geometry = useBottomChromeGeometry();
  const assistantActive = useAssistantActive();
  const router = useRouter();

  const [quickTitle, setQuickTitle] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);
  const [recoveryVisible, setRecoveryVisible] = useState(false);

  const todayTasks = useTasksUiStore((s) => s.todayTasks);
  const status = useTasksUiStore((s) => s.status);
  const error = useTasksUiStore((s) => s.error);
  const attentionPlan = useTasksUiStore((s) => s.attentionPlan);
  const attentionError = useTasksUiStore((s) => s.attentionError);
  const refreshToday = useTasksUiStore((s) => s.refreshToday);
  const refreshRecovery = useTasksUiStore((s) => s.refreshRecovery);
  const recoveryPlan = useTasksUiStore((s) => s.recoveryPlan);
  const applyRecovery = useTasksUiStore((s) => s.applyRecovery);
  const captureText = useTasksUiStore((s) => s.captureText);
  const toggleTask = useTasksUiStore((s) => s.toggleTask);
  const focusNow = useTasksUiStore((s) => s.focusNow);
  const clearFocus = useTasksUiStore((s) => s.clearFocus);
  const rejectAttention = useTasksUiStore((s) => s.rejectAttention);
  const softDeleteTask = useTasksUiStore((s) => s.softDeleteTask);
  const undoReceipt = useTasksUiStore((s) => s.undoReceipt);
  const undoError = useTasksUiStore((s) => s.undoError);
  const undoing = useTasksUiStore((s) => s.undoing);
  const undoLastMutation = useTasksUiStore((s) => s.undoLastMutation);
  const dismissUndo = useTasksUiStore((s) => s.dismissUndo);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([refreshToday(), refreshRecovery()]);
    }, [refreshRecovery, refreshToday]),
  );

  useEffect(() => {
    if (!attentionPlan?.nextRefreshAt) return undefined;
    const delay = Math.max(
      250,
      new Date(attentionPlan.nextRefreshAt).getTime() - Date.now(),
    );
    const timer = setTimeout(
      () => {
        void useTasksUiStore.getState().refreshAttention();
      },
      Math.min(delay, 24 * 60 * 60 * 1000),
    );
    return () => clearTimeout(timer);
  }, [attentionPlan?.nextRefreshAt]);

  const secondaryTodayTasks = useMemo(() => {
    const surfacedIds = new Set([
      attentionPlan?.now?.taskId,
      ...(attentionPlan?.next ?? []).map((item) => item.taskId),
      ...(attentionPlan?.choices ?? []).map((item) => item.taskId),
      ...(recoveryPlan?.proposals ?? []).map((proposal) => proposal.taskId),
    ]);
    return todayTasks.filter((task) => !surfacedIds.has(task.id));
  }, [attentionPlan, recoveryPlan, todayTasks]);

  const assistantContext = useMemo(
    () => ({
      surface: "home",
      selectedDate: getLocalDateString(),
      visibleTaskIds: todayTasks.map((task) => task.id),
      locale: Intl.DateTimeFormat().resolvedOptions().locale || "en-US",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      invocationSource: "app" as const,
    }),
    [todayTasks],
  );
  useAssistantSurface(assistantContext);

  const handleQuickCapture = useCallback(
    async (titleToSave?: string) => {
      const rawTitle = (titleToSave ?? quickTitle).trim();
      if (!rawTitle || quickSaving) return;

      setQuickSaving(true);
      setQuickError(null);
      try {
        await captureText(rawTitle);
        setQuickTitle("");
      } catch (errorValue) {
        setQuickError(getDatabaseErrorMessage(errorValue));
      } finally {
        setQuickSaving(false);
      }
    },
    [captureText, quickSaving, quickTitle],
  );

  const handleToggle = useCallback(
    (id: string) => {
      void toggleTask(id).catch((errorValue: unknown) => {
        reportNonFatalError("home-task-toggle", errorValue);
      });
    },
    [toggleTask],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void softDeleteTask(id).catch((errorValue: unknown) => {
        reportNonFatalError("home-task-delete", errorValue);
      });
    },
    [softDeleteTask],
  );

  const handleAttentionFocus = useCallback(
    (taskId: string) => {
      void focusNow(taskId).catch((errorValue: unknown) => {
        reportNonFatalError("home-attention-focus", errorValue);
      });
    },
    [focusNow],
  );

  const handleAttentionNotNow = useCallback(
    (taskId: string) => {
      void rejectAttention(taskId).catch((errorValue: unknown) => {
        reportNonFatalError("home-attention-not-now", errorValue);
      });
    },
    [rejectAttention],
  );

  const openEditor = useCallback((task?: TaskListItem) => {
    setEditingTask(task ?? null);
    setEditorVisible(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorVisible(false);
    setEditingTask(null);
  }, []);

  const openRecovery = useCallback(async () => {
    await refreshRecovery();
    if (useTasksUiStore.getState().recoveryPlan) setRecoveryVisible(true);
  }, [refreshRecovery]);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background,
        },
      ]}
    >
      <StatusBar
        barStyle={theme.mode === "dark" ? "light-content" : "dark-content"}
      />
      {undoReceipt && canUndoTaskReceipt(undoReceipt) ? (
        <TaskUndoBanner
          receipt={undoReceipt}
          error={undoError}
          undoing={undoing}
          onUndo={() => void undoLastMutation()}
          onDismiss={dismissUndo}
        />
      ) : null}

      <View style={styles.flex}>
        <TaskList
          style={styles.flex}
          tasks={secondaryTodayTasks}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onPress={openEditor}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: horizontalPadding,
              maxWidth: LayoutTokens.contentMaxWidth,
              paddingBottom: geometry.contentBottomInset,
            },
          ]}
          header={
            <View style={styles.headerContent}>
              <Animated.View entering={titleEntering} style={styles.titleBlock}>
                <Typography variant="display">Today</Typography>
              </Animated.View>

              <AttentionSurface
                plan={attentionPlan}
                onComplete={handleToggle}
                onFocus={handleAttentionFocus}
                onClearFocus={() => void clearFocus()}
                onNotNow={handleAttentionNotNow}
                onReviewRecovery={() => void openRecovery()}
                onSwitchFocus={handleAttentionFocus}
                onOpenSettings={() => router.push("/settings")}
              />

              {error || quickError || attentionError ? (
                <View
                  style={[
                    styles.errorToast,
                    {
                      backgroundColor: colors.surfaceRaised,
                    },
                  ]}
                >
                  <Typography
                    variant="caption"
                    color={colors.textPrimary}
                    accessibilityRole="alert"
                  >
                    {error || quickError || attentionError}
                  </Typography>
                </View>
              ) : null}
            </View>
          }
          empty={
            status === "ready" && !attentionPlan ? (
              <Animated.View entering={fadeEntering} style={styles.emptyState}>
                <Typography variant="body" color={colors.textSecondary}>
                  Your day is clear.
                </Typography>
              </Animated.View>
            ) : null
          }
        />

        {!assistantActive && (
          <Animated.View
            style={[
              styles.composerWrap,
              {
                paddingHorizontal: horizontalPadding,
                bottom: geometry.composerBottom,
              },
            ]}
            entering={titleEntering}
          >
            <AetherComposer
              value={quickTitle}
              onChangeText={(val) => {
                setQuickTitle(val);
                if (quickError) setQuickError(null);
              }}
              onSubmit={(text) => void handleQuickCapture(text)}
              onVoicePress={startVoiceAssistant}
              onAddDate={() => openEditor()}
              onSetPriority={() => openEditor()}
              onAddLocation={() => openEditor()}
              onAttachFile={() => openEditor()}
            />
          </Animated.View>
        )}
      </View>

      <TaskEditorSheet
        visible={editorVisible}
        onClose={closeEditor}
        mode={editingTask ? "edit" : "create"}
        task={editingTask}
      />
      {recoveryPlan ? (
        <RecoverySheet
          key={recoveryPlan.id}
          visible={recoveryVisible}
          plan={recoveryPlan}
          onClose={() => setRecoveryVisible(false)}
          onApply={applyRecovery}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    width: "100%",
    alignSelf: "center",
    paddingTop: Spacing.md,
  },
  headerContent: {
    width: "100%",
  },
  titleBlock: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  errorToast: {
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    alignSelf: "flex-start",
  },
  emptyState: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  composerWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 90,
  },
});
