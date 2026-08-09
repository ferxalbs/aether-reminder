import type { TaskPriority } from '@/domain/entities';
import {
  getDeviceTimeZone,
  getLocalDateString,
  getLocalTimeString,
} from '@/temporal/localCalendar';

export type LocalCaptureSignal = 'date' | 'time' | 'relative' | 'priority';

export interface LocalReminderIntent {
  title: string;
  dueDate: string;
  dueTime: string | null;
  dueTimezone: string | null;
  priority: TaskPriority;
  signals: LocalCaptureSignal[];
}

export interface ParseLocalReminderOptions {
  now?: Date;
  timezone?: string | null;
}

const PRIORITY_BY_TOKEN: Record<string, TaskPriority> = {
  high: 'high',
  alta: 'high',
  medium: 'medium',
  media: 'medium',
  low: 'low',
  baja: 'low',
};

function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function normalizeTime(hourText: string, minuteText?: string, meridiem?: string): string | null {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? '0');
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  const marker = meridiem?.toLowerCase();
  if (marker) {
    if (hour < 1 || hour > 12) return null;
    if (marker === 'pm' && hour !== 12) hour += 12;
    if (marker === 'am' && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[,;:\-–—\s]+|[,;:\-–—\s]+$/g, '')
    .trim();
}

/**
 * Deterministic, network-free parser for the hot capture path.
 *
 * This parser intentionally supports a small, high-confidence grammar rather
 * than trying to imitate an LLM. Ambiguous planning requests stay untouched
 * and can still be handed to AETHER explicitly.
 */
export function parseLocalReminderInput(
  rawInput: string,
  options: ParseLocalReminderOptions = {},
): LocalReminderIntent {
  const now = options.now ? new Date(options.now.getTime()) : new Date();
  const timezone = options.timezone === undefined ? (getDeviceTimeZone() ?? null) : options.timezone;
  const raw = rawInput.trim();
  let working = raw;
  let dueDate = getLocalDateString(now);
  let dueTime: string | null = null;
  let priority: TaskPriority = 'medium';
  const signals = new Set<LocalCaptureSignal>();

  const priorityMatch = working.match(/(?:^|\s)!(high|medium|low|alta|media|baja)(?=\s|$)/i);
  if (priorityMatch) {
    priority = PRIORITY_BY_TOKEN[priorityMatch[1].toLowerCase()] ?? 'medium';
    signals.add('priority');
    working = working.replace(priorityMatch[0], ' ');
  }

  const relativeMatch = working.match(
    /\b(?:in|en)\s+(\d{1,4})\s*(minutes?|mins?|minutos?|min|hours?|hrs?|horas?|h)\b/i,
  );
  if (relativeMatch) {
    const amount = Number(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    const minutes = unit.startsWith('h') ? amount * 60 : amount;
    const target = addMinutes(now, minutes);
    dueDate = getLocalDateString(target);
    dueTime = getLocalTimeString(target);
    signals.add('relative');
    signals.add('date');
    signals.add('time');
    working = working.replace(relativeMatch[0], ' ');
  } else {
    const tomorrowMatch = working.match(/\b(tomorrow|mañana)\b/i);
    const todayMatch = working.match(/\b(today|hoy)\b/i);

    if (tomorrowMatch) {
      dueDate = getLocalDateString(addLocalDays(now, 1));
      signals.add('date');
      working = working.replace(tomorrowMatch[0], ' ');
    } else if (todayMatch) {
      dueDate = getLocalDateString(now);
      signals.add('date');
      working = working.replace(todayMatch[0], ' ');
    }

    const meridiemTime = working.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    const contextual24HourTime = working.match(/\b(?:at|a\s+las?)\s+(\d{1,2}):(\d{2})\b/i);
    const standalone24HourTime = working.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const timeMatch = meridiemTime ?? contextual24HourTime ?? standalone24HourTime;

    if (timeMatch) {
      const normalized = meridiemTime
        ? normalizeTime(timeMatch[1], timeMatch[2], timeMatch[3])
        : normalizeTime(timeMatch[1], timeMatch[2]);
      if (normalized) {
        dueTime = normalized;
        signals.add('time');
        working = working.replace(timeMatch[0], ' ');
      }
    }
  }

  const title = cleanTitle(working) || raw;

  return {
    title,
    dueDate,
    dueTime,
    dueTimezone: timezone,
    priority,
    signals: [...signals],
  };
}
