import type { RecurrenceRule } from '@/domain/entities';

function parseDate(value: string): { year: number; month: number; day: number } {
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
  return { year, month, day };
}

function toUtcDate(value: string): Date {
  const { year, month, day } = parseDate(value);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcDate(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function addLocalCalendarDays(value: string, amount: number): string {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatUtcDate(date);
}

export function differenceInLocalCalendarDays(a: string, b: string): number {
  return Math.floor((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / 86_400_000);
}

function startOfWeekSunday(value: string): string {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return formatUtcDate(date);
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate());
}

function addMonthsFromAnchor(anchor: string, monthOffset: number, requestedDay: number): string {
  const base = toUtcDate(anchor);
  const absoluteMonth = base.getUTCFullYear() * 12 + base.getUTCMonth() + monthOffset;
  const year = Math.floor(absoluteMonth / 12);
  const monthIndex = absoluteMonth % 12;
  const day = clampDay(year, monthIndex + 1, requestedDay);
  return formatUtcDate(new Date(Date.UTC(year, monthIndex, day)));
}

function normalizedWeekdays(rule: RecurrenceRule): number[] {
  const values = (rule.weekdays ?? []).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return [...new Set(values)].sort((a, b) => a - b);
}

function normalizedMonthDays(rule: RecurrenceRule): number[] {
  const values = (rule.monthDays ?? []).filter((value) => Number.isInteger(value) && value >= 1 && value <= 31);
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Calculate the next local-calendar occurrence. This is intentionally pure and
 * network-free; timezone only affects the wall-clock projection, not date math.
 */
export function getNextRecurrenceDate(rule: RecurrenceRule, fromDate: string): string | null {
  parseDate(rule.startDate);
  parseDate(fromDate);
  const interval = Math.max(1, Math.floor(rule.interval));
  let candidate: string | null = null;

  switch (rule.frequency) {
    case 'daily':
      candidate = addLocalCalendarDays(fromDate, interval);
      break;

    case 'weekly': {
      const weekdays = normalizedWeekdays(rule);
      if (weekdays.length === 0) {
        candidate = addLocalCalendarDays(fromDate, interval * 7);
        break;
      }
      const anchorWeek = startOfWeekSunday(rule.startDate);
      for (let offset = 1; offset <= 366 * 6; offset += 1) {
        const next = addLocalCalendarDays(fromDate, offset);
        const weekday = toUtcDate(next).getUTCDay();
        if (!weekdays.includes(weekday)) continue;
        const weekOffset = Math.floor(differenceInLocalCalendarDays(anchorWeek, startOfWeekSunday(next)) / 7);
        if (weekOffset >= 0 && weekOffset % interval === 0) {
          candidate = next;
          break;
        }
      }
      break;
    }

    case 'monthly': {
      const anchor = parseDate(rule.startDate);
      const monthDays = normalizedMonthDays(rule);
      const requestedDays = monthDays.length > 0 ? monthDays : [anchor.day];
      const anchorAbsolute = anchor.year * 12 + (anchor.month - 1);
      const from = parseDate(fromDate);
      const fromAbsolute = from.year * 12 + (from.month - 1);
      const firstMonthOffset = Math.max(0, fromAbsolute - anchorAbsolute);

      for (let monthOffset = firstMonthOffset; monthOffset <= firstMonthOffset + 1200; monthOffset += 1) {
        if (monthOffset % interval !== 0) continue;
        for (const requestedDay of requestedDays) {
          const next = addMonthsFromAnchor(rule.startDate, monthOffset, requestedDay);
          if (next > fromDate) {
            candidate = next;
            break;
          }
        }
        if (candidate) break;
      }
      break;
    }

    case 'yearly': {
      const anchor = parseDate(rule.startDate);
      const from = parseDate(fromDate);
      const firstYearOffset = Math.max(0, from.year - anchor.year);
      for (let yearOffset = firstYearOffset; yearOffset <= firstYearOffset + 400; yearOffset += 1) {
        if (yearOffset % interval !== 0) continue;
        const year = anchor.year + yearOffset;
        const day = clampDay(year, anchor.month, anchor.day);
        const next = formatUtcDate(new Date(Date.UTC(year, anchor.month - 1, day)));
        if (next > fromDate) {
          candidate = next;
          break;
        }
      }
      break;
    }
  }

  if (!candidate) return null;
  if (rule.endDate && candidate > rule.endDate) return null;
  if (rule.maxOccurrences !== null && rule.occurrenceCount >= rule.maxOccurrences) return null;
  return candidate;
}

/**
 * Resolve a fixed-series occurrence from its immutable start-date anchor.
 * This is deliberately separate from the mutable current task date: recovering
 * one occurrence must not move the cadence of all future occurrences.
 */
export function getRecurrenceOccurrenceDate(
  rule: RecurrenceRule,
  occurrenceNumber: number,
): string | null {
  if (!Number.isInteger(occurrenceNumber) || occurrenceNumber < 1) return null;
  if (occurrenceNumber === 1) return rule.startDate;

  let current = rule.startDate;
  const unboundedRule: RecurrenceRule = {
    ...rule,
    endDate: null,
    maxOccurrences: null,
    occurrenceCount: 0,
  };
  for (let occurrence = 2; occurrence <= occurrenceNumber; occurrence += 1) {
    const next = getNextRecurrenceDate(unboundedRule, current);
    if (!next) return null;
    current = next;
  }
  return current;
}
