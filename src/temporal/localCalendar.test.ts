import { describe, expect, test } from 'bun:test';
import {
  compareLocalDates,
  getLocalDateString,
  getLocalTimeString,
  isLocalDateAfter,
  isLocalDateBefore,
} from './localCalendar';

describe('getLocalDateString', () => {
  test('formats local calendar date as YYYY-MM-DD', () => {
    // Explicit local components — not UTC
    const d = new Date(2026, 0, 5, 23, 30, 0); // Jan 5 2026 local evening
    expect(getLocalDateString(d)).toBe('2026-01-05');
  });

  test('does not use UTC date near local midnight', () => {
    // Local Jan 1 00:30 — in western timezones UTC may still be Dec 31
    const d = new Date(2026, 0, 1, 0, 30, 0);
    expect(getLocalDateString(d)).toBe('2026-01-01');
    // Contrast: UTC slice would be wrong for negative offsets late evening
    // (assertion documents local semantics only)
    expect(getLocalDateString(d)).not.toMatch(/T/);
  });

  test('pads month and day', () => {
    const d = new Date(2026, 8, 7, 12, 0, 0); // Sep 7
    expect(getLocalDateString(d)).toBe('2026-09-07');
  });
});

describe('getLocalTimeString', () => {
  test('formats HH:mm', () => {
    const d = new Date(2026, 0, 1, 9, 5, 0);
    expect(getLocalTimeString(d)).toBe('09:05');
  });
});

describe('compareLocalDates', () => {
  test('orders ISO local dates', () => {
    expect(compareLocalDates('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareLocalDates('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareLocalDates('2026-01-01', '2026-01-01')).toBe(0);
    expect(isLocalDateBefore('2026-01-01', '2026-01-02')).toBe(true);
    expect(isLocalDateAfter('2026-01-02', '2026-01-01')).toBe(true);
  });
});
