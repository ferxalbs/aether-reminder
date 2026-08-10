import type {
  RecurrenceFrequency,
  RecurrenceMode,
  RecurrenceRule,
} from '@/domain/entities';
import { addLocalCalendarDays } from '@/temporal/recurrence';

export type SchedulePreset = 'today' | 'tomorrow' | 'next_week' | 'custom' | 'none';
export type TimePreset = 'any' | 'morning' | 'afternoon' | 'evening' | 'custom';
export type RepeatPreset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';
export type RecurrenceEndMode = 'never' | 'date' | 'count';

export interface RecurrenceEditorState {
  preset: RepeatPreset;
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: number[];
  monthDays: number[];
  mode: RecurrenceMode;
  endMode: RecurrenceEndMode;
  endDate: string | null;
  maxOccurrences: number | null;
}

function parseLocalDate(value: string): { year: number; month: number; day: number; weekday: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid local date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new Error(`Invalid local date: ${value}`);
  return { year, month, day, weekday: date.getUTCDay() };
}

export function getSchedulePreset(
  dueDate: string | null | undefined,
  today: string,
): SchedulePreset {
  if (!dueDate) return 'none';
  if (dueDate === today) return 'today';
  if (dueDate === addLocalCalendarDays(today, 1)) return 'tomorrow';
  if (dueDate === addLocalCalendarDays(today, 7)) return 'next_week';
  return 'custom';
}

export function getTimePreset(dueTime: string | null | undefined): TimePreset {
  if (!dueTime) return 'any';
  if (dueTime === '09:00') return 'morning';
  if (dueTime === '14:00') return 'afternoon';
  if (dueTime === '19:00') return 'evening';
  return 'custom';
}

export function timeForPreset(preset: TimePreset, current: string | null = null): string | null {
  switch (preset) {
    case 'any': return null;
    case 'morning': return '09:00';
    case 'afternoon': return '14:00';
    case 'evening': return '19:00';
    case 'custom': return current ?? '09:00';
  }
}

export function inferRepeatPreset(rule: RecurrenceRule | null): RepeatPreset {
  if (!rule || !rule.active) return 'none';
  if (rule.frequency === 'daily' && rule.interval === 1) return 'daily';
  if (
    rule.frequency === 'weekly' &&
    rule.interval === 1 &&
    JSON.stringify(rule.weekdays ?? []) === JSON.stringify([1, 2, 3, 4, 5])
  ) return 'weekdays';
  if (rule.frequency === 'weekly' && rule.interval === 1 && (rule.weekdays?.length ?? 0) === 1) {
    return 'weekly';
  }
  if (rule.frequency === 'monthly' && rule.interval === 1 && (rule.monthDays?.length ?? 0) === 1) {
    return 'monthly';
  }
  return 'custom';
}

export function createRecurrenceEditorState(
  rule: RecurrenceRule | null,
  dueDate: string,
): RecurrenceEditorState {
  const parsed = parseLocalDate(dueDate);
  const preset = inferRepeatPreset(rule);
  return {
    preset,
    frequency: rule?.frequency ?? 'weekly',
    interval: Math.max(1, Math.floor(rule?.interval ?? 1)),
    weekdays: rule?.weekdays ? [...rule.weekdays] : [parsed.weekday],
    monthDays: rule?.monthDays ? [...rule.monthDays] : [parsed.day],
    mode: rule?.mode ?? 'fixed',
    endMode: rule?.endDate ? 'date' : rule?.maxOccurrences ? 'count' : 'never',
    endDate: rule?.endDate ?? null,
    maxOccurrences: rule?.maxOccurrences ?? null,
  };
}

export function applyRepeatPreset(
  state: RecurrenceEditorState,
  preset: RepeatPreset,
  dueDate: string,
): RecurrenceEditorState {
  const parsed = parseLocalDate(dueDate);
  switch (preset) {
    case 'none':
      return { ...state, preset };
    case 'daily':
      return { ...state, preset, frequency: 'daily', interval: 1, weekdays: [], monthDays: [] };
    case 'weekdays':
      return { ...state, preset, frequency: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], monthDays: [] };
    case 'weekly':
      return { ...state, preset, frequency: 'weekly', interval: 1, weekdays: [parsed.weekday], monthDays: [] };
    case 'monthly':
      return { ...state, preset, frequency: 'monthly', interval: 1, weekdays: [], monthDays: [parsed.day] };
    case 'custom':
      return {
        ...state,
        preset,
        weekdays: state.frequency === 'weekly' && state.weekdays.length === 0 ? [parsed.weekday] : state.weekdays,
        monthDays: state.frequency === 'monthly' && state.monthDays.length === 0 ? [parsed.day] : state.monthDays,
      };
  }
}

export function normalizeRecurrenceStateForDate(
  state: RecurrenceEditorState,
  dueDate: string,
): RecurrenceEditorState {
  const parsed = parseLocalDate(dueDate);
  if (state.preset === 'weekly') return { ...state, weekdays: [parsed.weekday] };
  if (state.preset === 'monthly') return { ...state, monthDays: [parsed.day] };
  return state;
}

export function buildRecurrenceDraft(
  state: RecurrenceEditorState,
  dueDate: string,
  timezone: string | null,
): {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: number[] | null;
  monthDays: number[] | null;
  startDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
  mode: RecurrenceMode;
  timezone: string | null;
} | null {
  if (state.preset === 'none') return null;
  const parsed = parseLocalDate(dueDate);
  const frequency = state.frequency;
  const weekdays = frequency === 'weekly'
    ? (state.weekdays.length > 0 ? [...new Set(state.weekdays)].sort((a, b) => a - b) : [parsed.weekday])
    : null;
  const monthDays = frequency === 'monthly'
    ? (state.monthDays.length > 0 ? [...new Set(state.monthDays)].sort((a, b) => a - b) : [parsed.day])
    : null;
  return {
    frequency,
    interval: Math.max(1, Math.floor(state.interval)),
    weekdays,
    monthDays,
    startDate: dueDate,
    endDate: state.endMode === 'date' ? state.endDate : null,
    maxOccurrences: state.endMode === 'count'
      ? Math.max(1, Math.floor(state.maxOccurrences ?? 2))
      : null,
    mode: state.mode,
    timezone,
  };
}

export function toggleWeekday(values: number[], weekday: number): number[] {
  const normalized = Math.max(0, Math.min(6, Math.floor(weekday)));
  if (values.includes(normalized)) {
    return values.length === 1 ? values : values.filter((value) => value !== normalized);
  }
  return [...values, normalized].sort((a, b) => a - b);
}
