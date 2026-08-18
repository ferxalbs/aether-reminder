import { useCallback, useMemo, useState } from "react";
import {
  Platform,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, Settings } from "lucide-react-native";
import { LayoutTokens, Motion, Radius, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";
import {
  AnimatedPressable,
  getMinimumTouchTargetHitSlop,
} from "@/components/ui/AnimatedPressable";
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

type TaskFilter = "all" | "active" | "completed";

export default function RemindersScreen() {
  const theme = useAetherTheme();
  const { colors } = theme;
  const fieldTokens = theme.components.field;
  const { width } = useWindowDimensions();
  const horizontalPadding =
    width >= 980
      ? LayoutTokens.screenHorizontalWide
      : LayoutTokens.screenHorizontal;
  const router = useRouter();
  const [filter] = useState<TaskFilter>("all");
  const [query, setQuery] = useState("");
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const { startVoiceAssistant } = useAssistantActions();
  const geometry = useBottomChromeGeometry();
  const assistantActive = useAssistantActive();

  const allTasks = useTasksUiStore((state) => state.allTasks);
  const status = useTasksUiStore((state) => state.status);
  const error = useTasksUiStore((state) => state.error);
  const refreshAll = useTasksUiStore((state) => state.refreshAll);
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
        await captureText(rawTitle);
        setQuickTitle("");
      } catch (errorValue) {
        reportNonFatalError(
          "reminders-quick-capture",
          getDatabaseErrorMessage(errorValue),
        );
      } finally {
        setQuickSaving(false);
      }
    },
    [captureText, quickSaving, quickTitle],
  );

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return allTasks.filter((task) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "active" ? !task.completed : task.completed);
      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;
      return `${task.title} ${task.notes ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [allTasks, filter, query]);

  const assistantContext = useMemo(
    () => ({
      surface: "all",
      selectedDate: getLocalDateString(),
      visibleTaskIds: visibleTasks.map((task) => task.id),
      locale: Intl.DateTimeFormat().resolvedOptions().locale || "en-US",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      invocationSource: "app" as const,
    }),
    [visibleTasks],
  );
  useAssistantSurface(assistantContext);

  useFocusEffect(
    useCallback(() => {
      void refreshAll();
    }, [refreshAll]),
  );

  const handleToggle = useCallback(
    (id: string) => {
      void toggleTask(id).catch((errorValue: unknown) => {
        reportNonFatalError("all-task-toggle", errorValue);
      });
    },
    [toggleTask],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void softDeleteTask(id).catch((errorValue: unknown) => {
        reportNonFatalError("all-task-delete", errorValue);
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
          tasks={visibleTasks}
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
                  <Typography variant="display">Reminders</Typography>
                </View>
                <AnimatedPressable
                  onPress={() => router.push("/settings")}
                  accessibilityRole="button"
                  accessibilityLabel="Settings"
                  accessibilityHint="Open app settings and preferences"
                  android_ripple={{ color: colors.ripple, foreground: true }}
                  interactionRadius={theme.shape.pill}
                  scaleTo={Motion.iconPressScale}
                  hitSlop={getMinimumTouchTargetHitSlop(40, 40, Platform.OS)}
                  style={[styles.headerAction, { borderRadius: theme.shape.pill }]}
                >
                  <Settings size={20} color={colors.textSecondary} strokeWidth={2} />
                </AnimatedPressable>
              </View>

              {allTasks.length > 0 ? (
                <View
                  style={[
                    styles.searchField,
                    {
                      borderColor: fieldTokens.border,
                      backgroundColor: fieldTokens.background,
                    },
                  ]}
                >
                  <Search
                    size={17}
                    color={colors.textSecondary}
                    strokeWidth={2}
                  />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search reminders…"
                    placeholderTextColor={fieldTokens.placeholder}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                    accessibilityLabel="Search all reminders"
                    style={[styles.searchInput, { color: fieldTokens.text }]}
                  />
                </View>
              ) : null}

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
                  {query.trim()
                    ? "No reminders found."
                    : "Your library is empty."}
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
  headerAction: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  searchField: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    height: 42,
    fontSize: 15,
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
