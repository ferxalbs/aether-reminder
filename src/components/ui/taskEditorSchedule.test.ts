import { describe, expect, test } from 'bun:test';
import type { RecurrenceRule } from '@/domain/entities';
import {
  applyRepeatPreset,
  buildRecurrenceDraft,
  createRecurrenceEditorState,
  getSchedulePreset,
  getTimePreset,
  inferRepeatPreset,
  normalizeRecurrenceStateForDate,
  timeForPreset,
  toggleWeekday,
} from './taskEditorSchedule';

function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    id: 'rule-1',
    taskId: 'task-1',
    frequency: 'weekly',
    interval: 1,
    weekdays: [1],
    monthDays: null,
    startDate: '2026-08-10',
    endDate: null,
    maxOccurrences: null,
    occurrenceCount: 1,
    mode: 'fixed',
    timezone: 'America/Lima',
    active: true,
    createdAt: '2026-08-09T23:00:00.000Z',
    updatedAt: '2026-08-09T23:00:00.000Z',
    ...overrides,
  };
}

describe('TaskEditor scheduling presets', () => {
  test('recognizes date and time presets without UTC conversion', () => {
    expect(getSchedulePreset('2026-08-09', '2026-08-09')).toBe('today');
    expect(getSchedulePreset('2026-08-10', '2026-08-09')).toBe('tomorrow');
    expect(getSchedulePreset('2026-08-16', '2026-08-09')).toBe('next_week');
    expect(getSchedulePreset('2026-08-20', '2026-08-09')).toBe('custom');
    expect(getSchedulePreset(null, '2026-08-09')).toBe('none');

    expect(getTimePreset(null)).toBe('any');
    expect(getTimePreset('09:00')).toBe('morning');
    expect(getTimePreset('14:00')).toBe('afternoon');
    expect(getTimePreset('19:00')).toBe('evening');
    expect(getTimePreset('08:15')).toBe('custom');
    expect(timeForPreset('custom', null)).toBe('09:00');
  });

  test('maps common recurrence rules back to commercial presets', () => {
    expect(inferRepeatPreset(rule({ frequency: 'daily' }))).toBe('daily');
    expect(inferRepeatPreset(rule({ weekdays: [1, 2, 3, 4, 5] }))).toBe('weekdays');
    expect(inferRepeatPreset(rule({ weekdays: [3] }))).toBe('weekly');
    expect(inferRepeatPreset(rule({ frequency: 'monthly', weekdays: null, monthDays: [10] }))).toBe('monthly');
    expect(inferRepeatPreset(rule({ interval: 2 }))).toBe('custom');
  });

  test('keeps weekly/monthly presets anchored to a changed date', () => {
    const initial = createRecurrenceEditorState(null, '2026-08-10');
    const weekly = applyRepeatPreset(initial, 'weekly', '2026-08-10');
    expect(weekly.weekdays).toEqual([1]);
    expect(normalizeRecurrenceStateForDate(weekly, '2026-08-12').weekdays).toEqual([3]);

    const monthly = applyRepeatPreset(initial, 'monthly', '2026-08-10');
    expect(normalizeRecurrenceStateForDate(monthly, '2026-08-28').monthDays).toEqual([28]);
  });

  test('builds a normalized recurrence draft for the command layer', () => {
    const initial = createRecurrenceEditorState(null, '2026-08-10');
    const weekdays = applyRepeatPreset(initial, 'weekdays', '2026-08-10');
    const draft = buildRecurrenceDraft(
      { ...weekdays, endMode: 'count', maxOccurrences: 6 },
      '2026-08-10',
      'America/Lima',
    );
    expect(draft).toEqual({
      frequency: 'weekly',
      interval: 1,
      weekdays: [1, 2, 3, 4, 5],
      monthDays: null,
      startDate: '2026-08-10',
      endDate: null,
      maxOccurrences: 6,
      mode: 'fixed',
      timezone: 'America/Lima',
    });
  });

  test('weekday selection never becomes empty', () => {
    expect(toggleWeekday([1], 1)).toEqual([1]);
    expect(toggleWeekday([1, 3], 1)).toEqual([3]);
    expect(toggleWeekday([3], 1)).toEqual([1, 3]);
  });
});
