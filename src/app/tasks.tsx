import React, { useCallback, useMemo } from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { TaskCard } from '@/components/ui/TaskCard';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { getLocalDateString } from '@/temporal/localCalendar';
import { useAssistantSurface } from '@/components/assistant/AssistantHost';

export default function TasksScreen() {
  const isDark = useIsDark();
  const upcomingTasks = useTasksUiStore((state) => state.upcomingTasks);
  const status = useTasksUiStore((state) => state.status);
  const error = useTasksUiStore((state) => state.error);
  const refreshUpcoming = useTasksUiStore((state) => state.refreshUpcoming);
  const toggleTask = useTasksUiStore((state) => state.toggleTask);
  const softDeleteTask = useTasksUiStore((state) => state.softDeleteTask);

  const assistantContext = useMemo(
    () => ({
      surface: 'upcoming',
      selectedDate: getLocalDateString(),
      visibleTaskIds: upcomingTasks.map((task) => task.id),
      locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      invocationSource: 'app' as const,
    }),
    [upcomingTasks]
  );
  useAssistantSurface(assistantContext);

  useFocusEffect(
    useCallback(() => {
      void refreshUpcoming();
    }, [refreshUpcoming])
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? Colors.black : Colors.zinc50 }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Typography variant="caption" color={Colors.zinc500}>UPCOMING</Typography>
          <Typography variant="display">Tasks</Typography>
          <Typography variant="body" color={Colors.zinc500} style={styles.subtitle}>
            Keep the next few steps in view.
          </Typography>
        </View>
        {error ? <Typography variant="caption" color={Colors.zinc500} style={styles.error}>{error}</Typography> : null}
        {upcomingTasks.length > 0 ? (
          upcomingTasks.map((task) => (
            <TaskCard key={task.id} task={task} onToggle={(id) => void toggleTask(id)} onDelete={(id) => void softDeleteTask(id)} />
          ))
        ) : status !== 'loading' ? (
          <View style={styles.emptyState}>
            <Typography variant="headline" align="center">Nothing scheduled.</Typography>
            <Typography variant="body" color={Colors.zinc500} align="center" style={styles.emptyCopy}>
              Add a task or ask AETHER to plan the next step.
            </Typography>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 124 },
  header: { marginBottom: Spacing.xl },
  subtitle: { marginTop: Spacing.xs },
  error: { marginBottom: Spacing.sm },
  emptyState: { paddingVertical: Spacing.huge, alignItems: 'center' },
  emptyCopy: { maxWidth: 280, textAlign: 'center', marginTop: Spacing.xs, lineHeight: 22 },
});
