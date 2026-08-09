import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { CalendarDays, Flag, X } from 'lucide-react-native';
import type { TaskListItem, TaskPriority } from '@/domain/entities';
import { Colors, ControlTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { getLocalDateString } from '@/temporal/localCalendar';
import { isValidLocalDate, isValidLocalTime, resolveTomorrow } from '@/temporal/resolve';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { runTaskMutation } from '@/lib/taskMutation';
import { Typography } from './Typography';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Picker } from './Picker';
import { Sheet } from './Sheet';
import { TextField } from './TextField';
import { AnimatedPressable } from './AnimatedPressable';

type EditorMode = 'create' | 'edit';
type ScheduleMode = 'today' | 'tomorrow' | 'custom' | 'none';

export interface TaskEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  mode?: EditorMode;
  task?: TaskListItem | null;
  initialTitle?: string;
}

function getScheduleMode(date: string | undefined, today: string, tomorrow: string): ScheduleMode {
  if (!date) return 'none';
  if (date === today) return 'today';
  if (date === tomorrow) return 'tomorrow';
  return 'custom';
}

function ScheduleChoice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const isDark = useIsDark();

  return (
    <AnimatedPressable
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="radio"
      accessibilityLabel={`Schedule: ${label}`}
      accessibilityState={{ selected }}
      style={[
        styles.scheduleChoice,
        {
          backgroundColor: selected
            ? isDark
              ? Colors.surfaceRaisedLight
              : Colors.brandInk
            : isDark
              ? 'rgba(255, 255, 255, 0.055)'
              : '#F1F4F8',
          borderColor: selected
            ? 'transparent'
            : isDark
              ? Colors.borderDark
              : Colors.borderLight,
        },
      ]}
    >
      <Typography
        variant="caption"
        color={
          selected
            ? isDark
              ? Colors.brandInk
              : Colors.white
            : isDark
              ? Colors.secondaryTextDark
              : Colors.secondaryTextLight
        }
        style={styles.scheduleChoiceLabel}
      >
        {label}
      </Typography>
    </AnimatedPressable>
  );
}

function TaskEditorForm({
  visible,
  onClose,
  mode = 'create',
  task = null,
  initialTitle = '',
}: TaskEditorSheetProps) {
  const isDark = useIsDark();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const today = useMemo(() => getLocalDateString(), []);
  const tomorrow = useMemo(() => resolveTomorrow().date, []);
  const createTask = useTasksUiStore((state) => state.createTask);
  const updateTask = useTasksUiStore((state) => state.updateTask);

  const [title, setTitle] = useState(() => task?.title ?? initialTitle);
  const [notes, setNotes] = useState(() => task?.notes ?? '');
  const [priority, setPriority] = useState<TaskPriority>(() => task?.priority ?? 'medium');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(() =>
    getScheduleMode(task?.dueDate, today, tomorrow)
  );
  const [dateText, setDateText] = useState(() => task?.dueDate ?? today);
  const [timeText, setTimeText] = useState(() => task?.dueTime ?? '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectSchedule = (nextMode: ScheduleMode) => {
    setScheduleMode(nextMode);
    setFormError(null);
    if (nextMode === 'today') setDateText(today);
    if (nextMode === 'tomorrow') setDateText(tomorrow);
    if (nextMode === 'none') {
      setDateText('');
      setTimeText('');
    }
  };

  const handleSave = () => {
    if (saving) return;
    const normalizedTitle = title.trim();
    const normalizedNotes = notes.trim();
    const normalizedDate = scheduleMode === 'today'
      ? today
      : scheduleMode === 'tomorrow'
        ? tomorrow
        : scheduleMode === 'none'
          ? null
          : dateText.trim();
    const normalizedTime = timeText.trim() || null;

    if (!normalizedTitle) {
      setFormError('Add a short title before saving.');
      return;
    }
    if (normalizedDate && !isValidLocalDate(normalizedDate)) {
      setFormError('Use a valid date in YYYY-MM-DD format.');
      return;
    }
    if (normalizedTime && !isValidLocalTime(normalizedTime)) {
      setFormError('Use a valid time in HH:MM format.');
      return;
    }

    setSaving(true);
    setFormError(null);
    const operation = mode === 'edit' && task
      ? updateTask(task.id, {
          title: normalizedTitle,
          notes: normalizedNotes || null,
          priority,
          dueDate: normalizedDate,
          dueTime: normalizedTime,
          dueTimezone: normalizedDate ? task.dueTimezone ?? null : null,
          dueSemantics: task.dueSemantics ?? 'floating',
        })
      : createTask({
          title: normalizedTitle,
          notes: normalizedNotes || undefined,
          priority,
          dueDate: normalizedDate,
          dueTime: normalizedTime,
          dueSemantics: 'floating',
          source: 'manual',
        });

    void runTaskMutation(
      () => operation,
      mode === 'edit' ? 'task-update' : 'task-create',
      setFormError,
    )
      .then((result) => {
        if (result.ok) onClose();
      })
      .finally(() => setSaving(false));
  };

  const textColor = isDark ? Colors.textDark : Colors.textLight;
  const secondaryTextColor = isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight;
  const titleLabel = mode === 'edit' ? 'Edit reminder' : 'New reminder';

  return (
    <Sheet
      visible={visible}
      onRequestClose={onClose}
      title={titleLabel}
      subtitle={mode === 'edit' ? 'Refine the details without losing your place.' : 'Capture the next step while it is fresh.'}
      accessibilityLabel={mode === 'edit' ? 'Edit reminder' : 'New reminder'}
      headerAction={(
        <IconButton
          icon={<X size={18} color={secondaryTextColor} />}
          onPress={onClose}
          accessibilityLabel={`Close ${mode === 'edit' ? 'edit' : 'new reminder'} dialog`}
          variant="ghost"
        />
      )}
      footer={(
        <Button
          label={mode === 'edit' ? 'Save changes' : 'Add Reminder'}
          onPress={handleSave}
          variant="primary"
          fullWidth
          loading={saving}
          disabled={!title.trim() || saving}
        />
      )}
      testID="task-editor-sheet"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <CalendarDays size={18} color={isDark ? Colors.brandCyan : Colors.brandBlue} />
            <Typography variant="caption" color={secondaryTextColor} style={styles.introCopy}>
              Stored locally. You can change the schedule or priority at any time.
            </Typography>
          </View>

          <TextField
            label="Title"
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              if (formError) setFormError(null);
            }}
            placeholder="What needs to be done?"
            autoFocus={visible && mode === 'create'}
            error={!title.trim() ? formError ?? undefined : undefined}
            accessibilityHint="A short description of the reminder"
          />

          <TextField
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Add details, links, or context…"
            multiline
            numberOfLines={3}
            leading={<Flag size={16} color={secondaryTextColor} />}
          />

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Typography variant="caption" color={textColor} style={styles.sectionLabel}>
                Schedule
              </Typography>
              <Typography variant="tiny" color={secondaryTextColor}>
                Local time
              </Typography>
            </View>
            <View style={styles.scheduleRow}>
              <ScheduleChoice label="Today" selected={scheduleMode === 'today'} onPress={() => selectSchedule('today')} />
              <ScheduleChoice label="Tomorrow" selected={scheduleMode === 'tomorrow'} onPress={() => selectSchedule('tomorrow')} />
              <ScheduleChoice label="Custom" selected={scheduleMode === 'custom'} onPress={() => selectSchedule('custom')} />
              <ScheduleChoice label="No date" selected={scheduleMode === 'none'} onPress={() => selectSchedule('none')} />
            </View>

            {scheduleMode !== 'none' ? (
              <View style={[styles.dateTimeRow, compact && styles.dateTimeRowCompact]}>
                {scheduleMode === 'custom' ? (
                  <TextField
                    label="Date"
                    value={dateText}
                    onChangeText={(value) => {
                      setDateText(value);
                      setScheduleMode('custom');
                      if (formError) setFormError(null);
                    }}
                    placeholder="YYYY-MM-DD"
                    keyboardType="numbers-and-punctuation"
                    containerStyle={styles.dateField}
                    helperText="Example: 2026-08-10"
                  />
                ) : (
                  <View style={styles.dateSummary}>
                    <Typography variant="tiny" color={secondaryTextColor}>DATE</Typography>
                    <Typography variant="bodyBold">{scheduleMode === 'today' ? today : tomorrow}</Typography>
                  </View>
                )}
                <TextField
                  label="Time (optional)"
                  value={timeText}
                  onChangeText={(value) => {
                    setTimeText(value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="HH:MM"
                  keyboardType="numbers-and-punctuation"
                  containerStyle={styles.timeField}
                  helperText="Leave empty for any time"
                />
              </View>
            ) : (
              <Typography variant="caption" color={secondaryTextColor} style={styles.noDateCopy}>
                This reminder will stay in your library without a scheduled date.
              </Typography>
            )}
          </View>

          <Picker<TaskPriority>
            label="Priority"
            value={priority}
            onValueChange={setPriority}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
          />

          {formError && title.trim() ? (
            <Typography
              variant="caption"
              color={isDark ? Colors.destructiveTextDark : Colors.destructiveTextLight}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {formError}
            </Typography>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

export function TaskEditorSheet(props: TaskEditorSheetProps) {
  const formKey = [
    props.visible ? 'open' : 'closed',
    props.mode ?? 'create',
    props.task?.id ?? 'new',
    props.initialTitle ?? '',
  ].join(':');

  return <TaskEditorForm key={formKey} {...props} />;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: ControlTokens.sheetHorizontalPadding,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  introCopy: {
    flex: 1,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontWeight: '700',
  },
  scheduleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  scheduleChoice: {
    minHeight: 40,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderCurve: 'continuous',
  },
  scheduleChoiceLabel: {
    fontWeight: '600',
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  dateTimeRowCompact: {
    flexDirection: 'column',
  },
  dateField: {
    flex: 1,
    minWidth: 150,
  },
  timeField: {
    flex: 1,
    minWidth: 150,
  },
  dateSummary: {
    flex: 1,
    minHeight: 70,
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(127, 145, 170, 0.10)',
  },
  noDateCopy: {
    paddingHorizontal: Spacing.xs,
  },
});
