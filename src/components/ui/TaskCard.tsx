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
        return { label: 'Med', color: isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight };
      case 'low':
        return { label: 'Low', color: isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight };
    }
  };

  const priorityTag = getPriorityTag();
  const cardStyle = [
    styles.card,
    {
      backgroundColor: isDark ? Colors.surfaceDark : Colors.surfaceLight,
      borderBottomColor: isDark ? Colors.borderDark : Colors.borderLight,
    },
  ];

  const taskDetails = (
    <Animated.View style={[styles.content, textOpacityStyle]}>
      <View style={styles.headerLine}>
        <Typography
          variant="bodyBold"
          color={isDark ? Colors.textDark : Colors.textLight}
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
          color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
          numberOfLines={1}
          style={styles.notesText}
        >
          {task.notes}
        </Typography>
      ) : null}

      <View style={styles.metaRow}>
        {task.aiSuggested && (
          <View style={[styles.badge, { borderColor: isDark ? Colors.borderDark : Colors.borderLight, backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight }]}>
            <Sparkles size={11} color={isDark ? Colors.white : Colors.black} />
            <Typography variant="tiny" color={isDark ? Colors.textDark : Colors.textLight} style={styles.badgeText}>
              AI Suggested
            </Typography>
          </View>
        )}

        {task.dueDate && (
          <View style={styles.dateMeta}>
            <Clock size={11} color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight} />
            <Typography variant="tiny" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.dateText}>
              {task.dueDate}{task.dueTime ? ` · ${task.dueTime}` : ''}
            </Typography>
          </View>
        )}

        <View
          style={[
            styles.priorityBadge,
            {
              backgroundColor: isDark
                ? Colors.surfaceRaisedDark
                : Colors.surfaceRaisedLight,
              borderColor: isDark ? Colors.borderDark : Colors.borderLight,
            },
          ]}
        >
          <Typography
            variant="tiny"
            color={priorityTag.color}
            style={{ fontWeight: '600' }}
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
                size={13}
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
        icon={<Trash2 size={16} color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight} />}
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxTouchTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    marginTop: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
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
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
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
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
});
