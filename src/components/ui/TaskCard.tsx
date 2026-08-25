import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Check, Trash2, Clock, Sparkles } from "lucide-react-native";
import type { TaskListItem } from "@/domain/entities";
import { Motion, Radius, Spacing } from "@/theme/tokens";
import { formatTaskSchedule } from "@/temporal/localCalendar";
import { useMotionPreset } from "@/motion";
import { useSemanticColors } from "@/theme/useSemanticColors";
import { Typography } from "./Typography";
import {
  AnimatedPressable,
  getMinimumTouchTargetHitSlop,
} from "./AnimatedPressable";
import { IconButton } from "./IconButton";
import { useSettingsStore } from "@/stores/settings.store";
import * as Haptics from "expo-haptics";
import { notificationAsync } from "@/lib/haptics";
import { reportNonFatalError } from "@/lib/nonFatalError";

export interface TaskCardProps {
  task: TaskListItem;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onPress?: (task: TaskListItem) => void;
}

export const TaskCard: React.FC<TaskCardProps> = React.memo(
  ({ task, onToggle, onDelete, onPress }) => {
    const colors = useSemanticColors();
    const scheduleLabel = formatTaskSchedule(task.dueDate, task.dueTime);
    const reduceMotion = useReducedMotion();
    const completePreset = useMotionPreset("task.complete");

    const completionScale = useSharedValue(task.completed ? 1 : 0.85);
    const completionOpacity = useSharedValue(task.completed ? 1 : 0.5);
    const contentOpacity = useSharedValue(task.completed ? 0.45 : 1);

    useEffect(() => {
      const nextScale = task.completed ? 1 : 0.85;
      const nextCompletionOpacity = task.completed ? 1 : 0.5;
      const nextContentOpacity = task.completed ? 0.45 : 1;

      if (reduceMotion || completePreset.mode === "none") {
        completionScale.value = nextScale;
        completionOpacity.value = nextCompletionOpacity;
        contentOpacity.value = nextContentOpacity;
        return;
      }

      if (completePreset.mode === "spring") {
        completionScale.value = withSpring(nextScale, {
          damping: completePreset.damping,
          stiffness: completePreset.stiffness,
          mass: completePreset.mass,
          reduceMotion: ReduceMotion.Never,
        });
      } else {
        completionScale.value = withTiming(nextScale, {
          duration: completePreset.durationMs,
        });
      }
      completionOpacity.value = withTiming(nextCompletionOpacity, {
        duration: completePreset.durationMs,
      });
      contentOpacity.value = withTiming(nextContentOpacity, {
        duration: completePreset.durationMs,
      });
    }, [
      completePreset,
      reduceMotion,
      task.completed,
      completionScale,
      completionOpacity,
      contentOpacity,
    ]);

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
            : Haptics.NotificationFeedbackType.Success,
        ).catch((error: unknown) => {
          reportNonFatalError("haptics", error);
        });
      }
      onToggle(task.id);
    };

    const getPriorityTag = () => {
      switch (task.priority) {
        case "high":
          return { label: "High", color: colors.textPrimary };
        case "medium":
          return {
            label: "Med",
            color: colors.textSecondary,
          };
        case "low":
          return {
            label: "Low",
            color: colors.textTertiary,
          };
      }
    };

    const priorityTag = getPriorityTag();
    const cardStyle = [
      styles.card,
      {
        backgroundColor: "transparent",
      },
    ];

    const taskDetails = (
      <Animated.View style={[styles.content, textOpacityStyle]}>
        <View style={styles.headerLine}>
          <Typography
            variant="bodyBold"
            color={colors.textPrimary}
            style={[styles.titleText, task.completed && styles.strikethrough]}
            numberOfLines={2}
          >
            {task.title}
          </Typography>
        </View>

        {task.notes ? (
          <Typography
            variant="caption"
            color={colors.textSecondary}
            numberOfLines={1}
            style={styles.notesText}
          >
            {task.notes}
          </Typography>
        ) : null}

        <View style={styles.metaRow}>
          {task.aiSuggested && (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: colors.surfaceRaised,
                },
              ]}
            >
              <Sparkles size={11} color={colors.accent} />
              <Typography
                variant="tiny"
                color={colors.textPrimary}
                style={styles.badgeText}
              >
                AI Suggested
              </Typography>
            </View>
          )}

          {scheduleLabel && (
            <View style={styles.dateMeta}>
              <Clock size={11} color={colors.textTertiary} />
              <Typography
                variant="tiny"
                color={colors.textSecondary}
                style={styles.dateText}
              >
                {scheduleLabel}
              </Typography>
            </View>
          )}

          <View
            style={[
              styles.priorityBadge,
              {
                backgroundColor: colors.surfaceRaised,
              },
            ]}
          >
            <Typography
              variant="tiny"
              color={priorityTag.color}
              style={{ fontWeight: "600" }}
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
          accessibilityLabel={`Mark ${task.title} as ${task.completed ? "incomplete" : "complete"}`}
          accessibilityState={{ checked: task.completed }}
          android_ripple={{ color: colors.ripple, foreground: true }}
          hitSlop={getMinimumTouchTargetHitSlop(20, 20, Platform.OS)}
          interactionRadius={Radius.sm}
          minimumTouchTarget={false}
          style={styles.checkboxTouchTarget}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: task.completed
                  ? colors.accent
                  : colors.borderDefault,
                backgroundColor: task.completed ? colors.accent : "transparent",
              },
            ]}
          >
            <Animated.View style={checkScaleStyle}>
              {task.completed && (
                <Check size={13} color={colors.onAccent} strokeWidth={3} />
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
        ) : (
          taskDetails
        )}

        {/* Delete action button */}
        <IconButton
          icon={<Trash2 size={16} color={colors.textTertiary} />}
          onPress={() => onDelete(task.id)}
          accessibilityLabel={`Delete ${task.title}`}
          variant="ghost"
          hapticStyle={Haptics.ImpactFeedbackStyle.Light}
        />
      </View>
    );

    return <View style={cardStyle}>{cardContent}</View>;
  },
);
TaskCard.displayName = "TaskCard";

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  checkboxTouchTarget: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
    marginTop: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
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
    flexDirection: "row",
    alignItems: "center",
  },
  titleText: {
    flex: 1,
  },
  strikethrough: {
    textDecorationLine: "line-through",
  },
  notesText: {
    marginTop: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    gap: 4,
  },
  badgeText: {
    fontWeight: "600",
  },
  dateMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    marginLeft: 2,
  },
  priorityBadge: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
});
