import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { CalendarDays, Flag, Minus, Plus, Repeat2, X } from 'lucide-react-native';
import type { RecurrenceFrequency, RecurrenceMode, TaskListItem, TaskPriority } from '@/domain/entities';
import { Colors, ControlTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { getDeviceTimeZone, getLocalDateString, getLocalTimeString } from '@/temporal/localCalendar';
import { isValidLocalDate } from '@/temporal/resolve';
import { addLocalCalendarDays } from '@/temporal/recurrence';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { runTaskMutation } from '@/lib/taskMutation';
import { Typography } from './Typography';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Picker } from './Picker';
import { Sheet } from './Sheet';
import { TextField } from './TextField';
import { AnimatedPressable } from './AnimatedPressable';
import { NativeDateTimeControl } from './NativeDateTimeControl';
import {
  applyRepeatPreset,
  buildRecurrenceDraft,
  createRecurrenceEditorState,
  getSchedulePreset,
  getTimePreset,
  normalizeRecurrenceStateForDate,
  timeForPreset,
  toggleWeekday,
  type RecurrenceEditorState,
  type RepeatPreset,
  type SchedulePreset,
  type TimePreset,
} from './taskEditorSchedule';

type EditorMode = 'create' | 'edit';

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' },
] as const;

export interface TaskEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  mode?: EditorMode;
  task?: TaskListItem | null;
  initialTitle?: string;
}

function localPickerDate(dateText: string, timeText: string | null = null): Date {
  const [year, month, day] = dateText.split('-').map(Number);
  const [hour, minute] = (timeText ?? '09:00').split(':').map(Number);
  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isFinite(value.getTime()) ? value : new Date();
}

function ChoicePill({
  label,
  selected,
  onPress,
  group,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  group: string;
}) {
  const isDark = useIsDark();
  return (
    <AnimatedPressable
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="radio"
      accessibilityLabel={`${group}: ${label}`}
      accessibilityState={{ selected }}
      style={[
        styles.choice,
        {
          backgroundColor: selected
            ? isDark ? Colors.surfaceRaisedLight : Colors.brandInk
            : isDark ? 'rgba(255, 255, 255, 0.055)' : '#F1F4F8',
          borderColor: selected ? 'transparent' : isDark ? Colors.borderDark : Colors.borderLight,
        },
      ]}
    >
      <Typography
        variant="caption"
        color={selected ? (isDark ? Colors.brandInk : Colors.white) : (isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight)}
        style={styles.choiceLabel}
      >
        {label}
      </Typography>
    </AnimatedPressable>
  );
}

function NumberStepper({
  label,
  value,
  min = 1,
  max = 999,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const isDark = useIsDark();
  const secondary = isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight;
  return (
    <View style={styles.stepperBlock}>
      <Typography variant="caption" color={isDark ? Colors.zinc300 : Colors.zinc700}>{label}</Typography>
      <View style={[styles.stepper, { borderColor: isDark ? Colors.glassBorderDark : Colors.glassBorderLight }]}>
        <IconButton
          icon={<Minus size={16} color={secondary} />}
          onPress={() => onChange(Math.max(min, value - 1))}
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          variant="ghost"
        />
        <Typography variant="bodyBold" align="center" style={styles.stepperValue}>{value}</Typography>
        <IconButton
          icon={<Plus size={16} color={secondary} />}
          onPress={() => onChange(Math.min(max, value + 1))}
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          variant="ghost"
        />
      </View>
    </View>
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
  const deviceTimezone = useMemo(() => getDeviceTimeZone() ?? null, []);
  const createTask = useTasksUiStore((state) => state.createTask);
  const createTaskWithRecurrence = useTasksUiStore((state) => state.createTaskWithRecurrence);
  const saveTaskEditor = useTasksUiStore((state) => state.saveTaskEditor);
  const getRecurrenceRule = useTasksUiStore((state) => state.getRecurrenceRule);

  const initialDate = task?.dueDate ?? today;
  const [title, setTitle] = useState(() => task?.title ?? initialTitle);
  const [notes, setNotes] = useState(() => task?.notes ?? '');
  const [priority, setPriority] = useState<TaskPriority>(() => task?.priority ?? 'medium');
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>(() =>
    getSchedulePreset(task?.dueDate, today)
  );
  const [dateText, setDateText] = useState(initialDate);
  const [timePreset, setTimePreset] = useState<TimePreset>(() => getTimePreset(task?.dueTime));
  const [timeText, setTimeText] = useState<string | null>(() => task?.dueTime ?? null);
  const [recurrence, setRecurrence] = useState<RecurrenceEditorState>(() =>
    createRecurrenceEditorState(null, initialDate)
  );
  const [recurrenceLoading, setRecurrenceLoading] = useState(mode === 'edit' && task != null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || !task) {
      setRecurrenceLoading(false);
      return;
    }
    let cancelled = false;
    setRecurrenceLoading(true);
    void getRecurrenceRule(task.id)
      .then((rule) => {
        if (cancelled) return;
        setRecurrence(createRecurrenceEditorState(rule, task.dueDate ?? today));
      })
      .catch(() => {
        if (!cancelled) setFormError('Repeat settings could not be loaded. Try reopening this reminder.');
      })
      .finally(() => {
        if (!cancelled) setRecurrenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getRecurrenceRule, mode, task, today]);

  const setDueDate = (nextDate: string) => {
    setDateText(nextDate);
    setSchedulePreset(getSchedulePreset(nextDate, today));
    setRecurrence((current) => normalizeRecurrenceStateForDate(current, nextDate));
    setFormError(null);
  };

  const selectSchedule = (nextPreset: SchedulePreset) => {
    setFormError(null);
    setSchedulePreset(nextPreset);
    if (nextPreset === 'today') setDueDate(today);
    if (nextPreset === 'tomorrow') setDueDate(addLocalCalendarDays(today, 1));
    if (nextPreset === 'next_week') setDueDate(addLocalCalendarDays(today, 7));
    if (nextPreset === 'custom' && !dateText) setDueDate(today);
    if (nextPreset === 'none') {
      setDateText('');
      setTimePreset('any');
      setTimeText(null);
      setRecurrence((current) => ({ ...current, preset: 'none' }));
    }
  };

  const selectTime = (nextPreset: TimePreset) => {
    setTimePreset(nextPreset);
    setTimeText(timeForPreset(nextPreset, timeText));
    setFormError(null);
  };

  const selectRepeat = (preset: RepeatPreset) => {
    let effectiveDate = dateText;
    if (!effectiveDate) {
      effectiveDate = today;
      setDateText(today);
      setSchedulePreset('today');
    }
    setRecurrence((current) => applyRepeatPreset(current, preset, effectiveDate));
    setFormError(null);
  };

  const setCustomFrequency = (frequency: RecurrenceFrequency) => {
    setRecurrence((current) => {
      const base = { ...current, preset: 'custom' as const, frequency };
      return applyRepeatPreset(base, 'custom', dateText || today);
    });
  };

  const handleSave = () => {
    if (saving || recurrenceLoading) return;
    const normalizedTitle = title.trim();
    const normalizedNotes = notes.trim();
    const normalizedDate = schedulePreset === 'none' ? null : dateText;
    const normalizedTime = normalizedDate ? timeText : null;

    if (!normalizedTitle) {
      setFormError('Add a short title before saving.');
      return;
    }
    if (normalizedDate && !isValidLocalDate(normalizedDate)) {
      setFormError('Choose a valid date.');
      return;
    }
    if (recurrence.preset !== 'none' && !normalizedDate) {
      setFormError('Recurring reminders require a scheduled date.');
      return;
    }
    if (recurrence.endMode === 'date') {
      if (!recurrence.endDate || !isValidLocalDate(recurrence.endDate)) {
        setFormError('Choose a valid repeat end date.');
        return;
      }
      if (normalizedDate && recurrence.endDate < normalizedDate) {
        setFormError('Repeat end date must be on or after the first occurrence.');
        return;
      }
    }

    const recurrenceDraft = normalizedDate
      ? buildRecurrenceDraft(recurrence, normalizedDate, task?.dueTimezone ?? deviceTimezone)
      : null;
    const taskFields = {
      title: normalizedTitle,
      notes: normalizedNotes || null,
      priority,
      dueDate: normalizedDate,
      dueTime: normalizedTime,
      dueTimezone: normalizedDate ? task?.dueTimezone ?? deviceTimezone : null,
      dueSemantics: task?.dueSemantics ?? 'floating' as const,
    };

    setSaving(true);
    setFormError(null);
    const operation = mode === 'edit' && task
      ? saveTaskEditor(task.id, { task: taskFields, recurrence: recurrenceDraft })
      : recurrenceDraft && normalizedDate
        ? createTaskWithRecurrence({
            title: normalizedTitle,
            notes: normalizedNotes || undefined,
            priority,
            dueDate: normalizedDate,
            dueTime: normalizedTime,
            dueTimezone: deviceTimezone,
            dueSemantics: 'floating',
            source: 'manual',
            recurrence: recurrenceDraft,
          })
        : createTask({
            title: normalizedTitle,
            notes: normalizedNotes || undefined,
            priority,
            dueDate: normalizedDate,
            dueTime: normalizedTime,
            dueTimezone: normalizedDate ? deviceTimezone : null,
            dueSemantics: 'floating',
            source: 'manual',
          });

    void runTaskMutation(
      () => operation,
      mode === 'edit' ? 'task-editor-save' : recurrenceDraft ? 'task-create-recurring' : 'task-create',
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
  const pickerDate = localPickerDate(dateText || today, timeText);
  const endPickerDate = localPickerDate(recurrence.endDate ?? dateText || today);

  return (
    <Sheet
      visible={visible}
      onRequestClose={onClose}
      title={titleLabel}
      subtitle={mode === 'edit' ? 'Refine the schedule without losing your place.' : 'Capture it now. AETHER handles the calendar locally.'}
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
          disabled={!title.trim() || saving || recurrenceLoading}
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
              Stored locally. Date, time, and repeat rules work without AI or network access.
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
              <Typography variant="caption" color={textColor} style={styles.sectionLabel}>Date</Typography>
              <Typography variant="tiny" color={secondaryTextColor}>Local calendar</Typography>
            </View>
            <View style={styles.choiceRow}>
              <ChoicePill label="Today" group="Date" selected={schedulePreset === 'today'} onPress={() => selectSchedule('today')} />
              <ChoicePill label="Tomorrow" group="Date" selected={schedulePreset === 'tomorrow'} onPress={() => selectSchedule('tomorrow')} />
              <ChoicePill label="Next week" group="Date" selected={schedulePreset === 'next_week'} onPress={() => selectSchedule('next_week')} />
              <ChoicePill label="Pick date" group="Date" selected={schedulePreset === 'custom'} onPress={() => selectSchedule('custom')} />
              <ChoicePill label="No date" group="Date" selected={schedulePreset === 'none'} onPress={() => selectSchedule('none')} />
            </View>
            {schedulePreset === 'custom' ? (
              <NativeDateTimeControl
                label="Date"
                mode="date"
                value={pickerDate}
                onChange={(value) => setDueDate(getLocalDateString(value))}
                accessibilityLabel="Choose reminder date"
                testID="task-editor-date-picker"
              />
            ) : schedulePreset !== 'none' ? (
              <Typography variant="caption" color={secondaryTextColor} style={styles.summaryCopy}>
                {dateText}
              </Typography>
            ) : (
              <Typography variant="caption" color={secondaryTextColor} style={styles.summaryCopy}>
                This reminder stays in All without a scheduled date.
              </Typography>
            )}
          </View>

          {schedulePreset !== 'none' ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Typography variant="caption" color={textColor} style={styles.sectionLabel}>Time</Typography>
                <Typography variant="tiny" color={secondaryTextColor}>Optional</Typography>
              </View>
              <View style={styles.choiceRow}>
                <ChoicePill label="Any time" group="Time" selected={timePreset === 'any'} onPress={() => selectTime('any')} />
                <ChoicePill label="Morning" group="Time" selected={timePreset === 'morning'} onPress={() => selectTime('morning')} />
                <ChoicePill label="Afternoon" group="Time" selected={timePreset === 'afternoon'} onPress={() => selectTime('afternoon')} />
                <ChoicePill label="Evening" group="Time" selected={timePreset === 'evening'} onPress={() => selectTime('evening')} />
                <ChoicePill label="Pick time" group="Time" selected={timePreset === 'custom'} onPress={() => selectTime('custom')} />
              </View>
              {timePreset === 'custom' ? (
                <NativeDateTimeControl
                  label="Time"
                  mode="time"
                  value={pickerDate}
                  onChange={(value) => {
                    setTimeText(getLocalTimeString(value));
                    setTimePreset('custom');
                  }}
                  accessibilityLabel="Choose reminder time"
                  testID="task-editor-time-picker"
                />
              ) : timeText ? (
                <Typography variant="caption" color={secondaryTextColor} style={styles.summaryCopy}>{timeText}</Typography>
              ) : null}
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.inlineTitle}>
                <Repeat2 size={16} color={isDark ? Colors.brandCyan : Colors.brandBlue} />
                <Typography variant="caption" color={textColor} style={styles.sectionLabel}>Repeat</Typography>
              </View>
              {recurrenceLoading ? <Typography variant="tiny" color={secondaryTextColor}>Loading…</Typography> : null}
            </View>
            <View style={styles.choiceRow}>
              <ChoicePill label="Never" group="Repeat" selected={recurrence.preset === 'none'} onPress={() => selectRepeat('none')} />
              <ChoicePill label="Daily" group="Repeat" selected={recurrence.preset === 'daily'} onPress={() => selectRepeat('daily')} />
              <ChoicePill label="Weekdays" group="Repeat" selected={recurrence.preset === 'weekdays'} onPress={() => selectRepeat('weekdays')} />
              <ChoicePill label="Weekly" group="Repeat" selected={recurrence.preset === 'weekly'} onPress={() => selectRepeat('weekly')} />
              <ChoicePill label="Monthly" group="Repeat" selected={recurrence.preset === 'monthly'} onPress={() => selectRepeat('monthly')} />
              <ChoicePill label="Custom" group="Repeat" selected={recurrence.preset === 'custom'} onPress={() => selectRepeat('custom')} />
            </View>

            {recurrence.preset !== 'none' ? (
              <View style={styles.repeatDetails}>
                {recurrence.preset === 'custom' ? (
                  <View style={[styles.twoColumn, compact && styles.twoColumnCompact]}>
                    <Picker<RecurrenceFrequency>
                      label="Frequency"
                      value={recurrence.frequency}
                      onValueChange={setCustomFrequency}
                      options={[
                        { value: 'daily', label: 'Daily' },
                        { value: 'weekly', label: 'Weekly' },
                        { value: 'monthly', label: 'Monthly' },
                        { value: 'yearly', label: 'Yearly' },
                      ]}
                      containerStyle={styles.flexField}
                    />
                    <NumberStepper
                      label="Every"
                      value={recurrence.interval}
                      max={99}
                      onChange={(interval) => setRecurrence((current) => ({ ...current, interval }))}
                    />
                  </View>
                ) : null}

                {recurrence.preset === 'custom' && recurrence.frequency === 'weekly' ? (
                  <View style={styles.weekdayBlock}>
                    <Typography variant="caption" color={isDark ? Colors.zinc300 : Colors.zinc700}>Days</Typography>
                    <View style={styles.weekdayRow}>
                      {WEEKDAY_OPTIONS.map((option) => (
                        <ChoicePill
                          key={option.value}
                          label={option.label}
                          group="Weekday"
                          selected={recurrence.weekdays.includes(option.value)}
                          onPress={() => setRecurrence((current) => ({
                            ...current,
                            weekdays: toggleWeekday(current.weekdays, option.value),
                          }))}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {recurrence.preset === 'custom' && recurrence.frequency === 'monthly' ? (
                  <NumberStepper
                    label="Day of month"
                    value={recurrence.monthDays[0] ?? Number((dateText || today).slice(-2))}
                    min={1}
                    max={31}
                    onChange={(day) => setRecurrence((current) => ({ ...current, monthDays: [day] }))}
                  />
                ) : null}

                <Picker<RecurrenceMode>
                  label="Repeat timing"
                  value={recurrence.mode}
                  onValueChange={(value) => setRecurrence((current) => ({ ...current, mode: value }))}
                  options={[
                    { value: 'fixed', label: 'On schedule' },
                    { value: 'after_completion', label: 'After completion' },
                  ]}
                  helperText={recurrence.mode === 'fixed' ? 'Keeps the calendar cadence.' : 'Counts the interval from when you complete it.'}
                />

                <Picker<'never' | 'date' | 'count'>
                  label="Ends"
                  value={recurrence.endMode}
                  onValueChange={(value) => setRecurrence((current) => ({ ...current, endMode: value }))}
                  options={[
                    { value: 'never', label: 'Never' },
                    { value: 'date', label: 'On date' },
                    { value: 'count', label: 'After count' },
                  ]}
                />

                {recurrence.endMode === 'date' ? (
                  <NativeDateTimeControl
                    label="End date"
                    mode="date"
                    value={endPickerDate}
                    minimumDate={localPickerDate(dateText || today)}
                    onChange={(value) => setRecurrence((current) => ({
                      ...current,
                      endDate: getLocalDateString(value),
                    }))}
                    accessibilityLabel="Choose repeat end date"
                    testID="task-editor-repeat-end-picker"
                  />
                ) : null}

                {recurrence.endMode === 'count' ? (
                  <NumberStepper
                    label="Occurrences"
                    value={recurrence.maxOccurrences ?? 2}
                    min={1}
                    max={999}
                    onChange={(maxOccurrences) => setRecurrence((current) => ({ ...current, maxOccurrences }))}
                  />
                ) : null}
              </View>
            ) : null}
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
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: ControlTokens.sheetHorizontalPadding,
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  introCopy: { flex: 1 },
  section: { gap: Spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: { fontWeight: '700' },
  inlineTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  choice: {
    minHeight: 40,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderCurve: 'continuous',
  },
  choiceLabel: { fontWeight: '600' },
  summaryCopy: { paddingHorizontal: Spacing.xs },
  repeatDetails: {
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  twoColumn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  twoColumnCompact: { flexDirection: 'column' },
  flexField: { flex: 1, minWidth: 150 },
  stepperBlock: {
    flex: 1,
    minWidth: 150,
    gap: ControlTokens.fieldLabelGap,
  },
  stepper: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: ControlTokens.borderWidth,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.xs,
  },
  stepperValue: { minWidth: 42 },
  weekdayBlock: { gap: ControlTokens.fieldLabelGap },
  weekdayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
});
