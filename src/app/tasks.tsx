import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, Plus } from 'lucide-react-native';
import { Colors, LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { TaskList } from '@/components/ui/TaskList';
import { TaskUndoBanner } from '@/components/ui/TaskUndoBanner';
import { AetherMark } from '@/components/ui/AetherMark';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { TaskEditorSheet } from '@/components/ui/TaskEditorSheet';
import type { TaskListItem } from '@/domain/entities';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { getLocalDateString } from '@/temporal/localCalendar';
import { useAssistantSurface } from '@/components/assistant/AssistantHost';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { canUndoTaskReceipt } from '@/stores/taskUndo';

export default function TasksScreen() {
  const isDark = useIsDark();
  const { width } = useWindowDimensions();
  const horizontalPadding =
    width >= 980 ? LayoutTokens.screenHorizontalWide : LayoutTokens.screenHorizontal;
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);

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

  const activeCount = upcomingTasks.length;

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
            <View style={styles.topBar}>
              <View style={styles.brandLockup}>
                <AetherMark size={32} muted={isDark} />
                <View>
                  <Typography variant="bodyBold">AETHER</Typography>
                  <Typography
                    variant="tiny"
                    color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                  >
                    Upcoming
                  </Typography>
                </View>
              </View>
              <AnimatedPressable
                onPress={() => openEditor()}
                scaleTo={0.94}
                accessibilityRole="button"
                accessibilityLabel="Create a reminder"
                style={[
                  styles.addButton,
                  { backgroundColor: isDark ? Colors.surfaceRaisedLight : Colors.brandInk },
                ]}
              >
                <Plus size={19} color={isDark ? Colors.brandInk : Colors.white} strokeWidth={2.5} />
              </AnimatedPressable>
            </View>

            <View style={styles.header}>
              <Typography
                variant="caption"
                color={isDark ? Colors.brandCyan : Colors.brandBlue}
                style={styles.eyebrow}
              >
                YOUR RUNWAY
              </Typography>
              <Typography variant="display">Upcoming</Typography>
              <Typography
                variant="body"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                style={styles.subtitle}
              >
                Keep the next few steps in view, without losing the calm.
              </Typography>
            </View>

            <Card variant="glass" padding={Spacing.md} style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <CalendarDays
                  size={19}
                  color={isDark ? Colors.brandCyan : Colors.brandBlue}
                  strokeWidth={2.1}
                />
              </View>
              <View style={styles.summaryCopy}>
                <Typography variant="bodyBold">
                  {activeCount === 0 ? 'Your runway is clear' : activeCount + ' upcoming reminders'}
                </Typography>
                <Typography
                  variant="caption"
                  color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                >
                  {activeCount === 0
                    ? 'Schedule the next thought when you are ready.'
                    : 'Only active reminders with a future date appear here.'}
                </Typography>
              </View>
              <View style={styles.summaryCount}>
                <Typography variant="title">{upcomingTasks.length}</Typography>
                <Typography
                  variant="tiny"
                  color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                >
                  TOTAL
                </Typography>
              </View>
            </Card>

            {error ? (
              <Typography
                variant="caption"
                color={isDark ? Colors.destructiveTextDark : Colors.destructiveTextLight}
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
                    backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceLight,
                    borderColor: isDark ? Colors.borderDark : Colors.borderLight,
                  },
                ]}
              >
                <CalendarDays size={26} color={isDark ? Colors.brandCyan : Colors.brandBlue} />
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
                Capture a thought here or open All to revisit your complete library.
              </Typography>
              <Button
                label="Create a reminder"
                onPress={() => openEditor()}
                icon={
                  <Plus
                    size={17}
                    color={isDark ? Colors.brandInk : Colors.white}
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
    paddingTop: Spacing.md,
    paddingBottom: 144,
  },
  headerContent: {
    width: '100%',
  },
  topBar: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  addButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderCurve: 'continuous',
  },
  header: {
    maxWidth: LayoutTokens.readingMaxWidth,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.55,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginTop: Spacing.xs,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  summaryIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: 'rgba(47, 124, 255, 0.10)',
  },
  summaryCopy: {
    flex: 1,
    gap: 2,
  },
  summaryCount: {
    alignItems: 'flex-end',
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
    borderCurve: 'continuous',
    marginBottom: Spacing.md,
  },
  emptyCopy: {
    maxWidth: 420,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
});
