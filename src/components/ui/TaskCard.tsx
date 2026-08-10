import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check, Trash2, Clock, Sparkles } from 'lucide-react-native';
import type { TaskListItem } from '@/domain/entities';
import { Colors, Motion, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from './Typography';
import { AnimatedPressable } from './AnimatedPressable';
import { IconButton } from './IconButton';
import { useSettingsStore } from '@/stores/settings.store';
import * as Haptics from 'expo-haptics';
import { notificationAsync } from '@/lib/haptics';
import { reportNonFatalError } from '@/lib/nonFatalError';

export interface TaskCardProps {
  task: TaskListItem;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onPress?: (task: TaskListItem) => void;
}

export const TaskCard: React.FC<TaskCardProps> = React.memo(({
  task,
  onToggle,
  onDelete,
  onPress,
}) => {
  const isDark = useIsDark();
  const reduceMotion = useReducedMotion();

  const completionScale = useSharedValue(task.completed ? 1 : 0.85);
  const completionOpacity = useSharedValue(task.completed ? 1 : 0.5);
  const contentOpacity = useSharedValue(task.completed ? 0.45 : 1);

  useEffect(() => {
    const nextScale = task.completed ? 1 : 0.85;
    const nextCompletionOpacity = task.completed ? 1 : 0.5;
    const nextContentOpacity = task.completed ? 0.45 : 1;

    if (reduceMotion) {
      completionScale.value = nextScale;
      completionOpacity.value = nextCompletionOpacity;
      contentOpacity.value = nextContentOpacity;
      return;
    }

    completionScale.value = withSpring(nextScale, {
      ...Motion.cardSpring,
      reduceMotion: ReduceMotion.Never,
    });
    completionOpacity.value = withTiming(nextCompletionOpacity, {
      duration: Motion.reducedMotionDuration,
    });
    contentOpacity.value = withTiming(nextContentOpacity, {
      duration: Motion.reducedMotionDuration,
    });
  }, [reduceMotion, task.completed, completionScale, completionOpacity, contentOpacity]);

  const checkScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: completionScale.value }],
    opacity: completionOpacity.value,
  }));

  const textOpacityStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const handleToggle = () => {
    const hapticsEnabled = useSettingsStore.getState().hapticsEnabled;
    if (hapticsEnabled) {
      notificationAsync(
        task.completed
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success
      ).catch((error: unknown) => {
        reportNonFatalError('haptics', error);
      });
    }
    onToggle(task.id);
  };

  const getPriorityTag = () => {
    switch (task.priority) {
      case 'high':
        return { label: 'High', color: isDark ? Colors.white : Colors.black };
      case 'medium':
        return { label: 'Med', color: Colors.zinc400 };
      case 'low':
        return { label: 'Low', color: Colors.zinc500 };
    }
  };

  const priorityTag = getPriorityTag();
  const cardStyle = [
    styles.card,
    {
      backgroundColor: isDark ? Colors.surfaceDark : Colors.surfaceLight,
      borderBottomColor: task.completed
        ? isDark
          ? 'rgba(168, 181, 196, 0.16)'
          : 'rgba(99, 112, 132, 0.12)'
        : isDark
          ? Colors.borderDark
          : Colors.borderLight,
    },
  ];

  const taskDetails = (
    <Animated.View style={[styles.content, textOpacityStyle]}>
      <View style={styles.headerLine}>
        <Typography
          variant="bodyBold"
          style={[
            styles.titleText,
            task.completed && styles.strikethrough,
          ]}
          numberOfLines={2}
        >
          {task.title}
        </Typography>
      </View>

      {task.notes ? (
        <Typography
          variant="caption"
          color={Colors.zinc500}
          numberOfLines={1}
          style={styles.notesText}
        >
          {task.notes}
        </Typography>
      ) : null}

      <View style={styles.metaRow}>
        {task.aiSuggested && (
          <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.10)' }]}>
            <Sparkles size={11} color={isDark ? Colors.white : Colors.black} />
            <Typography variant="tiny" style={styles.badgeText}>
              AI Suggested
            </Typography>
          </View>
        )}

        {task.dueDate && (
          <View style={styles.dateMeta}>
            <Clock size={11} color={Colors.zinc500} />
            <Typography variant="tiny" color={Colors.zinc500} style={styles.dateText}>
              {task.dueDate}{task.dueTime ? ` · ${task.dueTime}` : ''}
            </Typography>
          </View>
        )}

        <View
          style={[
            styles.priorityBadge,
            {
              backgroundColor: isDark
                ? Colors.priorityBadgeBackgroundDark
                : Colors.priorityBadgeBackgroundLight,
            },
          ]}
        >
          <Typography
            variant="tiny"
            color={priorityTag.color}
            style={{ fontWeight: '700' }}
          >
            {priorityTag.label}
          </Typography>
        </View>
      </View>
    </Animated.View>
  );

  const cardContent = (
    <View style={styles.row}>
      {/* Animated Checkbox */}
      <AnimatedPressable
        onPress={handleToggle}
        scaleTo={0.88}
        hapticStyle={null}
        accessibilityRole="checkbox"
        accessibilityLabel={`Mark ${task.title} as ${task.completed ? 'incomplete' : 'complete'}`}
        accessibilityState={{ checked: task.completed }}
        style={styles.checkboxTouchTarget}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: task.completed
                ? isDark
                  ? Colors.white
                  : Colors.black
                : isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight,
              backgroundColor: task.completed
                ? isDark ? Colors.white : Colors.black
                : 'transparent',
            },
          ]}
        >
          <Animated.View style={checkScaleStyle}>
            {task.completed && (
              <Check
                size={14}
                color={isDark ? Colors.black : Colors.white}
                strokeWidth={3}
              />
            )}
          </Animated.View>
        </View>
      </AnimatedPressable>

      {onPress ? (
        <AnimatedPressable
          onPress={() => onPress(task)}
          accessibilityRole="button"
          accessibilityLabel={`Open task ${task.title}`}
          accessibilityHint="Opens task details"
          scaleTo={Motion.cardPressScale}
          style={styles.contentPressable}
        >
          {taskDetails}
        </AnimatedPressable>
      ) : taskDetails}

      {/* Delete action button */}
      <IconButton
        icon={<Trash2 size={16} color={Colors.zinc500} />}
        onPress={() => onDelete(task.id)}
        accessibilityLabel={`Delete ${task.title}`}
        variant="ghost"
        hapticStyle={Haptics.ImpactFeedbackStyle.Light}
      />
    </View>
  );

  return <View style={cardStyle}>{cardContent}</View>;
});
TaskCard.displayName = 'TaskCard';

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxTouchTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  contentPressable: {
    flex: 1,
    marginRight: Spacing.sm,
    borderRadius: Radius.md,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleText: {
    flex: 1,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  notesText: {
    marginTop: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    gap: 4,
  },
  badgeText: {
    fontWeight: '600',
  },
  dateMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    marginLeft: 2,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
});
