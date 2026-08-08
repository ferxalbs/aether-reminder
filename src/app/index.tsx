import { useCallback, useState } from 'react';
import { StyleSheet, View, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Plus, Sparkles, CheckCircle2 } from 'lucide-react-native';
import { Colors, Spacing, Radius } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { TaskCard } from '@/components/ui/TaskCard';
import { IconButton } from '@/components/ui/IconButton';
import { Card } from '@/components/ui/Card';
import { AddTaskModal } from '@/components/ui/AddTaskModal';
import { FloatingToolbar } from '@/components/ui/FloatingToolbar';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import * as Haptics from 'expo-haptics';

export default function HomeScreen() {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const isDark = useIsDark();

  const todayTasks = useTasksUiStore((s) => s.todayTasks);
  const status = useTasksUiStore((s) => s.status);
  const error = useTasksUiStore((s) => s.error);
  const refreshToday = useTasksUiStore((s) => s.refreshToday);
  const toggleTask = useTasksUiStore((s) => s.toggleTask);
  const softDeleteTask = useTasksUiStore((s) => s.softDeleteTask);

  useFocusEffect(
    useCallback(() => {
      void refreshToday();
    }, [refreshToday])
  );

  const completedCount = todayTasks.filter((t) => t.completed).length;
  const totalCount = todayTasks.length;
  const progressRatio = totalCount > 0 ? completedCount / totalCount : 0;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Bar */}
        <View style={styles.header}>
          <View>
            <Typography variant="caption" color={Colors.zinc500}>
              {formattedDate.toUpperCase()}
            </Typography>
            <Typography variant="display" style={styles.greetingText}>
              {getGreeting()}
            </Typography>
          </View>
          <View style={styles.headerActions}>
            <IconButton
              icon={<Sparkles size={18} color={isDark ? Colors.white : Colors.black} />}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                router.push('/ai');
              }}
              variant="glass"
              size={44}
            />
            <IconButton
              icon={<Plus size={20} color={isDark ? Colors.black : Colors.white} />}
              onPress={() => setModalVisible(true)}
              variant="solid"
              size={44}
            />
          </View>
        </View>

        {/* Progress Card */}
        <Card variant="elevated" style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View style={styles.progressTitleRow}>
              <CheckCircle2 size={16} color={isDark ? Colors.white : Colors.black} />
              <Typography variant="bodyBold">{"Today's Momentum"}</Typography>
            </View>
            <Typography variant="caption" color={Colors.zinc500}>
              {completedCount} of {totalCount} completed
            </Typography>
          </View>

          {/* Progress Bar track */}
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: isDark ? Colors.zinc800 : Colors.zinc200 },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(progressRatio * 100)}%`,
                  backgroundColor: isDark ? Colors.white : Colors.black,
                },
              ]}
            />
          </View>
        </Card>

        {/* Tasks Section Header */}
        <View style={styles.sectionHeader}>
          <Typography variant="title">Daily Focus</Typography>
          <Typography variant="caption" color={Colors.zinc500}>
            {status === 'loading'
              ? 'Loading…'
              : `${todayTasks.length} ${todayTasks.length === 1 ? 'task' : 'tasks'}`}
          </Typography>
        </View>

        {error ? (
          <Typography variant="caption" color={Colors.zinc500} style={{ marginBottom: Spacing.sm }}>
            {error}
          </Typography>
        ) : null}

        {/* Task List */}
        {todayTasks.length > 0 ? (
          todayTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={(id) => {
                void toggleTask(id);
              }}
              onDelete={(id) => {
                void softDeleteTask(id);
              }}
            />
          ))
        ) : status !== 'loading' ? (
          <View style={styles.emptyStateContainer}>
            <Typography variant="headline" align="center" style={styles.emptyTitle}>
              All Clear
            </Typography>
            <Typography
              variant="body"
              align="center"
              color={Colors.zinc500}
              style={styles.emptySubtitle}
            >
              No pending tasks for today. Tap the button below or use voice to capture your next goal.
            </Typography>
          </View>
        ) : null}
      </ScrollView>

      {/* Add Task Modal */}
      <AddTaskModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />

      {/* Floating Bottom Glass Toolbar */}
      <FloatingToolbar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 110, // Space for floating toolbar
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  greetingText: {
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  progressCard: {
    marginBottom: Spacing.xl,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  progressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  emptyStateContainer: {
    paddingVertical: Spacing.huge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    maxWidth: 280,
    lineHeight: 22,
  },
});
