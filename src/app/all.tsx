import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search } from 'lucide-react-native';
import { Colors, LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { TaskList } from '@/components/ui/TaskList';
import { TaskUndoBanner } from '@/components/ui/TaskUndoBanner';
import { TaskEditorSheet } from '@/components/ui/TaskEditorSheet';
import { AetherComposer } from '@/components/ui/AetherComposer';
import type { TaskListItem } from '@/domain/entities';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { getLocalDateString } from '@/temporal/localCalendar';
import { parseLocalReminderInput } from '@/services/capture/localIntentParser';
import { useAssistantActions, useAssistantSurface, useAssistantActive } from '@/components/assistant/AssistantHost';
import { getDatabaseErrorMessage } from '@/db';
import { useBottomChromeGeometry } from '@/theme/useBottomChromeGeometry';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { canUndoTaskReceipt } from '@/stores/taskUndo';

type TaskFilter = 'all' | 'active' | 'completed';

export default function RemindersScreen() {
  const isDark = useIsDark();
  const { width } = useWindowDimensions();
  const horizontalPadding =
    width >= 980 ? LayoutTokens.screenHorizontalWide : LayoutTokens.screenHorizontal;
  const [filter] = useState<TaskFilter>('all');
  const [query, setQuery] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const { startVoiceAssistant } = useAssistantActions();
  const geometry = useBottomChromeGeometry();
  const assistantActive = useAssistantActive();

  const allTasks = useTasksUiStore((state) => state.allTasks);
  const status = useTasksUiStore((state) => state.status);
  const error = useTasksUiStore((state) => state.error);
  const refreshAll = useTasksUiStore((state) => state.refreshAll);
  const createTask = useTasksUiStore((state) => state.createTask);
  const toggleTask = useTasksUiStore((state) => state.toggleTask);
  const softDeleteTask = useTasksUiStore((state) => state.softDeleteTask);
  const undoReceipt = useTasksUiStore((state) => state.undoReceipt);
  const undoError = useTasksUiStore((state) => state.undoError);
  const undoing = useTasksUiStore((state) => state.undoing);
  const undoLastMutation = useTasksUiStore((state) => state.undoLastMutation);
  const dismissUndo = useTasksUiStore((state) => state.dismissUndo);

  const quickIntent = useMemo(() => parseLocalReminderInput(quickTitle), [quickTitle]);

  const handleQuickCapture = useCallback(async (titleToSave?: string) => {
    const rawTitle = (titleToSave ?? quickTitle).trim();
    if (!rawTitle || quickSaving) return;

    setQuickSaving(true);
    try {
      await createTask({
        title: quickIntent.title || rawTitle,
        dueDate: quickIntent.dueDate,
        dueTime: quickIntent.dueTime,
        dueTimezone: quickIntent.dueTimezone,
        priority: quickIntent.priority,
        source: 'manual',
      });
      setQuickTitle('');
    } catch (errorValue) {
      reportNonFatalError('reminders-quick-capture', getDatabaseErrorMessage(errorValue));
    } finally {
      setQuickSaving(false);
    }
  }, [createTask, quickIntent, quickSaving, quickTitle]);

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
            <View style={styles.header}>
              <Typography variant="display">Reminders</Typography>
            </View>

            {allTasks.length > 3 ? (
              <View
                style={[
                  styles.searchField,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                    borderColor: isDark ? Colors.borderDark : Colors.borderLight,
                  },
                ]}
              >
                <Search
                  size={17}
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
              <Typography variant="body" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                {query.trim() ? 'No reminders found.' : 'Your library is empty.'}
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
    paddingTop: Spacing.lg,
  },
  headerContent: {
    width: '100%',
  },
  header: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  searchField: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
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
  error: {
    marginBottom: Spacing.md,
  },
  emptyState: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  composerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 90,
  },
});
