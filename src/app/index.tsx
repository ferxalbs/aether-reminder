import React, { useCallback, useMemo, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  ArrowUp,
  Mic,
  Plus,
  Sparkles,
} from 'lucide-react-native';
import { Colors, LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { TaskList } from '@/components/ui/TaskList';
import { IconButton } from '@/components/ui/IconButton';
import { TaskEditorSheet } from '@/components/ui/TaskEditorSheet';
import { TaskUndoBanner } from '@/components/ui/TaskUndoBanner';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { getLocalDateString } from '@/temporal/localCalendar';
import { parseLocalReminderInput } from '@/services/capture/localIntentParser';
import { useAssistantActions, useAssistantSurface } from '@/components/assistant/AssistantHost';
import { getDatabaseErrorMessage } from '@/db';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { canUndoTaskReceipt } from '@/stores/taskUndo';
import type { TaskListItem } from '@/domain/entities';

export default function HomeScreen() {
  const isDark = useIsDark();
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const horizontalPadding =
    width >= 980 ? LayoutTokens.screenHorizontalWide : LayoutTokens.screenHorizontal;
  const { openTextAssistant, startVoiceAssistant } = useAssistantActions();

  const [quickTitle, setQuickTitle] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);

  const todayTasks = useTasksUiStore((s) => s.todayTasks);
  const status = useTasksUiStore((s) => s.status);
  const error = useTasksUiStore((s) => s.error);
  const refreshToday = useTasksUiStore((s) => s.refreshToday);
  const createTask = useTasksUiStore((s) => s.createTask);
  const toggleTask = useTasksUiStore((s) => s.toggleTask);
  const softDeleteTask = useTasksUiStore((s) => s.softDeleteTask);
  const undoReceipt = useTasksUiStore((s) => s.undoReceipt);
  const undoError = useTasksUiStore((s) => s.undoError);
  const undoing = useTasksUiStore((s) => s.undoing);
  const undoLastMutation = useTasksUiStore((s) => s.undoLastMutation);
  const dismissUndo = useTasksUiStore((s) => s.dismissUndo);

  useFocusEffect(
    useCallback(() => {
      void refreshToday();
    }, [refreshToday]),
  );

  const quickIntent = useMemo(() => parseLocalReminderInput(quickTitle), [quickTitle]);

  const assistantContext = useMemo(
    () => ({
      surface: 'home',
      selectedDate: getLocalDateString(),
      visibleTaskIds: todayTasks.map((task) => task.id),
      locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      invocationSource: 'app' as const,
    }),
    [todayTasks],
  );
  useAssistantSurface(assistantContext);

  const handleQuickCapture = useCallback(async () => {
    const rawTitle = quickTitle.trim();
    if (!rawTitle || quickSaving) return;

    setQuickSaving(true);
    setQuickError(null);
    try {
      await createTask({
        title: quickIntent.title,
        dueDate: quickIntent.dueDate,
        dueTime: quickIntent.dueTime,
        dueTimezone: quickIntent.dueTimezone,
        priority: quickIntent.priority,
        source: 'manual',
      });
      setQuickTitle('');
    } catch (errorValue) {
      setQuickError(getDatabaseErrorMessage(errorValue));
    } finally {
      setQuickSaving(false);
    }
  }, [createTask, quickIntent, quickSaving, quickTitle]);

  const handleToggle = useCallback(
    (id: string) => {
      void toggleTask(id).catch((errorValue: unknown) => {
        reportNonFatalError('home-task-toggle', errorValue);
      });
    },
    [toggleTask],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void softDeleteTask(id).catch((errorValue: unknown) => {
        reportNonFatalError('home-task-delete', errorValue);
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
        tasks={todayTasks}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onPress={openEditor}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: horizontalPadding,
            maxWidth: LayoutTokens.contentMaxWidth,
          },
        ]}
        header={
          <View style={styles.headerContent}>
            <Animated.View
              entering={reduceMotion ? undefined : FadeInDown.duration(240).springify()}
              style={styles.largeTitleContainer}
            >
              <Typography variant="display" style={styles.largeTitle}>
                AETHER
              </Typography>
              <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                Capture & organize thoughts
              </Typography>
            </Animated.View>

            {error || quickError ? (
              <Typography
                variant="caption"
                color={isDark ? Colors.white : Colors.black}
                style={styles.listError}
              >
                {error || quickError}
              </Typography>
            ) : null}
          </View>
        }
        empty={
          status === 'ready' ? (
            <Animated.View
              entering={reduceMotion ? undefined : FadeIn.duration(180).delay(160)}
              style={styles.emptyState}
            >
              <Typography
                variant="body"
                align="center"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                style={styles.emptyCopy}
              >
                No reminders today.
              </Typography>
            </Animated.View>
          ) : null
        }
      />

      {/* Floating Bottom Composer */}
      <Animated.View
        style={[styles.floatingComposerWrap, { paddingHorizontal: horizontalPadding }]}
        entering={reduceMotion ? undefined : FadeInDown.duration(400).delay(100).springify()}
      >
        <View style={styles.floatingComposerContainer}>
          <GlassSurface
            borderRadius={Radius.xl}
            style={[
              styles.floatingComposerGlass,
              { borderColor: isDark ? Colors.borderDark : Colors.borderLight }
            ]}
          >
            <View style={styles.floatingComposerInner}>
              <IconButton
                icon={<Plus size={20} color={isDark ? Colors.white : Colors.black} strokeWidth={2.2} />}
                onPress={() => openEditor()}
                accessibilityLabel="Open full reminder composer"
                variant="ghost"
                size={40}
              />
              <TextInput
                value={quickTitle}
                onChangeText={(value) => {
                  setQuickTitle(value);
                  if (quickError) setQuickError(null);
                }}
                placeholder="New reminder…"
                placeholderTextColor={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight}
                style={[
                  styles.floatingInput,
                  { color: isDark ? Colors.textDark : Colors.textLight }
                ]}
                onSubmitEditing={() => void handleQuickCapture()}
                returnKeyType="done"
              />
              {quickTitle.trim().length > 0 ? (
                <IconButton
                  icon={<ArrowUp size={20} color={isDark ? Colors.black : Colors.white} strokeWidth={2.5} />}
                  onPress={() => void handleQuickCapture()}
                  accessibilityLabel="Add Reminder"
                  variant="solid"
                  size={36}
                />
              ) : (
                <>
                  <IconButton
                    icon={<Sparkles size={20} color={isDark ? Colors.white : Colors.black} strokeWidth={2} />}
                    onPress={openTextAssistant}
                    accessibilityLabel="Ask AETHER"
                    variant="ghost"
                    size={40}
                  />
                  <IconButton
                    icon={<Mic size={20} color={isDark ? Colors.white : Colors.black} strokeWidth={2} />}
                    onPress={startVoiceAssistant}
                    accessibilityLabel="Speak a reminder"
                    variant="ghost"
                    size={40}
                  />
                </>
              )}
            </View>
          </GlassSurface>
        </View>
      </Animated.View>

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
  scrollContent: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: Spacing.md,
    paddingBottom: 144,
  },
  headerContent: {
    width: '100%',
    paddingBottom: Spacing.sm,
  },
  largeTitleContainer: {
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
  },
  largeTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -1.0,
  },
  listError: {
    marginBottom: Spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  emptyCopy: {
    marginTop: Spacing.md,
  },
  floatingComposerWrap: {
    position: 'absolute',
    bottom: Spacing.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  floatingComposerContainer: {
    width: '100%',
    maxWidth: LayoutTokens.contentMaxWidth,
  },
  floatingComposerGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  floatingComposerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
    flex: 1,
  },
  floatingInput: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
  },
});
