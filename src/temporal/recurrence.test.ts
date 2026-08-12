import { describe, expect, test } from 'bun:test';
import type { RecurrenceRule } from '@/domain/entities';
import {
  addLocalCalendarDays,
  differenceInLocalCalendarDays,
  getNextRecurrenceDate,
  getRecurrenceOccurrenceDate,
} from './recurrence';

function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    id: 'rule-1',
    taskId: 'task-1',
    frequency: 'daily',
    interval: 1,
    weekdays: null,
    monthDays: null,
    startDate: '2026-08-09',
    endDate: null,
    maxOccurrences: null,
    occurrenceCount: 1,
    mode: 'fixed',
    timezone: 'America/Lima',
    active: true,
    createdAt: '2026-08-09T18:00:00.000Z',
    updatedAt: '2026-08-09T18:00:00.000Z',
    ...overrides,
  };
}

describe('getNextRecurrenceDate', () => {
  test('advances daily intervals without timezone conversion', () => {
    expect(getNextRecurrenceDate(rule({ interval: 2 }), '2026-08-09')).toBe('2026-08-11');
  });

  test('finds the next allowed weekday on an anchored weekly cadence', () => {
    const weekly = rule({
      frequency: 'weekly',
      weekdays: [1, 3], // Monday, Wednesday
      startDate: '2026-08-09', // Sunday
    });
    expect(getNextRecurrenceDate(weekly, '2026-08-09')).toBe('2026-08-10');
    expect(getNextRecurrenceDate(weekly, '2026-08-10')).toBe('2026-08-12');
  });

  test('clamps monthly day to the last valid calendar day', () => {
    const monthly = rule({
      frequency: 'monthly',
      startDate: '2026-01-31',
      monthDays: [31],
    });
    expect(getNextRecurrenceDate(monthly, '2026-01-31')).toBe('2026-02-28');
  });

  test('clamps leap-day yearly recurrence in non-leap years', () => {
    const yearly = rule({ frequency: 'yearly', startDate: '2024-02-29' });
    expect(getNextRecurrenceDate(yearly, '2024-02-29')).toBe('2025-02-28');
  });

  test('stops at end date and max occurrence limits', () => {
    expect(getNextRecurrenceDate(rule({ endDate: '2026-08-09' }), '2026-08-09')).toBeNull();
    expect(getNextRecurrenceDate(rule({ maxOccurrences: 1 }), '2026-08-09')).toBeNull();
  });

  test('preserves reminder lead/lag offsets using local calendar math', () => {
    expect(differenceInLocalCalendarDays('2026-08-09', '2026-08-08')).toBe(-1);
    expect(addLocalCalendarDays('2026-08-10', -1)).toBe('2026-08-09');
    expect(differenceInLocalCalendarDays('2026-12-31', '2027-01-02')).toBe(2);
    expect(addLocalCalendarDays('2026-12-31', 2)).toBe('2027-01-02');
  });

  test('resolves fixed occurrences from the series anchor after a current occurrence moved', () => {
    const fixed = rule({ startDate: '2026-08-09', occurrenceCount: 1 });
    expect(getRecurrenceOccurrenceDate(fixed, 1)).toBe('2026-08-09');
    expect(getNextRecurrenceDate(fixed, getRecurrenceOccurrenceDate(fixed, 1)!)).toBe('2026-08-10');
  });
});
