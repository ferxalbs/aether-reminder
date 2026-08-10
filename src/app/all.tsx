import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ListFilter, ListTodo, Plus, Search } from 'lucide-react-native';
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

export default function AllScreen() {
  const isDark = useIsDark();
  const { width } = useWindowDimensions();
  const horizontalPadding =
    width >= 980 ? LayoutTokens.screenHorizontalWide : LayoutTokens.screenHorizontal;
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [query, setQuery] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);

  const allTasks = useTasksUiStore((state) => state.allTasks);
  const status = useTasksUiStore((state) => state.status);
  const error = useTasksUiStore((state) => state.error);
  const refreshAll = useTasksUiStore((state) => state.refreshAll);
  const toggleTask = useTasksUiStore((state) => state.toggleTask);
  const softDeleteTask = useTasksUiStore((state) => state.softDeleteTask);
  const undoReceipt = useTasksUiStore((state) => state.undoReceipt);
  const undoError = useTasksUiStore((state) => state.undoError);
  const undoing = useTasksUiStore((state) => state.undoing);
  const undoLastMutation = useTasksUiStore((state) => state.undoLastMutation);
  const dismissUndo = useTasksUiStore((state) => state.dismissUndo);

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return allTasks.filter((task) => {
      const matchesFilter =
        filter === 'all' || (filter === 'active' ? !task.completed : task.completed);
      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;
      return `${task.title} ${task.notes ?? ''}`.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [allTasks, filter, query]);

  const activeCount = allTasks.filter((task) => !task.completed).length;
  const completedCount = allTasks.length - activeCount;

  const assistantContext = useMemo(
    () => ({
      surface: 'all',
      selectedDate: getLocalDateString(),
      visibleTaskIds: visibleTasks.map((task) => task.id),
      locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      invocationSource: 'app' as const,
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
        reportNonFatalError('all-task-toggle', errorValue);
      });
    },
    [toggleTask],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void softDeleteTask(id).catch((errorValue: unknown) => {
        reportNonFatalError('all-task-delete', errorValue);
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
        tasks={visibleTasks}
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
                    All reminders
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
                color={isDark ? Colors.white : Colors.black}
                style={styles.eyebrow}
              >
                YOUR LIBRARY
              </Typography>
              <Typography variant="display">All reminders</Typography>
              <Typography
                variant="body"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                style={styles.subtitle}
              >
                One calm place for everything you have captured, active or complete.
              </Typography>
            </View>

            <Card variant="glass" padding={Spacing.md} style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <ListTodo
                  size={19}
                  color={isDark ? Colors.white : Colors.black}
                  strokeWidth={2.1}
                />
              </View>
              <View style={styles.summaryCopy}>
                <Typography variant="bodyBold">
                  {activeCount === 0 ? 'Everything is complete' : activeCount + ' active reminders'}
                </Typography>
                <Typography
                  variant="caption"
                  color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                >
                  {completedCount === 0
                    ? 'Your library is ready for the next thought.'
                    : completedCount + ' completed and kept for reference.'}
                </Typography>
              </View>
              <View style={styles.summaryCount}>
                <Typography variant="title">{allTasks.length}</Typography>
                <Typography
                  variant="tiny"
                  color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                >
                  TOTAL
                </Typography>
              </View>
            </Card>

            <View
              style={[
                styles.searchField,
                {
                  backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceLight,
                  borderColor: isDark ? Colors.borderDark : Colors.borderLight,
                },
              ]}
            >
              <Search
                size={18}
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                strokeWidth={2}
              />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search reminders"
                placeholderTextColor={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight}
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel="Search all reminders"
                style={[styles.searchInput, { color: isDark ? Colors.textDark : Colors.textLight }]}
              />
            </View>

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
                  <Check size={26} color={isDark ? Colors.white : Colors.black} />
                ) : (
                  <ListTodo size={26} color={isDark ? Colors.white : Colors.black} />
                )}
              </View>
              <Typography variant="headline" align="center">
                {query.trim() ? 'No reminders found.' : filter === 'completed' ? 'Nothing completed yet.' : 'Your library is empty.'}
              </Typography>
              <Typography
                variant="body"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                align="center"
                style={styles.emptyCopy}
              >
                {query.trim()
                  ? 'Try another word or clear the search.'
                  : 'Capture one thought on Compose and it will stay here until you remove it.'}
              </Typography>
              {!query.trim() && filter !== 'completed' ? (
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
              ) : null}
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
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  subtitle: {
    maxWidth: 650,
    marginTop: Spacing.sm,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  summaryIcon: {
    width: 42,
    height: 42,
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
    gap: 1,
  },
  searchField: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderCurve: 'continuous',
    boxShadow: '0 4px 14px rgba(20, 45, 78, 0.04)',
  },
  searchInput: {
    flex: 1,
    minHeight: 50,
    fontSize: 16,
    lineHeight: 22,
  },
  filterHeader: {
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
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  filterPill: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderCurve: 'continuous',
  },
  filterLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  error: {
    marginBottom: Spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.huge,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderCurve: 'continuous',
    marginBottom: Spacing.sm,
  },
  emptyCopy: {
    maxWidth: 430,
    marginBottom: Spacing.sm,
  },
});
