import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ListTodo, Plus, Search } from 'lucide-react-native';
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

type TaskFilter = 'all' | 'active' | 'completed';

export default function AllScreen() {
  const isDark = useIsDark();
  const { width } = useWindowDimensions();
  const horizontalPadding =
    width >= 980 ? LayoutTokens.screenHorizontalWide : LayoutTokens.screenHorizontal;
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [query, setQuery] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);
  const { startVoiceAssistant } = useAssistantActions();

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

  const contextualActions = useMemo<MenuAction[]>(
    () => [
      { id: 'create', title: 'New reminder', image: 'square.and.pencil' },
      { id: 'voice', title: 'Speak a reminder', image: 'waveform' },
      {
        title: 'Show',
        image: 'line.3.horizontal.decrease.circle',
        subactions: [
          { id: 'filter-all', title: 'All reminders', state: filter === 'all' ? 'on' : 'off' },
          { id: 'filter-active', title: 'Active', state: filter === 'active' ? 'on' : 'off' },
          { id: 'filter-completed', title: 'Completed', state: filter === 'completed' ? 'on' : 'off' },
        ],
      },
    ],
    [filter],
  );

  const handleContextAction = useCallback(
    (actionId: string) => {
      if (actionId === 'create') openEditor();
      if (actionId === 'voice') startVoiceAssistant();
      if (actionId === 'filter-all') setFilter('all');
      if (actionId === 'filter-active') setFilter('active');
      if (actionId === 'filter-completed') setFilter('completed');
    },
    [openEditor, startVoiceAssistant],
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
      <ContextualTopBar actions={contextualActions} onAction={handleContextAction} />
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
            <View style={styles.header}>
              <Typography variant="display">All reminders</Typography>
              <Typography
                variant="body"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                style={styles.subtitle}
              >
                Search and review everything you have captured.
              </Typography>
            </View>

            <View
              style={[
                styles.searchField,
                {
                  backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight,
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
                placeholder="Search reminders…"
                placeholderTextColor={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight}
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel="Search all reminders"
                style={[styles.searchInput, { color: isDark ? Colors.textDark : Colors.textLight }]}
              />
            </View>

            {filter !== 'all' ? (
              <Typography
                variant="tiny"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                style={styles.activeFilter}
              >
                Showing {filter === 'active' ? 'active' : 'completed'} reminders
              </Typography>
            ) : null}

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
                      color={isDark ? Colors.black : Colors.white}
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
    maxWidth: 650,
    marginTop: Spacing.sm,
  },
  searchField: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    fontSize: 15,
    lineHeight: 22,
  },
  activeFilter: {
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
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
    marginBottom: Spacing.sm,
  },
  emptyCopy: {
    maxWidth: 430,
    marginBottom: Spacing.sm,
  },
});
