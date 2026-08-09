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
  CalendarDays,
  Clock3,
  Inbox,
  Mic,
  Plus,
  Sparkles,
} from 'lucide-react-native';
import { Colors, LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { TaskList } from '@/components/ui/TaskList';
import { IconButton } from '@/components/ui/IconButton';
import { Card } from '@/components/ui/Card';
import { TaskEditorSheet } from '@/components/ui/TaskEditorSheet';
import { TaskUndoBanner } from '@/components/ui/TaskUndoBanner';
import { Button } from '@/components/ui/Button';
import { AetherMark } from '@/components/ui/AetherMark';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { getLocalDateString } from '@/temporal/localCalendar';
import { useAssistantActions, useAssistantSurface } from '@/components/assistant/AssistantHost';
import { getDatabaseErrorMessage } from '@/db';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { canUndoTaskReceipt } from '@/stores/taskUndo';
import type { TaskListItem } from '@/domain/entities';

function MetaChip({
  icon,
  label,
}: {
  icon: React.ReactElement<{ color?: string }>;
  label: string;
}) {
  const isDark = useIsDark();
  const color = isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight;

  return (
    <View
      style={[
        styles.metaChip,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.07)' : '#F1F4F8',
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
        },
      ]}
    >
      {React.cloneElement(icon, { color })}
      <Typography variant="caption" color={color} style={styles.metaChipLabel}>
        {label}
      </Typography>
    </View>
  );
}

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

  const completedCount = todayTasks.filter((task) => task.completed).length;
  const totalCount = todayTasks.length;
  const pendingCount = Math.max(0, totalCount - completedCount);

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
    const title = quickTitle.trim();
    if (!title || quickSaving) return;

    setQuickSaving(true);
    setQuickError(null);
    try {
      await createTask({
        title,
        dueDate: getLocalDateString(),
        priority: 'medium',
        source: 'manual',
      });
      setQuickTitle('');
    } catch (errorValue) {
      setQuickError(getDatabaseErrorMessage(errorValue));
    } finally {
      setQuickSaving(false);
    }
  }, [createTask, quickSaving, quickTitle]);

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
              style={styles.utilityBar}
            >
              <View style={styles.utilitySpacer} />
              <View style={styles.topActions}>
                <Button
                  label={width >= 390 ? 'Ask AETHER' : 'Ask'}
                  variant="secondary"
                  size="sm"
                  onPress={openTextAssistant}
                  accessibilityLabel="Open Ask AETHER"
                  accessibilityHint="Open the text assistant"
                  icon={
                    <Sparkles
                      size={16}
                      color={isDark ? Colors.brandCyan : Colors.brandBlue}
                      strokeWidth={2.1}
                    />
                  }
                />
                <IconButton
                  icon={
                    <Plus
                      size={20}
                      color={isDark ? Colors.brandInk : Colors.white}
                      strokeWidth={2.5}
                    />
                  }
                  onPress={() => openEditor()}
                  accessibilityLabel="Open full reminder composer"
                  variant="solid"
                  size={44}
                />
              </View>
            </Animated.View>

            <Animated.View
              entering={reduceMotion ? undefined : FadeInDown.duration(240).delay(40).springify()}
              style={styles.brandHero}
            >
              <AetherMark size={64} muted={isDark} />
              <Typography variant="display" style={styles.wordmark}>
                AETHER
              </Typography>
              <Typography
                variant="display"
                color={isDark ? Colors.brandCyan : Colors.brandBlue}
                style={styles.productName}
              >
                Reminder
              </Typography>
              <Typography
                variant="body"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                align="center"
                style={styles.tagline}
              >
                Capture one thought at a time.
              </Typography>
            </Animated.View>

            <Animated.View
              entering={reduceMotion ? undefined : FadeInDown.duration(260).delay(80).springify()}
              style={styles.captureWrap}
            >
                <Card variant="elevated" padding={Spacing.lg} style={styles.captureCard}>
                  <View style={styles.cardEyebrowRow}>
                    <Typography
                      variant="caption"
                      color={isDark ? Colors.brandCyan : Colors.brandBlue}
                      style={styles.eyebrow}
                    >
                      NEW REMINDER
                    </Typography>
                    <AetherMark size={26} muted={isDark} />
                  </View>
                  <Typography variant="headline" style={styles.captureTitle}>
                    What would you like to remember?
                  </Typography>
                  <TextInput
                    value={quickTitle}
                    onChangeText={(value) => {
                      setQuickTitle(value);
                      if (quickError) setQuickError(null);
                    }}
                    placeholder="Pick up dry cleaning after the team meeting"
                    placeholderTextColor={
                      isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight
                    }
                    multiline
                    textAlignVertical="top"
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={() => void handleQuickCapture()}
                    style={[
                      styles.quickInput,
                      {
                        color: isDark ? Colors.textDark : Colors.textLight,
                        backgroundColor: isDark
                          ? 'rgba(255, 255, 255, 0.045)'
                          : '#F7F9FC',
                        borderColor: isDark ? Colors.borderDark : Colors.borderLight,
                      },
                    ]}
                    accessibilityLabel="New reminder"
                  />
                  <View style={styles.metaRow}>
                    <MetaChip icon={<CalendarDays size={15} />} label="Today" />
                    <MetaChip icon={<Clock3 size={15} />} label="Any time" />
                    <MetaChip icon={<Inbox size={15} />} label="Inbox" />
                  </View>
                  {quickError ? (
                    <Typography
                      variant="caption"
                      color={isDark ? Colors.destructiveTextDark : Colors.destructiveTextLight}
                      style={styles.formError}
                    >
                      {quickError}
                    </Typography>
                  ) : null}
                  <Button
                    label={quickSaving ? 'Saving reminder' : 'Add Reminder'}
                    onPress={() => void handleQuickCapture()}
                    loading={quickSaving}
                    disabled={!quickTitle.trim()}
                    fullWidth
                    size="lg"
                    icon={
                      <ArrowUp
                        size={18}
                        color={isDark ? Colors.brandInk : Colors.white}
                        strokeWidth={2.5}
                      />
                    }
                    style={styles.captureButton}
                  />
                  <Button
                    label="Speak instead"
                    variant="ghost"
                    size="sm"
                    onPress={startVoiceAssistant}
                    accessibilityLabel="Speak a reminder instead"
                    accessibilityHint="Start voice capture with AETHER"
                    icon={
                      <Mic
                        size={17}
                        color={isDark ? Colors.brandCyan : Colors.brandBlue}
                        strokeWidth={2.1}
                      />
                    }
                    style={styles.voiceButton}
                  />
                </Card>
            </Animated.View>

            <Animated.View
              entering={reduceMotion ? undefined : FadeInDown.duration(240).delay(120).springify()}
              style={styles.sectionHeader}
            >
              <View style={styles.sectionTitleRow}>
                <View
                  style={[
                    styles.sectionDot,
                    { backgroundColor: isDark ? Colors.brandCyan : Colors.brandBlue },
                  ]}
                />
                <View>
                  <Typography variant="title">Today</Typography>
                  <Typography
                    variant="caption"
                    color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                  >
                    {status === 'loading'
                      ? 'Refreshing your focus'
                      : pendingCount + ' active ' + (pendingCount === 1 ? 'reminder' : 'reminders')}
                  </Typography>
                </View>
              </View>
              <Typography
                variant="caption"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
              >
                {totalCount === 0 ? 'Start small' : completedCount + '/' + totalCount}
              </Typography>
            </Animated.View>

            {error ? (
              <Typography
                variant="caption"
                color={isDark ? Colors.destructiveTextDark : Colors.destructiveTextLight}
                style={styles.listError}
              >
                {error}
              </Typography>
            ) : null}
          </View>
        }
        empty={
          status !== 'loading' ? (
            <Animated.View
              entering={reduceMotion ? undefined : FadeIn.duration(180).delay(160)}
              style={styles.emptyState}
            >
              <View
                style={[
                  styles.emptyMark,
                  {
                    backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceLight,
                    borderColor: isDark ? Colors.borderDark : Colors.borderLight,
                  },
                ]}
              >
                <Sparkles
                  size={28}
                  color={isDark ? Colors.brandCyan : Colors.brandBlue}
                  strokeWidth={1.8}
                />
              </View>
              <Typography variant="headline" align="center" style={styles.emptyTitle}>
                Your runway is clear.
              </Typography>
              <Typography
                variant="body"
                align="center"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                style={styles.emptyCopy}
              >
                Add one thought above and AETHER will keep it close until it is done.
              </Typography>
              <Button
                label="Open full composer"
                variant="secondary"
                onPress={() => openEditor()}
                icon={
                  <Plus
                    size={17}
                    color={isDark ? Colors.white : Colors.brandInk}
                    strokeWidth={2.4}
                  />
                }
              />
            </Animated.View>
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
  scrollContent: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: Spacing.md,
    paddingBottom: 144,
  },
  headerContent: {
    width: '100%',
  },
  utilityBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  utilitySpacer: {
    width: 1,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  brandHero: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  wordmark: {
    marginTop: Spacing.md,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: 5.2,
  },
  productName: {
    marginTop: -2,
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: 0.2,
  },
  tagline: {
    marginTop: Spacing.sm,
    maxWidth: 340,
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.55,
  },
  captureWrap: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    marginBottom: Spacing.xl,
  },
  captureCard: {
    borderRadius: Radius.xl,
    boxShadow: '0 12px 30px rgba(20, 45, 78, 0.07)',
  },
  cardEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  captureTitle: {
    maxWidth: 460,
    marginBottom: Spacing.md,
  },
  quickInput: {
    minHeight: 204,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
    lineHeight: 23,
    borderCurve: 'continuous',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  metaChip: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderCurve: 'continuous',
  },
  metaChipLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  formError: {
    marginTop: Spacing.sm,
  },
  captureButton: {
    marginTop: Spacing.lg,
    boxShadow: '0 8px 22px rgba(47, 124, 255, 0.24)',
  },
  voiceButton: {
    alignSelf: 'center',
    marginTop: Spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionDot: {
    width: 9,
    height: 9,
    borderRadius: Radius.pill,
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
  emptyMark: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderCurve: 'continuous',
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    marginBottom: Spacing.xs,
  },
  emptyCopy: {
    maxWidth: 420,
    marginBottom: Spacing.lg,
  },
});
