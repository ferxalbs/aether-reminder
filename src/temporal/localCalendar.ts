/**
 * Local calendar helpers.
 *
 * Never use `toISOString().split('T')[0]` for "today" — that is UTC calendar
 * semantics and breaks near local midnight / non-UTC timezones.
 */

/** YYYY-MM-DD in the device's local timezone. */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** HH:mm in the device's local timezone (24h). */
export function getLocalTimeString(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
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
  } catch {
    return undefined;
  }
}
