import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, Plus } from 'lucide-react-native';
import type { MenuAction } from '@expo/ui/community/menu';
import { Colors, LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { TaskList } from '@/components/ui/TaskList';
import { TaskUndoBanner } from '@/components/ui/TaskUndoBanner';
import { Button } from '@/components/ui/Button';
import { TaskEditorSheet } from '@/components/ui/TaskEditorSheet';
import type { TaskListItem } from '@/domain/entities';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { getLocalDateString } from '@/temporal/localCalendar';
import { useAssistantActions, useAssistantSurface } from '@/components/assistant/AssistantHost';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { canUndoTaskReceipt } from '@/stores/taskUndo';
import { ContextualTopBar } from '@/components/navigation/ContextualTopBar';

const upcomingActions: MenuAction[] = [
  { id: 'create', title: 'New reminder', image: 'square.and.pencil' },
  { id: 'voice', title: 'Speak a reminder', image: 'waveform' },
  { id: 'refresh', title: 'Refresh upcoming', image: 'arrow.clockwise' },
];

export default function TasksScreen() {
  const isDark = useIsDark();
  const { width } = useWindowDimensions();
  const horizontalPadding =
    width >= 980 ? LayoutTokens.screenHorizontalWide : LayoutTokens.screenHorizontal;
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);
  const { startVoiceAssistant } = useAssistantActions();

  const upcomingTasks = useTasksUiStore((state) => state.upcomingTasks);
  const status = useTasksUiStore((state) => state.status);
  const error = useTasksUiStore((state) => state.error);
  const refreshUpcoming = useTasksUiStore((state) => state.refreshUpcoming);
  const toggleTask = useTasksUiStore((state) => state.toggleTask);
  const softDeleteTask = useTasksUiStore((state) => state.softDeleteTask);
  const undoReceipt = useTasksUiStore((state) => state.undoReceipt);
  const undoError = useTasksUiStore((state) => state.undoError);
  const undoing = useTasksUiStore((state) => state.undoing);
  const undoLastMutation = useTasksUiStore((state) => state.undoLastMutation);
  const dismissUndo = useTasksUiStore((state) => state.dismissUndo);

  const handleToggle = useCallback(
    (id: string) => {
      void toggleTask(id).catch((errorValue: unknown) => {
        reportNonFatalError('tasks-task-toggle', errorValue);
      });
    },
    [toggleTask],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void softDeleteTask(id).catch((errorValue: unknown) => {
        reportNonFatalError('tasks-task-delete', errorValue);
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

  const handleContextAction = useCallback(
    (actionId: string) => {
      if (actionId === 'create') openEditor();
      if (actionId === 'voice') startVoiceAssistant();
      if (actionId === 'refresh') void refreshUpcoming();
    },
    [openEditor, refreshUpcoming, startVoiceAssistant],
  );

  const assistantContext = useMemo(
    () => ({
      surface: 'upcoming',
      selectedDate: getLocalDateString(),
      visibleTaskIds: upcomingTasks.map((task) => task.id),
      locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      invocationSource: 'app' as const,
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
      edges={['top', 'left', 'right']}
      style={[
        styles.safeArea,
        { backgroundColor: isDark ? Colors.backgroundDark : Colors.backgroundLight },
      ]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {undoReceipt && canUndoTaskReceipt(undoReceipt) ? (
        <TaskUndoBanner
          receipt={undoReceipt}
          error={undoError}
          undoing={undoing}
          onUndo={() => void undoLastMutation()}
          onDismiss={dismissUndo}
        />
      ) : null}
      <ContextualTopBar actions={upcomingActions} onAction={handleContextAction} />
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
          },
        ]}
        header={
          <View style={styles.headerContent}>
            <View style={styles.header}>
              <Typography variant="display">Upcoming</Typography>
              <Typography
                variant="body"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                style={styles.subtitle}
              >
                Active reminders scheduled after today.
              </Typography>
            </View>

            {error ? (
              <Typography
                variant="caption"
                color={isDark ? Colors.white : Colors.black}
                style={styles.error}
              >
                {error}
              </Typography>
            ) : null}
          </View>
        }
        empty={
          status !== 'loading' ? (
            <View style={styles.emptyState}>
              <View
                style={[
                  styles.emptyIcon,
                  {
                    backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight,
                    borderColor: isDark ? Colors.borderDark : Colors.borderLight,
                  },
                ]}
              >
                <CalendarDays size={26} color={isDark ? Colors.white : Colors.black} />
              </View>
              <Typography variant="headline" align="center">
                Nothing scheduled ahead.
              </Typography>
              <Typography
                variant="body"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                align="center"
                style={styles.emptyCopy}
              >
                Add a reminder when you know what comes next.
              </Typography>
              <Button
                label="Create a reminder"
                onPress={() => openEditor()}
                icon={
                  <Plus
                    size={17}
                    color={isDark ? Colors.black : Colors.white}
                    strokeWidth={2.5}
                  />
                }
              />
            </View>
          ) : null
        }
      />
      <TaskEditorSheet
        visible={editorVisible}
        onClose={closeEditor}
        mode={editingTask ? 'edit' : 'create'}
        task={editingTask}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  headerContent: {
    width: '100%',
  },
  header: {
    maxWidth: LayoutTokens.readingMaxWidth,
    marginBottom: Spacing.xxl,
  },
  subtitle: {
    marginTop: Spacing.xs,
  },
  error: {
    marginBottom: Spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.huge,
    paddingBottom: Spacing.xl,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.xl,
    marginBottom: Spacing.md,
  },
  emptyCopy: {
    maxWidth: 420,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
});
