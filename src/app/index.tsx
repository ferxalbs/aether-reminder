import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, StyleSheet, View, StatusBar } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Plus, Zap, Target, Sparkles } from 'lucide-react-native';
import { Colors, Spacing, Radius } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { TaskCard } from '@/components/ui/TaskCard';
import { IconButton } from '@/components/ui/IconButton';
import { Card } from '@/components/ui/Card';
import { AddTaskModal } from '@/components/ui/AddTaskModal';
import { TaskUndoBanner } from '@/components/ui/TaskUndoBanner';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { getLocalDateString } from '@/temporal/localCalendar';
import { useAssistantSurface } from '@/components/assistant/AssistantHost';
import { reportNonFatalError } from '@/lib/nonFatalError';
import type { TaskListItem } from '@/domain/entities';
import { canUndoTaskReceipt } from '@/stores/taskUndo';

export default function HomeScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const isDark = useIsDark();

  const todayTasks = useTasksUiStore((s) => s.todayTasks);
  const status = useTasksUiStore((s) => s.status);
  const error = useTasksUiStore((s) => s.error);
  const refreshToday = useTasksUiStore((s) => s.refreshToday);
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
    }, [refreshToday])
  );

  const completedCount = todayTasks.filter((t) => t.completed).length;
  const totalCount = todayTasks.length;
  const progressRatio = totalCount > 0 ? completedCount / totalCount : 0;

  const assistantContext = useMemo(
    () => ({
      surface: 'home',
      selectedDate: getLocalDateString(),
      visibleTaskIds: todayTasks.map((task) => task.id),
      locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      invocationSource: 'app' as const,
    }),
    [todayTasks]
  );
  useAssistantSurface(assistantContext);

  const animatedProgress = useSharedValue(progressRatio);
  useEffect(() => {
    animatedProgress.value = withSpring(progressRatio, {
      damping: 20,
      stiffness: 200,
    });
  }, [progressRatio, animatedProgress]);

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, animatedProgress.value * 100))}%`,
  }));

  const handleToggle = useCallback(
    (id: string) => {
      void toggleTask(id).catch((error: unknown) => {
        reportNonFatalError('home-task-toggle', error);
      });
    },
    [toggleTask]
  );

  const handleDelete = useCallback(
    (id: string) => {
      void softDeleteTask(id).catch((error: unknown) => {
        reportNonFatalError('home-task-delete', error);
      });
    },
    [softDeleteTask]
  );

  const renderTask = useCallback(
    ({ item }: ListRenderItemInfo<TaskListItem>) => (
      <TaskCard
        task={item}
        onToggle={handleToggle}
        onDelete={handleDelete}
      />
    ),
    [handleDelete, handleToggle]
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: isDark ? Colors.black : Colors.zinc50 },
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
      <FlatList
        data={todayTasks}
        keyExtractor={(task) => task.id}
        renderItem={renderTask}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
        {/* Header Bar */}
        <Animated.View entering={FadeInDown.duration(500).springify()} style={styles.header}>
          <View>
            <Typography variant="caption" color={Colors.zinc500} style={styles.dateLabel}>
              {formattedDate.toUpperCase()}
            </Typography>
            <Typography variant="display" style={styles.greetingText}>
              {getGreeting()}
            </Typography>
          </View>
          <View style={styles.headerActions}>
            <IconButton
              icon={<Plus size={20} color={isDark ? Colors.white : Colors.black} />}
              onPress={() => setModalVisible(true)}
              variant="glass"
              size={46}
            />
          </View>
        </Animated.View>

        {/* Progress Widget */}
        <Animated.View entering={FadeInDown.duration(600).delay(100).springify()}>
          <Card variant="glass" style={styles.progressCard} padding={Spacing.lg}>
            <View style={styles.progressHeader}>
              <View>
                <View style={styles.progressTitleRow}>
                  <Zap size={20} color={isDark ? '#FBD38D' : '#D69E2E'} strokeWidth={2.5} />
                  <Typography variant="headline">Momentum</Typography>
                </View>
                <Typography variant="caption" color={Colors.zinc500} style={styles.progressSubtitle}>
                  {totalCount === 0 
                    ? 'Ready to plan your day' 
                    : `${completedCount} of ${totalCount} tasks completed`}
                </Typography>
              </View>
              
              <View style={[styles.circularBadge, { backgroundColor: isDark ? 'rgba(251, 211, 141, 0.1)' : 'rgba(214, 158, 46, 0.1)' }]}>
                <Typography variant="title" style={{ color: isDark ? '#FBD38D' : '#D69E2E' }}>
                  {totalCount === 0 ? '0' : Math.round(progressRatio * 100)}%
                </Typography>
              </View>
            </View>

            {/* Progress Bar track */}
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: isDark ? Colors.zinc800 : Colors.zinc200 },
              ]}
            >
              <Animated.View
                style={[
                  styles.progressFill,
                  { backgroundColor: isDark ? '#FBD38D' : '#D69E2E' },
                  animatedProgressStyle,
                ]}
              />
            </View>
          </Card>
        </Animated.View>

        {/* Tasks Section Header */}
        <Animated.View entering={FadeInDown.duration(600).delay(200).springify()} style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Target size={20} color={isDark ? Colors.white : Colors.black} />
            <Typography variant="title">Daily Focus</Typography>
          </View>
          <View style={[styles.countBadge, { backgroundColor: isDark ? Colors.zinc900 : Colors.zinc200, borderColor: isDark ? Colors.glassBorderDark : 'transparent', borderWidth: 1 }]}>
            <Typography variant="caption" color={isDark ? Colors.zinc400 : Colors.zinc600}>
              {status === 'loading' ? '...' : `${todayTasks.length}`}
            </Typography>
          </View>
        </Animated.View>

        {error ? (
          <Typography variant="caption" color={Colors.zinc500} style={{ marginBottom: Spacing.sm }}>
            {error}
          </Typography>
        ) : null}

          </>
        }

        ListEmptyComponent={status !== 'loading' ? (
          <Animated.View entering={FadeIn.duration(800).delay(400)} style={styles.emptyStateContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? Colors.zinc900 : Colors.white, borderColor: isDark ? Colors.zinc800 : Colors.zinc200, borderWidth: 1 }]}>
              <Sparkles size={36} color={isDark ? Colors.zinc500 : Colors.zinc400} strokeWidth={1.5} />
            </View>
            <Typography variant="headline" align="center" style={styles.emptyTitle}>
              You&apos;re All Clear
            </Typography>
            <Typography
              variant="body"
              align="center"
              color={Colors.zinc500}
              style={styles.emptySubtitle}
            >
              Enjoy your time off, add a new task manually, or let AETHER schedule something for you.
            </Typography>
            <AnimatedPressable onPress={() => setModalVisible(true)} scaleTo={0.95} style={[styles.emptyActionButton, { backgroundColor: isDark ? Colors.white : Colors.black }]}>
              <Plus size={18} color={isDark ? Colors.black : Colors.white} strokeWidth={2.5} />
              <Typography variant="bodyBold" color={isDark ? Colors.black : Colors.white}>Add Task</Typography>
            </AnimatedPressable>
          </Animated.View>
        ) : null}
      />

      {/* Add Task Modal */}
      <AddTaskModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 130, // Space for floating toolbar
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  dateLabel: {
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  greetingText: {
    letterSpacing: -1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  progressCard: {
    marginBottom: 36,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressSubtitle: {
    marginTop: 6,
  },
  circularBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.lg,
  },
  progressTrack: {
    height: 8,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    marginTop: 24,
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    paddingHorizontal: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  emptyStateContainer: {
    paddingVertical: Spacing.huge * 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  emptyTitle: {
    marginBottom: Spacing.sm,
    letterSpacing: -0.5,
  },
  emptySubtitle: {
    maxWidth: 290,
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: Radius.pill,
  },
});
