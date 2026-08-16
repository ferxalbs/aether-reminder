import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import {
  ExternalLink,
  Flag,
  ImageIcon,
  Mic,
  Minus,
  Plus,
  Repeat2,
  X,
} from "lucide-react-native";
import type {
  RecurrenceFrequency,
  RecurrenceMode,
  TaskListItem,
  TaskPriority,
  TaskCaptureSource,
  UpdateTaskInput,
} from "@/domain/entities";
import { ControlTokens, Radius, Spacing } from "@/theme/tokens";
import { useSemanticColors } from "@/theme/useSemanticColors";
import {
  getDeviceTimeZone,
  getLocalDateString,
  getLocalTimeString,
} from "@/temporal/localCalendar";
import { isValidLocalDate } from "@/temporal/resolve";
import { addLocalCalendarDays } from "@/temporal/recurrence";
import { useTasksUiStore } from "@/stores/tasksUi.store";
import { runTaskMutation } from "@/lib/taskMutation";
import { Typography } from "./Typography";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Picker } from "./Picker";
import { Sheet } from "./Sheet";
import { TextField } from "./TextField";
import { AnimatedPressable } from "./AnimatedPressable";
import { NativeDateTimeControl } from "./NativeDateTimeControl";
import { useAssistantActions } from "@/components/assistant/AssistantHost";
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
} from "./taskEditorSchedule";

type EditorMode = "create" | "edit";

const WEEKDAY_OPTIONS = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 0, label: "S" },
] as const;

export interface TaskEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  mode?: EditorMode;
  task?: TaskListItem | null;
  initialTitle?: string;
}

function localPickerDate(
  dateText: string,
  timeText: string | null = null,
): Date {
  const [year, month, day] = dateText.split("-").map(Number);
  const [hour, minute] = (timeText ?? "09:00").split(":").map(Number);
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
  const colors = useSemanticColors();
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
            ? colors.accent
            : colors.surfaceRaised,
          borderColor: selected
            ? colors.accent
            : colors.borderDefault,
        },
      ]}
    >
      <Typography
        variant="caption"
        color={selected ? colors.onAccent : colors.textSecondary}
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
  const colors = useSemanticColors();
  return (
    <View style={styles.stepperBlock}>
      <Typography
        variant="caption"
        color={colors.textSecondary}
      >
        {label}
      </Typography>
      <View
        style={[
          styles.stepper,
          { borderColor: colors.borderDefault },
        ]}
      >
        <IconButton
          icon={<Minus size={16} color={colors.textSecondary} />}
          onPress={() => onChange(Math.max(min, value - 1))}
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          variant="ghost"
        />
        <Typography
          variant="bodyBold"
          align="center"
          style={styles.stepperValue}
        >
          {value}
        </Typography>
        <IconButton
          icon={<Plus size={16} color={colors.textSecondary} />}
          onPress={() => onChange(Math.min(max, value + 1))}
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          variant="ghost"
        />
      </View>
    </View>
  );
}

export function TaskEditorForm({
  visible,
  onClose,
  mode = "create",
  task,
  initialTitle = "",
}: TaskEditorSheetProps) {
  const { startVoiceAssistant } = useAssistantActions();
  const colors = useSemanticColors();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const today = useMemo(() => getLocalDateString(), []);
  const deviceTimezone = useMemo(() => getDeviceTimeZone() ?? null, []);
  const createTask = useTasksUiStore((state) => state.createTask);
  const createTaskWithRecurrence = useTasksUiStore(
    (state) => state.createTaskWithRecurrence,
  );
  const saveTaskEditor = useTasksUiStore((state) => state.saveTaskEditor);
  const getRecurrenceRule = useTasksUiStore((state) => state.getRecurrenceRule);
  const getCaptureSources = useTasksUiStore((state) => state.getCaptureSources);

  const initialDate = task?.dueDate ?? today;
  const [title, setTitle] = useState(() => task?.title ?? initialTitle);
  const [notes, setNotes] = useState(() => task?.notes ?? "");
  const [priority, setPriority] = useState<TaskPriority>(
    () => task?.priority ?? "medium",
  );
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>(() =>
    getSchedulePreset(task?.dueDate, today),
  );
  const [dateText, setDateText] = useState(initialDate);
  const [timePreset, setTimePreset] = useState<TimePreset>(() =>
    getTimePreset(task?.dueTime),
  );
  const [timeText, setTimeText] = useState<string | null>(
    () => task?.dueTime ?? null,
  );
  const [recurrence, setRecurrence] = useState<RecurrenceEditorState>(() =>
    createRecurrenceEditorState(null, initialDate),
  );
  const [recurrenceLoading, setRecurrenceLoading] = useState(
    mode === "edit" && task != null,
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [captureSources, setCaptureSources] = useState<TaskCaptureSource[]>([]);

  useEffect(() => {
    if (mode !== "edit" || !task) return;
    let cancelled = false;
    void getRecurrenceRule(task.id)
      .then((rule) => {
        if (cancelled) return;
        setRecurrence(createRecurrenceEditorState(rule, task.dueDate ?? today));
      })
      .catch(() => {
        if (!cancelled)
          setFormError(
            "Repeat settings could not be loaded. Try reopening this reminder.",
          );
      })
      .finally(() => {
        if (!cancelled) setRecurrenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getRecurrenceRule, mode, task, today]);

  const textColor = colors.textPrimary;
  const secondaryTextColor = colors.textSecondary;

  useEffect(() => {
    if (mode !== "edit" || !task) return;
    let cancelled = false;
    void getCaptureSources(task.id).then((sources) => {
      if (!cancelled) setCaptureSources(sources);
    });
    return () => {
      cancelled = true;
    };
  }, [getCaptureSources, mode, task]);

  const setDueDate = (nextDate: string) => {
    setDateText(nextDate);
    setSchedulePreset(getSchedulePreset(nextDate, today));
    setRecurrence((current) =>
      normalizeRecurrenceStateForDate(current, nextDate),
    );
    setFormError(null);
  };

  const selectSchedule = (nextPreset: SchedulePreset) => {
    setFormError(null);
    setSchedulePreset(nextPreset);
    if (nextPreset === "today") setDueDate(today);
    if (nextPreset === "tomorrow") setDueDate(addLocalCalendarDays(today, 1));
    if (nextPreset === "next_week") setDueDate(addLocalCalendarDays(today, 7));
    if (nextPreset === "custom" && !dateText) setDueDate(today);
    if (nextPreset === "none") {
      setDateText("");
      setTimePreset("any");
      setTimeText(null);
      setRecurrence((current) => ({ ...current, preset: "none" }));
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
      setSchedulePreset("today");
    }
    setRecurrence((current) =>
      applyRepeatPreset(current, preset, effectiveDate),
    );
    setFormError(null);
  };

  const setCustomFrequency = (frequency: RecurrenceFrequency) => {
    setRecurrence((current) => {
      const base = { ...current, preset: "custom" as const, frequency };
      return applyRepeatPreset(base, "custom", dateText || today);
    });
  };

  const handleSave = () => {
    if (saving || recurrenceLoading) return;
    const normalizedTitle = title.trim();
    const normalizedNotes = notes.trim();
    const normalizedDate = schedulePreset === "none" ? null : dateText;
    const normalizedTime = normalizedDate ? timeText : null;

    if (!normalizedTitle) {
      setFormError("Add a short title before saving.");
      return;
    }
    if (normalizedDate && !isValidLocalDate(normalizedDate)) {
      setFormError("Choose a valid date.");
      return;
    }
    if (recurrence.preset !== "none" && !normalizedDate) {
      setFormError("Recurring reminders require a scheduled date.");
      return;
    }
    if (recurrence.endMode === "date") {
      if (!recurrence.endDate || !isValidLocalDate(recurrence.endDate)) {
        setFormError("Choose a valid repeat end date.");
        return;
      }
      if (normalizedDate && recurrence.endDate < normalizedDate) {
        setFormError(
          "Repeat end date must be on or after the first occurrence.",
        );
        return;
      }
    }

    const recurrenceDraft = normalizedDate
      ? buildRecurrenceDraft(
          recurrence,
          normalizedDate,
          task?.dueTimezone ?? deviceTimezone,
        )
      : null;
    const taskFields: UpdateTaskInput = {
      title: normalizedTitle,
      notes: normalizedNotes || null,
      priority,
      dueDate: normalizedDate,
      dueTime: normalizedTime,
      dueTimezone: normalizedDate
        ? (task?.dueTimezone ?? deviceTimezone)
        : null,
      dueSemantics: task?.dueSemantics ?? "floating",
    };

    setSaving(true);
    setFormError(null);
    const operation =
      mode === "edit" && task
        ? saveTaskEditor(task.id, {
            task: taskFields,
            recurrence: recurrenceDraft,
          })
        : recurrenceDraft && normalizedDate
          ? createTaskWithRecurrence({
              title: normalizedTitle,
              notes: normalizedNotes || undefined,
              priority,
              dueDate: normalizedDate,
              dueTime: normalizedTime,
              dueTimezone: deviceTimezone,
              dueSemantics: "floating",
              source: "manual",
              recurrence: recurrenceDraft,
            })
          : createTask({
              title: normalizedTitle,
              notes: normalizedNotes || undefined,
              priority,
              dueDate: normalizedDate,
              dueTime: normalizedTime,
              dueTimezone: normalizedDate ? deviceTimezone : null,
              dueSemantics: "floating",
              source: "manual",
            });

    void runTaskMutation(
      () => operation,
      mode === "edit"
        ? "task-editor-save"
        : recurrenceDraft
          ? "task-create-recurring"
          : "task-create",
      setFormError,
    )
      .then((result) => {
        if (result.ok) onClose();
      })
      .finally(() => setSaving(false));
  };

  const titleLabel = mode === "edit" ? "Edit reminder" : "New reminder";
  const pickerDate = localPickerDate(dateText || today, timeText);
  const endPickerDate = localPickerDate(
    recurrence.endDate ?? (dateText || today),
  );

  return (
    <Sheet
      visible={visible}
      onRequestClose={onClose}
      title={titleLabel}
      subtitle={
        mode === "edit"
          ? "Refine the schedule without losing your place."
          : "Capture it now. AETHER handles the calendar locally."
      }
      accessibilityLabel={mode === "edit" ? "Edit reminder" : "New reminder"}
      headerAction={
        <View style={styles.headerActions}>
          {mode === "create" ? (
            <IconButton
              icon={<Mic size={18} color={secondaryTextColor} />}
              onPress={() => {
                onClose();
                startVoiceAssistant();
              }}
              accessibilityLabel="Switch to voice capture"
              accessibilityHint="Replaces this manual form with voice input"
              variant="ghost"
            />
          ) : null}
          <IconButton
            icon={<X size={18} color={secondaryTextColor} />}
            onPress={onClose}
            accessibilityLabel={`Close ${mode === "edit" ? "edit" : "new reminder"} dialog`}
            variant="ghost"
          />
        </View>
      }
      footer={
        <Button
          label={mode === "edit" ? "Save changes" : "Add Reminder"}
          onPress={handleSave}
          variant="primary"
          fullWidth
          loading={saving}
          disabled={!title.trim() || saving || recurrenceLoading}
        />
      }
      testID="task-editor-sheet"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <Typography
              variant="caption"
              color={secondaryTextColor}
              style={styles.introCopy}
            >
              {mode === "create"
                ? "Type the details below, or switch to voice from the microphone above."
                : "Changes are stored locally and keep the existing reminder history."}
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
            autoFocus={visible && mode === "create"}
            error={!title.trim() ? (formError ?? undefined) : undefined}
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

          {captureSources.length > 0 ? (
            <View
              style={styles.section}
              accessibilityLabel="Captured source context"
            >
              <Typography
                variant="caption"
                color={textColor}
                style={styles.sectionLabel}
              >
                Source
              </Typography>
              {captureSources.map((source) =>
                source.kind === "url" ? (
                  <Pressable
                    key={source.id}
                    accessibilityRole="link"
                    accessibilityLabel="Open captured web source"
                    onPress={() => void Linking.openURL(source.url)}
                    style={({ pressed }) => [
                      styles.sourceLink,
                      {
                        borderColor: colors.borderDefault,
                      },
                      pressed && styles.sourcePressed,
                    ]}
                  >
                    <ExternalLink size={18} color={secondaryTextColor} />
                    <Typography
                      variant="caption"
                      color={textColor}
                      numberOfLines={2}
                      style={styles.sourceText}
                    >
                      {source.url}
                    </Typography>
                  </Pressable>
                ) : (
                  <View
                    key={source.id}
                    accessible
                    accessibilityLabel={`Captured image${source.displayName ? `, ${source.displayName}` : ""}`}
                    style={[
                      styles.imageSource,
                      {
                        borderColor: colors.borderDefault,
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: source.assetRef }}
                      contentFit="cover"
                      style={styles.sourceImage}
                      accessibilityLabel="Captured source image"
                    />
                    <View style={styles.imageSourceLabel}>
                      <ImageIcon size={16} color={secondaryTextColor} />
                      <Typography
                        variant="caption"
                        color={secondaryTextColor}
                        numberOfLines={1}
                        style={styles.sourceText}
                      >
                        {source.displayName ?? "Captured image"}
                      </Typography>
                    </View>
                  </View>
                ),
              )}
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Typography
                variant="caption"
                color={textColor}
                style={styles.sectionLabel}
              >
                Date
              </Typography>
              <Typography variant="tiny" color={secondaryTextColor}>
                Local calendar
              </Typography>
            </View>
            <View style={styles.choiceRow}>
              <ChoicePill
                label="Today"
                group="Date"
                selected={schedulePreset === "today"}
                onPress={() => selectSchedule("today")}
              />
              <ChoicePill
                label="Tomorrow"
                group="Date"
                selected={schedulePreset === "tomorrow"}
                onPress={() => selectSchedule("tomorrow")}
              />
              <ChoicePill
                label="Next week"
                group="Date"
                selected={schedulePreset === "next_week"}
                onPress={() => selectSchedule("next_week")}
              />
              <ChoicePill
                label="Pick date"
                group="Date"
                selected={schedulePreset === "custom"}
                onPress={() => selectSchedule("custom")}
              />
              <ChoicePill
                label="No date"
                group="Date"
                selected={schedulePreset === "none"}
                onPress={() => selectSchedule("none")}
              />
            </View>
            {schedulePreset === "custom" ? (
              <NativeDateTimeControl
                label="Date"
                mode="date"
                value={pickerDate}
                onChange={(value) => setDueDate(getLocalDateString(value))}
                accessibilityLabel="Choose reminder date"
                testID="task-editor-date-picker"
              />
            ) : schedulePreset !== "none" ? (
              <Typography
                variant="caption"
                color={secondaryTextColor}
                style={styles.summaryCopy}
              >
                {dateText}
              </Typography>
            ) : (
              <Typography
                variant="caption"
                color={secondaryTextColor}
                style={styles.summaryCopy}
              >
                This reminder stays in All without a scheduled date.
              </Typography>
            )}
          </View>

          {schedulePreset !== "none" ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Typography
                  variant="caption"
                  color={textColor}
                  style={styles.sectionLabel}
                >
                  Time
                </Typography>
                <Typography variant="tiny" color={secondaryTextColor}>
                  Optional
                </Typography>
              </View>
              <View style={styles.choiceRow}>
                <ChoicePill
                  label="Any time"
                  group="Time"
                  selected={timePreset === "any"}
                  onPress={() => selectTime("any")}
                />
                <ChoicePill
                  label="Morning"
                  group="Time"
                  selected={timePreset === "morning"}
                  onPress={() => selectTime("morning")}
                />
                <ChoicePill
                  label="Afternoon"
                  group="Time"
                  selected={timePreset === "afternoon"}
                  onPress={() => selectTime("afternoon")}
                />
                <ChoicePill
                  label="Evening"
                  group="Time"
                  selected={timePreset === "evening"}
                  onPress={() => selectTime("evening")}
                />
                <ChoicePill
                  label="Pick time"
                  group="Time"
                  selected={timePreset === "custom"}
                  onPress={() => selectTime("custom")}
                />
              </View>
              {timePreset === "custom" ? (
                <NativeDateTimeControl
                  label="Time"
                  mode="time"
                  value={pickerDate}
                  onChange={(value) => {
                    setTimeText(getLocalTimeString(value));
                    setTimePreset("custom");
                  }}
                  accessibilityLabel="Choose reminder time"
                  testID="task-editor-time-picker"
                />
              ) : timeText ? (
                <Typography
                  variant="caption"
                  color={secondaryTextColor}
                  style={styles.summaryCopy}
                >
                  {timeText}
                </Typography>
              ) : null}
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.inlineTitle}>
                <Repeat2
                  size={16}
                  color={textColor}
                />
                <Typography
                  variant="caption"
                  color={textColor}
                  style={styles.sectionLabel}
                >
                  Repeat
                </Typography>
              </View>
              {recurrenceLoading ? (
                <Typography variant="tiny" color={secondaryTextColor}>
                  Loading…
                </Typography>
              ) : null}
            </View>
            <View style={styles.choiceRow}>
              <ChoicePill
                label="Never"
                group="Repeat"
                selected={recurrence.preset === "none"}
                onPress={() => selectRepeat("none")}
              />
              <ChoicePill
                label="Daily"
                group="Repeat"
                selected={recurrence.preset === "daily"}
                onPress={() => selectRepeat("daily")}
              />
              <ChoicePill
                label="Weekdays"
                group="Repeat"
                selected={recurrence.preset === "weekdays"}
                onPress={() => selectRepeat("weekdays")}
              />
              <ChoicePill
                label="Weekly"
                group="Repeat"
                selected={recurrence.preset === "weekly"}
                onPress={() => selectRepeat("weekly")}
              />
              <ChoicePill
                label="Monthly"
                group="Repeat"
                selected={recurrence.preset === "monthly"}
                onPress={() => selectRepeat("monthly")}
              />
              <ChoicePill
                label="Custom"
                group="Repeat"
                selected={recurrence.preset === "custom"}
                onPress={() => selectRepeat("custom")}
              />
            </View>

            {recurrence.preset !== "none" ? (
              <View style={styles.repeatDetails}>
                {recurrence.preset === "custom" ? (
                  <View
                    style={[
                      styles.twoColumn,
                      compact && styles.twoColumnCompact,
                    ]}
                  >
                    <Picker<RecurrenceFrequency>
                      label="Frequency"
                      value={recurrence.frequency}
                      onValueChange={setCustomFrequency}
                      options={[
                        { value: "daily", label: "Daily" },
                        { value: "weekly", label: "Weekly" },
                        { value: "monthly", label: "Monthly" },
                        { value: "yearly", label: "Yearly" },
                      ]}
                      containerStyle={styles.flexField}
                    />
                    <NumberStepper
                      label="Every"
                      value={recurrence.interval}
                      max={99}
                      onChange={(interval) =>
                        setRecurrence((current) => ({ ...current, interval }))
                      }
                    />
                  </View>
                ) : null}

                {recurrence.preset === "custom" &&
                recurrence.frequency === "weekly" ? (
                  <View style={styles.weekdayBlock}>
                    <Typography
                      variant="caption"
                      color={secondaryTextColor}
                    >
                      Days
                    </Typography>
                    <View style={styles.weekdayRow}>
                      {WEEKDAY_OPTIONS.map((option) => (
                        <ChoicePill
                          key={option.value}
                          label={option.label}
                          group="Weekday"
                          selected={recurrence.weekdays.includes(option.value)}
                          onPress={() =>
                            setRecurrence((current) => ({
                              ...current,
                              weekdays: toggleWeekday(
                                current.weekdays,
                                option.value,
                              ),
                            }))
                          }
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {recurrence.preset === "custom" &&
                recurrence.frequency === "monthly" ? (
                  <NumberStepper
                    label="Day of month"
                    value={
                      recurrence.monthDays[0] ??
                      Number((dateText || today).slice(-2))
                    }
                    min={1}
                    max={31}
                    onChange={(day) =>
                      setRecurrence((current) => ({
                        ...current,
                        monthDays: [day],
                      }))
                    }
                  />
                ) : null}

                <Picker<RecurrenceMode>
                  label="Repeat timing"
                  value={recurrence.mode}
                  onValueChange={(value) =>
                    setRecurrence((current) => ({ ...current, mode: value }))
                  }
                  options={[
                    { value: "fixed", label: "On schedule" },
                    { value: "after_completion", label: "After completion" },
                  ]}
                  helperText={
                    recurrence.mode === "fixed"
                      ? "Keeps the calendar cadence."
                      : "Counts the interval from when you complete it."
                  }
                />

                <Picker<"never" | "date" | "count">
                  label="Ends"
                  value={recurrence.endMode}
                  onValueChange={(value) =>
                    setRecurrence((current) => ({ ...current, endMode: value }))
                  }
                  options={[
                    { value: "never", label: "Never" },
                    { value: "date", label: "On date" },
                    { value: "count", label: "After count" },
                  ]}
                />

                {recurrence.endMode === "date" ? (
                  <NativeDateTimeControl
                    label="End date"
                    mode="date"
                    value={endPickerDate}
                    minimumDate={localPickerDate(dateText || today)}
                    onChange={(value) =>
                      setRecurrence((current) => ({
                        ...current,
                        endDate: getLocalDateString(value),
                      }))
                    }
                    accessibilityLabel="Choose repeat end date"
                    testID="task-editor-repeat-end-picker"
                  />
                ) : null}

                {recurrence.endMode === "count" ? (
                  <NumberStepper
                    label="Occurrences"
                    value={recurrence.maxOccurrences ?? 2}
                    min={1}
                    max={999}
                    onChange={(maxOccurrences) =>
                      setRecurrence((current) => ({
                        ...current,
                        maxOccurrences,
                      }))
                    }
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
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
          />

          {formError && title.trim() ? (
            <Typography
              variant="caption"
              color={colors.destructive}
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
    props.visible ? "open" : "closed",
    props.mode ?? "create",
    props.task?.id ?? "new",
    props.initialTitle ?? "",
  ].join(":");

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
    paddingBottom: Spacing.xs,
  },
  introCopy: { flex: 1 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  section: { gap: Spacing.sm },
  sourceLink: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sourcePressed: { opacity: 0.7 },
  sourceText: { flex: 1 },
  imageSource: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  sourceImage: { width: "100%", aspectRatio: 16 / 9 },
  imageSourceLabel: {
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: { fontWeight: "700" },
  inlineTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  choice: {
    minHeight: 40,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderCurve: "continuous",
  },
  choiceLabel: { fontWeight: "600" },
  summaryCopy: { paddingHorizontal: Spacing.xs },
  repeatDetails: {
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  twoColumn: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  twoColumnCompact: { flexDirection: "column" },
  flexField: { flex: 1, minWidth: 150 },
  stepperBlock: {
    flex: 1,
    minWidth: 150,
    gap: ControlTokens.fieldLabelGap,
  },
  stepper: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: ControlTokens.borderWidth,
    borderRadius: Radius.lg,
    borderCurve: "continuous",
    paddingHorizontal: Spacing.xs,
  },
  stepperValue: { minWidth: 42 },
  weekdayBlock: { gap: ControlTokens.fieldLabelGap },
  weekdayRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
});
