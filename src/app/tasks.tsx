import { useCallback, useMemo, useState } from "react";
import {
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Settings } from "lucide-react-native";
import { LayoutTokens, Radius, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { AetherToolbarButton } from "@/components/ui/AetherToolbarButton";
import { Typography } from "@/components/ui/Typography";
import { TaskList } from "@/components/ui/TaskList";
import { TaskUndoBanner } from "@/components/ui/TaskUndoBanner";
import { TaskEditorSheet } from "@/components/ui/TaskEditorSheet";
import { AetherComposer } from "@/components/ui/AetherComposer";
import type { TaskListItem } from "@/domain/entities";
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
import { canUndoTaskReceipt } from "@/stores/taskUndo";

import { addLocalCalendarDays } from "@/temporal/recurrence";

export default function ScheduleScreen() {
  const theme = useAetherTheme();
  const { colors } = theme;
  const { width } = useWindowDimensions();
  const horizontalPadding =
    width >= 980
      ? LayoutTokens.screenHorizontalWide
      : LayoutTokens.screenHorizontal;
  const router = useRouter();
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const { startVoiceAssistant } = useAssistantActions();
  const geometry = useBottomChromeGeometry();
  const assistantActive = useAssistantActive();

  const upcomingTasks = useTasksUiStore((state) => state.upcomingTasks);
  const status = useTasksUiStore((state) => state.status);
  const error = useTasksUiStore((state) => state.error);
  const refreshUpcoming = useTasksUiStore((state) => state.refreshUpcoming);
  const captureText = useTasksUiStore((state) => state.captureText);
  const toggleTask = useTasksUiStore((state) => state.toggleTask);
  const softDeleteTask = useTasksUiStore((state) => state.softDeleteTask);
  const undoReceipt = useTasksUiStore((state) => state.undoReceipt);
  const undoError = useTasksUiStore((state) => state.undoError);
  const undoing = useTasksUiStore((state) => state.undoing);
  const undoLastMutation = useTasksUiStore((state) => state.undoLastMutation);
  const dismissUndo = useTasksUiStore((state) => state.dismissUndo);

  const handleQuickCapture = useCallback(
    async (titleToSave?: string) => {
      const rawTitle = (titleToSave ?? quickTitle).trim();
      if (!rawTitle || quickSaving) return;

      setQuickSaving(true);
      try {
        await captureText(rawTitle, "in_app", {
          defaultDueDate: addLocalCalendarDays(getLocalDateString(), 1),
        });
        setQuickTitle("");
      } catch (errorValue) {
        reportNonFatalError(
          "schedule-quick-capture",
          getDatabaseErrorMessage(errorValue),
        );
      } finally {
        setQuickSaving(false);
      }
    },
    [captureText, quickSaving, quickTitle],
  );

  const handleToggle = useCallback(
    (id: string) => {
      void toggleTask(id).catch((errorValue: unknown) => {
        reportNonFatalError("tasks-task-toggle", errorValue);
      });
    },
    [toggleTask],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void softDeleteTask(id).catch((errorValue: unknown) => {
        reportNonFatalError("tasks-task-delete", errorValue);
      });
    },
    [softDeleteTask],
  );

  const openEditor = useCallback((task?: TaskListItem) => {
    setEditingTask(task ?? null);
    setEditorVisible(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorVisible(false);
    setEditingTask(null);
  }, []);

  const assistantContext = useMemo(
    () => ({
      surface: "upcoming",
      selectedDate: getLocalDateString(),
      visibleTaskIds: upcomingTasks.map((task) => task.id),
      locale: Intl.DateTimeFormat().resolvedOptions().locale || "en-US",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      invocationSource: "app" as const,
    }),
    [upcomingTasks],
  );
  useAssistantSurface(assistantContext);

  useFocusEffect(
    useCallback(() => {
      void refreshUpcoming();
    }, [refreshUpcoming]),
  );

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
          tasks={upcomingTasks}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onPress={openEditor}
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: horizontalPadding,
              maxWidth: LayoutTokens.contentMaxWidth,
              paddingBottom: geometry.contentBottomInset,
            },
          ]}
          header={
            <View style={styles.headerContent}>
              <View style={styles.headerRow}>
                <View style={styles.header}>
                  <Typography variant="display">Schedule</Typography>
                </View>
                <AetherToolbarButton
                  icon={Settings}
                  onPress={() => router.push("/settings")}
                  accessibilityLabel="Settings"
                  accessibilityHint="Open app settings and preferences"
                  tone="secondary"
                />
              </View>

              {error ? (
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
                    {error}
                  </Typography>
                </View>
              ) : null}
            </View>
          }
          empty={
            status !== "loading" ? (
              <View style={styles.emptyState}>
                <Typography variant="body" color={colors.textSecondary}>
                  Nothing scheduled ahead.
                </Typography>
              </View>
            ) : null
          }
        />

        {!assistantActive && (
          <View
            style={[
              styles.composerWrap,
              {
                paddingHorizontal: horizontalPadding,
                bottom: geometry.composerBottom,
              },
            ]}
          >
            <AetherComposer
              value={quickTitle}
              onChangeText={setQuickTitle}
              onSubmit={(text) => void handleQuickCapture(text)}
              onVoicePress={startVoiceAssistant}
              onAddDate={() => openEditor()}
              onSetPriority={() => openEditor()}
              onAddLocation={() => openEditor()}
              onAttachFile={() => openEditor()}
            />
          </View>
        )}
      </View>

      <TaskEditorSheet
        visible={editorVisible}
        onClose={closeEditor}
        mode={editingTask ? "edit" : "create"}
        task={editingTask}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    width: "100%",
    alignSelf: "center",
    paddingTop: Spacing.lg,
  },
  headerContent: {
    width: "100%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  header: {
    flex: 1,
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
