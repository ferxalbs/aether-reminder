import { getDeviceTimeZone, getLocalDateString, getLocalTimeString } from './localCalendar';
import {
  type LocalDate,
  type LocalTime,
  type ResolvedDateTime,
  type TemporalSemantics,
  type TimeZone,
  type Weekday,
  TemporalValidationError,
  WEEKDAY_INDEX,
} from './types';

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidLocalDate(value: string): value is LocalDate {
  if (!LOCAL_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

export function isValidLocalTime(value: string): value is LocalTime {
  return LOCAL_TIME_RE.test(value);
}

export function asLocalDate(value: string): LocalDate {
  if (!isValidLocalDate(value)) {
    throw new TemporalValidationError(`Invalid local date: ${value}`);
  }
  return value;
}

export function asLocalTime(value: string): LocalTime {
  if (!isValidLocalTime(value)) {
    throw new TemporalValidationError(`Invalid local time: ${value}`);
  }
  return value;
}

export function asTimeZone(value: string | null | undefined): TimeZone | null {
  if (value == null || value.trim() === '') return null;
  return value.trim() as TimeZone;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function resolveToday(
  now: Date = new Date(),
  options?: { timezone?: string | null; semantics?: TemporalSemantics; time?: string | null }
): ResolvedDateTime {
  return {
    date: asLocalDate(getLocalDateString(now)),
    time: options?.time != null ? asLocalTime(options.time) : null,
    timezone: asTimeZone(options?.timezone ?? getDeviceTimeZone()),
    semantics: options?.semantics ?? 'floating',
  };
}

export function resolveTomorrow(
  now: Date = new Date(),
  options?: { timezone?: string | null; semantics?: TemporalSemantics; time?: string | null }
): ResolvedDateTime {
  return resolveToday(addDays(now, 1), options);
}

/** Explicit YYYY-MM-DD (+ optional local time). */
export function resolveExplicitDate(
  date: string,
  options?: {
    time?: string | null;
    timezone?: string | null;
    semantics?: TemporalSemantics;
  }
): ResolvedDateTime {
  return {
    date: asLocalDate(date),
    time: options?.time != null && options.time !== '' ? asLocalTime(options.time) : null,
    timezone: asTimeZone(options?.timezone ?? getDeviceTimeZone()),
    semantics: options?.semantics ?? 'floating',
  };
}

export function resolveExplicitTime(
  time: string,
  options?: {
    date?: string;
    now?: Date;
    timezone?: string | null;
    semantics?: TemporalSemantics;
  }
): ResolvedDateTime {
  const date = options?.date
    ? asLocalDate(options.date)
    : asLocalDate(getLocalDateString(options?.now ?? new Date()));
  return {
    date,
    time: asLocalTime(time),
    timezone: asTimeZone(options?.timezone ?? getDeviceTimeZone()),
    semantics: options?.semantics ?? 'floating',
  };
}

/**
 * Next occurrence of weekday strictly after `now`'s local calendar day
 * (if today is that weekday, returns next week's).
 */
export function resolveNextWeekday(
  weekday: Weekday,
  now: Date = new Date(),
  options?: { timezone?: string | null; semantics?: TemporalSemantics; time?: string | null }
): ResolvedDateTime {
  const target = WEEKDAY_INDEX[weekday];
  if (target === undefined) {
    throw new TemporalValidationError(`Unknown weekday: ${String(weekday)}`);
  }
  const current = now.getDay();
  let delta = (target - current + 7) % 7;
  if (delta === 0) delta = 7;
  return resolveToday(addDays(now, delta), options);
}

/**
 * Validate a resolved payload before persistence.
 * Rejects free-form model timestamps (ISO instants masquerading as dates, etc.).
 */
export function assertResolvedDateTime(value: {
  date?: string | null;
  time?: string | null;
  timezone?: string | null;
  semantics?: TemporalSemantics;
}): ResolvedDateTime {
  if (value.date == null || value.date === '') {
    throw new TemporalValidationError('date is required');
  }
  if (typeof value.date === 'string' && value.date.includes('T')) {
    throw new TemporalValidationError('ISO instants are not accepted as local dates; use YYYY-MM-DD');
  }
  const semantics = value.semantics ?? 'floating';
  if (semantics !== 'fixed' && semantics !== 'floating') {
    throw new TemporalValidationError(`Invalid temporal semantics: ${String(semantics)}`);
  }
  return resolveExplicitDate(value.date, {
    time: value.time,
    timezone: value.timezone,
    semantics,
  });
}

function zonedParts(date: Date, timezone: string): number[] {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return [value('year'), value('month'), value('day'), value('hour'), value('minute'), value('second')];
}

/** Convert a validated local calendar value in an IANA zone to an absolute Date. */
export function localDateTimeInZoneToDate(
  date: string,
  time: string,
  timezone: string,
): Date {
  const localDate = asLocalDate(date);
  const localTime = asLocalTime(time);
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = target;

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = zonedParts(new Date(instant), timezone);
      const represented = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
      instant += target - represented;
    }
  } catch {
    throw new TemporalValidationError(`Invalid timezone: ${timezone}`);
  }

  const resolved = new Date(instant);
  const actual = zonedParts(resolved, timezone);
  if (
    actual[0] !== year || actual[1] !== month || actual[2] !== day ||
    actual[3] !== hour || actual[4] !== minute
  ) {
    throw new TemporalValidationError(`Local time does not exist in ${timezone}: ${date} ${time}`);
  }
  return resolved;
}

/** Convenience: current local wall clock as optional time on today. */
export function resolveNowLocal(now: Date = new Date()): ResolvedDateTime {
  return resolveToday(now, { time: getLocalTimeString(now) });
}
