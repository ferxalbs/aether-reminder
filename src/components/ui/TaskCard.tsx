import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check, Trash2, Clock, Sparkles } from 'lucide-react-native';
import { Task } from '@/types';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { Typography } from './Typography';
import { AnimatedPressable } from './AnimatedPressable';
import { IconButton } from './IconButton';
import { useSettingsStore } from '@/stores/settings.store';
import * as Haptics from 'expo-haptics';

export interface TaskCardProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onPress?: (task: Task) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onToggle,
  onDelete,
  onPress,
}) => {
  const theme = useSettingsStore((s) => s.theme);
  const isDark = theme === 'dark' || (theme === 'system' && true);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const checkScale = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(task.completed ? 1 : 0.85, { damping: 15 }) }],
    opacity: withTiming(task.completed ? 1 : 0.5, { duration: 180 }),
  }));

  const textOpacity = useAnimatedStyle(() => ({
    opacity: withTiming(task.completed ? 0.45 : 1, { duration: 200 }),
  }));

  const handleToggle = () => {
    if (hapticsEnabled) {
      Haptics.notificationAsync(
        task.completed
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success
      ).catch(() => {});
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

  return (
    <AnimatedPressable
      onPress={() => onPress?.(task)}
      scaleTo={0.98}
      style={[
        styles.card,
        {
          backgroundColor: isDark ? Colors.zinc900 : Colors.white,
          borderColor: task.completed
            ? isDark
              ? Colors.zinc800
              : Colors.zinc200
            : isDark
            ? Colors.zinc700
            : Colors.zinc300,
        },
      ]}
    >
      <View style={styles.row}>
        {/* Animated Checkbox */}
        <AnimatedPressable
          onPress={handleToggle}
          scaleTo={0.88}
          hapticStyle={Haptics.ImpactFeedbackStyle.Medium}
          style={[
            styles.checkbox,
            {
              borderColor: task.completed
                ? isDark
                  ? Colors.white
                  : Colors.black
                : Colors.zinc500,
              backgroundColor: task.completed
                ? isDark
                  ? Colors.white
                  : Colors.black
                : 'transparent',
            },
          ]}
        >
          <Animated.View style={checkScale}>
            {task.completed && (
              <Check
                size={14}
                color={isDark ? Colors.black : Colors.white}
                strokeWidth={3}
              />
            )}
          </Animated.View>
        </AnimatedPressable>

        {/* Task Content */}
        <Animated.View style={[styles.content, textOpacity]}>
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

          {/* Metadata Footer */}
          <View style={styles.metaRow}>
            {task.aiSuggested && (
              <View style={styles.badge}>
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
                  {task.dueDate}
                </Typography>
              </View>
            )}

            <View style={styles.priorityBadge}>
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

        {/* Delete action button */}
        <IconButton
          icon={<Trash2 size={16} color={Colors.zinc500} />}
          onPress={() => onDelete(task.id)}
          variant="ghost"
          size={36}
          hapticStyle={Haptics.ImpactFeedbackStyle.Light}
        />
      </View>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginVertical: Spacing.xs,
    borderWidth: 1,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    marginTop: 2,
  },
  content: {
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
    backgroundColor: Colors.zinc800,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    gap: 4,
  },
  badgeText: {
    color: Colors.white,
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
    backgroundColor: Colors.zinc800 + '33',
  },
});
