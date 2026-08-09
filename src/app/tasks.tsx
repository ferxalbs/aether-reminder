import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, Check, ListFilter, Plus } from 'lucide-react-native';
import { Colors, LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { TaskList } from '@/components/ui/TaskList';
import { TaskUndoBanner } from '@/components/ui/TaskUndoBanner';
import { AetherMark } from '@/components/ui/AetherMark';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { getLocalDateString } from '@/temporal/localCalendar';
import { useAssistantSurface } from '@/components/assistant/AssistantHost';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { canUndoTaskReceipt } from '@/stores/taskUndo';

type TaskFilter = 'all' | 'active' | 'completed';

function FilterPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const isDark = useIsDark();

  return (
    <AnimatedPressable
      onPress={onPress}
      scaleTo={0.96}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.filterPill,
        {
          backgroundColor: selected
            ? isDark
              ? Colors.surfaceRaisedLight
              : Colors.brandInk
            : isDark
              ? 'rgba(255, 255, 255, 0.055)'
              : '#F1F4F8',
          borderColor: selected
            ? 'transparent'
            : isDark
              ? Colors.borderDark
              : Colors.borderLight,
        },
      ]}
    >
      <Typography
        variant="caption"
        color={
          selected
            ? isDark
              ? Colors.brandInk
              : Colors.white
            : isDark
              ? Colors.secondaryTextDark
              : Colors.secondaryTextLight
        }
        style={styles.filterLabel}
      >
        {label}
      </Typography>
    </AnimatedPressable>
  );
}

export default function TasksScreen() {
  const isDark = useIsDark();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const horizontalPadding =
    width >= 980 ? LayoutTokens.screenHorizontalWide : LayoutTokens.screenHorizontal;
  const [filter, setFilter] = useState<TaskFilter>('all');

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

  const filteredTasks = useMemo(
    () =>
      upcomingTasks.filter((task) => {
        if (filter === 'active') return !task.completed;
        if (filter === 'completed') return task.completed;
        return true;
      }),
    [filter, upcomingTasks],
  );
  const activeCount = upcomingTasks.filter((task) => !task.completed).length;
  const completedCount = upcomingTasks.length - activeCount;

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
        tasks={filteredTasks}
        onToggle={handleToggle}
        onDelete={handleDelete}
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
                onPress={() => router.replace('/')}
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
                  {activeCount === 0 ? 'Your runway is clear' : activeCount + ' active reminders'}
                </Typography>
                <Typography
                  variant="caption"
                  color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                >
                  {completedCount === 0
                    ? 'Everything ahead is still in motion.'
                    : completedCount + ' completed in this view.'}
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

            <View style={styles.filterHeader}>
              <View style={styles.filterTitleRow}>
                <ListFilter
                  size={17}
                  color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                />
                <Typography variant="bodyBold">Show</Typography>
              </View>
              <View style={styles.filterRow}>
                <FilterPill label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
                <FilterPill
                  label="Active"
                  selected={filter === 'active'}
                  onPress={() => setFilter('active')}
                />
                <FilterPill
                  label="Done"
                  selected={filter === 'completed'}
                  onPress={() => setFilter('completed')}
                />
              </View>
            </View>

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
                {filter === 'completed' ? (
                  <Check size={26} color={isDark ? Colors.brandCyan : Colors.brandBlue} />
                ) : (
                  <CalendarDays size={26} color={isDark ? Colors.brandCyan : Colors.brandBlue} />
                )}
              </View>
              <Typography variant="headline" align="center">
                {filter === 'completed' ? 'No completed reminders yet.' : 'Nothing scheduled here.'}
              </Typography>
              <Typography
                variant="body"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                align="center"
                style={styles.emptyCopy}
              >
                {filter === 'completed'
                  ? 'Finish a reminder and it will appear in this quiet archive.'
                  : 'Capture a thought on Compose or ask AETHER to plan the next step.'}
              </Typography>
              <Button
                label="Create a reminder"
                onPress={() => router.replace('/')}
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
  filterHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  filterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  filterPill: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: Radius.pill,
    borderCurve: 'continuous',
  },
  filterLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
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
