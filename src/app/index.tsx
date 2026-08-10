import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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
} from 'lucide-react-native';
import type { MenuAction } from '@expo/ui/community/menu';
import { Colors, LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { TaskList } from '@/components/ui/TaskList';
import { IconButton } from '@/components/ui/IconButton';
import { TaskEditorSheet } from '@/components/ui/TaskEditorSheet';
import { TaskUndoBanner } from '@/components/ui/TaskUndoBanner';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { getLocalDateString } from '@/temporal/localCalendar';
import { parseLocalReminderInput } from '@/services/capture/localIntentParser';
import { useAssistantActions, useAssistantSurface } from '@/components/assistant/AssistantHost';
import { getDatabaseErrorMessage } from '@/db';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { canUndoTaskReceipt } from '@/stores/taskUndo';
import type { TaskListItem } from '@/domain/entities';
import { ContextualTopBar } from '@/components/navigation/ContextualTopBar';

const homeActions: MenuAction[] = [
  { id: 'detailed-reminder', title: 'Detailed reminder', image: 'square.and.pencil' },
  { id: 'voice-reminder', title: 'Speak a reminder', image: 'waveform' },
  { id: 'command', title: 'Command AETHER', image: 'command' },
];

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

  const handleContextAction = useCallback(
    (actionId: string) => {
      if (actionId === 'detailed-reminder') openEditor();
      if (actionId === 'voice-reminder') startVoiceAssistant();
      if (actionId === 'command') openTextAssistant();
    },
    [openEditor, openTextAssistant, startVoiceAssistant],
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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ContextualTopBar actions={homeActions} onAction={handleContextAction} />
        <TaskList
          style={styles.flex}
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
                style={styles.titleBlock}
              >
                <Typography variant="display">Today</Typography>
                <Typography variant="body" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                  Capture what matters. Everything else can wait.
                </Typography>
              </Animated.View>

              {error || quickError ? (
                <Typography
                  variant="caption"
                  color={isDark ? Colors.white : Colors.black}
                  style={styles.listError}
                  accessibilityRole="alert"
                >
                  {error || quickError}
                </Typography>
              ) : null}
            </View>
          }
          empty={
            status === 'ready' ? (
              <Animated.View
                entering={reduceMotion ? undefined : FadeIn.duration(180).delay(120)}
                style={styles.emptyState}
              >
                <Typography variant="title" align="center">Your day is clear.</Typography>
                <Typography
                  variant="body"
                  align="center"
                  color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                  style={styles.emptyCopy}
                >
                  Type below or speak naturally to add a reminder.
                </Typography>
              </Animated.View>
            ) : null
          }
        />

        <Animated.View
          style={[
            styles.composerWrap,
            {
              paddingHorizontal: horizontalPadding,
              backgroundColor: isDark ? Colors.backgroundDark : Colors.backgroundLight,
              borderTopColor: isDark ? Colors.separatorDark : Colors.separatorLight,
            },
          ]}
          entering={reduceMotion ? undefined : FadeInDown.duration(300).delay(80).springify()}
        >
          <View
            style={[
              styles.composer,
              {
                backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight,
                borderColor: isDark ? Colors.borderDark : Colors.borderLight,
              },
            ]}
          >
            <View style={styles.composerInputRow}>
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
                  styles.composerInput,
                  { color: isDark ? Colors.textDark : Colors.textLight }
                ]}
                onSubmitEditing={() => void handleQuickCapture()}
                returnKeyType="done"
                multiline
                maxLength={240}
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
                <IconButton
                  icon={<Mic size={20} color={isDark ? Colors.white : Colors.black} strokeWidth={2} />}
                  onPress={startVoiceAssistant}
                  accessibilityLabel="Speak a reminder"
                  accessibilityHint="Opens voice capture as an alternative to typing"
                  variant="ghost"
                  size={40}
                />
              )}
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>

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
  flex: { flex: 1 },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  headerContent: {
    width: '100%',
    paddingBottom: Spacing.sm,
  },
  titleBlock: {
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
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
  composerWrap: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    alignItems: 'center',
  },
  composer: {
    width: '100%',
    maxWidth: LayoutTokens.contentMaxWidth,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.xs,
  },
  composerInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    maxHeight: 72,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
  },
});
