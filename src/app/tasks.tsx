import React, { useCallback, useMemo } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { TaskList } from '@/components/ui/TaskList';
import { TaskUndoBanner } from '@/components/ui/TaskUndoBanner';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { getLocalDateString } from '@/temporal/localCalendar';
import { useAssistantSurface } from '@/components/assistant/AssistantHost';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { canUndoTaskReceipt } from '@/stores/taskUndo';

export default function TasksScreen() {
  const isDark = useIsDark();
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

  const handleToggle = useCallback((id: string) => {
    void toggleTask(id).catch((error: unknown) => {
      reportNonFatalError('tasks-task-toggle', error);
    });
  }, [toggleTask]);

  const handleDelete = useCallback((id: string) => {
    void softDeleteTask(id).catch((error: unknown) => {
      reportNonFatalError('tasks-task-delete', error);
    });
  }, [softDeleteTask]);

  const assistantContext = useMemo(
    () => ({
      surface: 'upcoming',
      selectedDate: getLocalDateString(),
      visibleTaskIds: upcomingTasks.map((task) => task.id),
      locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      invocationSource: 'app' as const,
    }),
    [upcomingTasks]
  );
  useAssistantSurface(assistantContext);

  useFocusEffect(
    useCallback(() => {
      void refreshUpcoming();
    }, [refreshUpcoming])
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? Colors.black : Colors.zinc50 }]}>
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
      <TaskList
        tasks={upcomingTasks}
        onToggle={handleToggle}
        onDelete={handleDelete}
        contentContainerStyle={styles.content}
        header={
          <>
            <View style={styles.header}>
              <Typography variant="caption" color={Colors.zinc500}>UPCOMING</Typography>
              <Typography variant="display">Tasks</Typography>
              <Typography variant="body" color={Colors.zinc500} style={styles.subtitle}>
                Keep the next few steps in view.
              </Typography>
            </View>
            {error ? <Typography variant="caption" color={Colors.zinc500} style={styles.error}>{error}</Typography> : null}
          </>
        }
        empty={status !== 'loading' ? (
          <View style={styles.emptyState}>
            <Typography variant="headline" align="center">Nothing scheduled.</Typography>
            <Typography variant="body" color={Colors.zinc500} align="center" style={styles.emptyCopy}>
              Add a task or ask AETHER to plan the next step.
            </Typography>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 124 },
  header: { marginBottom: Spacing.xl },
  subtitle: { marginTop: Spacing.xs },
  error: { marginBottom: Spacing.sm },
  emptyState: { paddingVertical: Spacing.huge, alignItems: 'center' },
  emptyCopy: { maxWidth: 280, textAlign: 'center', marginTop: Spacing.xs, lineHeight: 22 },
});
