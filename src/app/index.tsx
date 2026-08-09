import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  TextInput,
  View,
  type DimensionValue,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  ArrowUp,
  CalendarDays,
  Clock3,
  Inbox,
  Plus,
  Sparkles,
  Target,
} from 'lucide-react-native';
import { Colors, LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { TaskList } from '@/components/ui/TaskList';
import { IconButton } from '@/components/ui/IconButton';
import { Card } from '@/components/ui/Card';
import { AddTaskModal } from '@/components/ui/AddTaskModal';
import { TaskUndoBanner } from '@/components/ui/TaskUndoBanner';
import { Button } from '@/components/ui/Button';
import { AetherMark } from '@/components/ui/AetherMark';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { getLocalDateString } from '@/temporal/localCalendar';
import { useAssistantActions, useAssistantSurface } from '@/components/assistant/AssistantHost';
import { getDatabaseErrorMessage } from '@/db';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { canUndoTaskReceipt } from '@/stores/taskUndo';

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
  const { width } = useWindowDimensions();
  const isWide = width >= 720;
  const horizontalPadding =
    width >= 980 ? LayoutTokens.screenHorizontalWide : LayoutTokens.screenHorizontal;
  const { openTextAssistant } = useAssistantActions();

  const [quickTitle, setQuickTitle] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

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
  const progressRatio = totalCount > 0 ? completedCount / totalCount : 0;
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

  const animatedProgress = useSharedValue(progressRatio);
  useEffect(() => {
    animatedProgress.value = withSpring(progressRatio, {
      damping: 20,
      stiffness: 180,
    });
  }, [animatedProgress, progressRatio]);

  const animatedProgressStyle = useAnimatedStyle<ViewStyle>(() => ({
    width: (String(Math.min(100, Math.max(0, animatedProgress.value * 100)) + '%') as unknown) as DimensionValue,
  }));

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

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

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
              entering={FadeInDown.duration(500).springify()}
              style={styles.topBar}
            >
              <View style={styles.brandLockup}>
                <AetherMark size={34} muted={isDark} />
                <View>
                  <Typography variant="bodyBold" style={styles.brandName}>
                    AETHER
                  </Typography>
                  <Typography
                    variant="tiny"
                    color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                  >
                    Reminder
                  </Typography>
                </View>
              </View>
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
                  onPress={() => setModalVisible(true)}
                  accessibilityLabel="Open full reminder composer"
                  variant="solid"
                  size={44}
                />
              </View>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.duration(600).delay(80).springify()}
              style={styles.intro}
            >
              <Typography
                variant="caption"
                color={isDark ? Colors.brandCyan : Colors.brandBlue}
                style={styles.eyebrow}
              >
                {formattedDate.toUpperCase()}
              </Typography>
              <Typography variant="display" style={styles.displayTitle}>
                Capture one thought{'\n'}at a time.
              </Typography>
              <Typography
                variant="body"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                style={styles.introCopy}
              >
                Speak naturally or type it once. AETHER keeps the next step close.
              </Typography>
            </Animated.View>

            <View style={[styles.heroGrid, isWide && styles.heroGridWide]}>
              <Animated.View
                entering={FadeInDown.duration(650).delay(140).springify()}
                style={isWide ? styles.captureColumn : undefined}
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
                    What should AETHER remember?
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
                    <MetaChip icon={<Clock3 size={15} />} label="Now" />
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
                </Card>
              </Animated.View>

              <Animated.View
                entering={FadeInDown.duration(650).delay(220).springify()}
                style={isWide ? styles.progressColumn : undefined}
              >
                <Card variant="glass" padding={Spacing.lg} style={styles.progressCard}>
                  <View style={styles.progressCardTop}>
                    <View style={styles.progressIcon}>
                      <Target
                        size={19}
                        color={isDark ? Colors.brandCyan : Colors.brandBlue}
                        strokeWidth={2.2}
                      />
                    </View>
                    <Typography
                      variant="caption"
                      color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                    >
                      TODAY’S MOMENTUM
                    </Typography>
                  </View>
                  <View style={styles.progressValueRow}>
                    <Typography variant="display" style={styles.progressValue}>
                      {Math.round(progressRatio * 100)}%
                    </Typography>
                    <Typography
                      variant="body"
                      color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                      style={styles.progressValueCopy}
                    >
                      {totalCount === 0
                        ? 'Ready when you are'
                        : completedCount + ' of ' + totalCount + ' complete'}
                    </Typography>
                  </View>
                  <View
                    style={[
                      styles.progressTrack,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255, 255, 255, 0.10)'
                          : 'rgba(47, 124, 255, 0.10)',
                      },
                    ]}
                  >
                    <Animated.View
                      style={[
                        styles.progressFill,
                        { backgroundColor: isDark ? Colors.brandCyan : Colors.brandBlue },
                        animatedProgressStyle,
                      ]}
                    />
                  </View>
                  <View style={styles.progressFooter}>
                    <Sparkles
                      size={16}
                      color={isDark ? Colors.brandGold : Colors.warningLight}
                      strokeWidth={2}
                    />
                    <Typography
                      variant="caption"
                      color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                    >
                      {pendingCount === 0
                        ? 'A clear runway for the rest of your day.'
                        : pendingCount + ' next ' + (pendingCount === 1 ? 'step' : 'steps') + ' in view.'}
                    </Typography>
                  </View>
                </Card>
              </Animated.View>
            </View>

            <Animated.View
              entering={FadeInDown.duration(600).delay(300).springify()}
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
            <Animated.View entering={FadeIn.duration(700).delay(360)} style={styles.emptyState}>
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
                onPress={() => setModalVisible(true)}
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

      <AddTaskModal visible={modalVisible} onClose={() => setModalVisible(false)} />
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
  topBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  brandName: {
    letterSpacing: 2.4,
  },
  intro: {
    marginBottom: Spacing.xl,
    maxWidth: LayoutTokens.readingMaxWidth,
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.55,
  },
  displayTitle: {
    marginTop: Spacing.xs,
  },
  introCopy: {
    marginTop: Spacing.sm,
    maxWidth: 560,
  },
  heroGrid: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  heroGridWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  captureColumn: {
    flex: 1.55,
  },
  progressColumn: {
    flex: 1,
    minWidth: 250,
  },
  captureCard: {
    minHeight: 334,
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
    minHeight: 112,
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
    boxShadow: '0 7px 20px rgba(47, 124, 255, 0.22)',
  },
  progressCard: {
    flex: 1,
    minHeight: 216,
    justifyContent: 'space-between',
  },
  progressCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: 'rgba(47, 124, 255, 0.10)',
  },
  progressValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  progressValue: {
    fontSize: 42,
    lineHeight: 46,
  },
  progressValueCopy: {
    flex: 1,
    paddingBottom: 5,
  },
  progressTrack: {
    height: 9,
    overflow: 'hidden',
    borderRadius: Radius.pill,
    marginTop: Spacing.lg,
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  progressFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xl,
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
