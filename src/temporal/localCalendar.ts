/**
 * Local calendar helpers.
 *
 * Never use `toISOString().split('T')[0]` for "today" — that is UTC calendar
 * semantics and breaks near local midnight / non-UTC timezones.
 */

import { reportNonFatalError } from "@/lib/nonFatalError";

/** YYYY-MM-DD in the device's local timezone. */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** HH:mm in the device's local timezone (24h). */
export function getLocalTimeString(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return getLocalDateString(date) === value ? date : null;
}

/** Display a stored HH:mm value using the device's local time convention. */
export function formatLocalTimeLabel(time?: string | null): string | null {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return time;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes));
}

/** Display a stored local schedule without exposing storage-shaped dates. */
export function formatTaskSchedule(
  dueDate?: string | null,
  dueTime?: string | null,
  now: Date = new Date(),
): string | null {
  if (!dueDate) return null;
  const parsedDate = parseLocalDate(dueDate);
  if (!parsedDate) return dueTime ? `${dueDate} · ${dueTime}` : dueDate;

  const today = getLocalDateString(now);
  const tomorrow = addLocalCalendarDays(today, 1);
  const dateLabel =
    dueDate === today
      ? "Today"
      : dueDate === tomorrow
        ? "Tomorrow"
        : new Intl.DateTimeFormat(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            ...(parsedDate.getFullYear() !== now.getFullYear()
              ? { year: "numeric" as const }
              : {}),
          }).format(parsedDate);
  const timeLabel = formatLocalTimeLabel(dueTime);
  return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
}

/** Calendar date/time represented by an instant in an explicit IANA timezone. */
export function getZonedDateTimeStrings(
  date: Date,
  timezone: string,
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = value("hour");
  const minute = value("minute");
  if (![year, month, day, hour, minute].every(Boolean)) {
    throw new RangeError(
      `Could not resolve calendar values in timezone ${timezone}.`,
    );
  }
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

/** Add calendar days to a YYYY-MM-DD value without using device timezone. */
export function addLocalCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** Compare two YYYY-MM-DD local dates lexicographically (valid for ISO dates). */
export function compareLocalDates(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function isLocalDateBefore(a: string, b: string): boolean {
  return compareLocalDates(a, b) < 0;
}

export function isLocalDateAfter(a: string, b: string): boolean {
  return compareLocalDates(a, b) > 0;
}

/** IANA timezone if available; otherwise undefined (floating local semantics). */
export function getDeviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch (error) {
    reportNonFatalError("device-timezone", error);
    return undefined;
  }
}
