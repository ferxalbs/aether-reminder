import type { RecurrenceRule, Task, TaskPriority } from '@/domain/entities';
import {
  addLocalCalendarDays,
  getDeviceTimeZone,
  getLocalDateString,
  getLocalTimeString,
  getZonedDateTimeStrings,
} from '@/temporal/localCalendar';
import { isValidLocalDate, isValidLocalTime } from '@/temporal/resolve';
import type { RecurrenceRulesRepository } from '@/db/repositories/recurrenceRulesRepository';
import type { TasksRepository } from '@/db/repositories/tasksRepository';
import type {
  RecoveryAlternative,
  RecoveryPlan,
  RecoveryProposal,
  RecoveryReason,
  RecoverySchedule,
  RecoveryRecurrenceMetadata,
} from '@/domain/recovery';

/** Initial grace period before a timed task due today becomes a candidate. */
export const RECOVERY_MISSED_GRACE_MINUTES = 30;

/** Minimum future room required before reusing the original time today. */
export const RECOVERY_MINIMUM_FUTURE_MINUTES = 30;

/** Deterministic near-future value exposed as the “Later today” alternative. */
export const RECOVERY_LATER_TODAY_OFFSET_MINUTES = 60;

export interface RecoveryBuildContext {
  now: Date;
  deviceTimezone?: string | null;
  generatedAt?: string;
}

interface LocalClock {
  date: string;
  time: string;
}

interface RecoveryClassification {
  reason: RecoveryReason;
  clock: LocalClock;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function toTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function scheduleForTask(task: Task): RecoverySchedule {
  return {
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    dueTimezone: task.dueTimezone,
    dueSemantics: task.dueSemantics,
  };
}

function effectiveTimezone(task: Task, deviceTimezone: string | null | undefined): string | null {
  return task.dueSemantics === 'fixed'
    ? task.dueTimezone ?? deviceTimezone ?? null
    : deviceTimezone ?? null;
}

function clockForTask(task: Task, context: RecoveryBuildContext): LocalClock | null {
  try {
    const timezone = effectiveTimezone(task, context.deviceTimezone);
    if (timezone) return getZonedDateTimeStrings(context.now, timezone);
    return {
      date: getLocalDateString(context.now),
      time: getLocalTimeString(context.now),
    };
  } catch {
    // A malformed persisted timezone must not make Home unusable or create a
    // speculative recovery mutation.
    return null;
  }
}

function classify(task: Task, context: RecoveryBuildContext): RecoveryClassification | null {
  if (task.completed || task.deletedAt || !task.dueDate) return null;
  if (!isValidLocalDate(task.dueDate)) return null;
  if (task.dueTime !== null && !isValidLocalTime(task.dueTime)) return null;
  if (task.dueSemantics !== 'fixed' && task.dueSemantics !== 'floating') return null;

  const clock = clockForTask(task, context);
  if (!clock) return null;

  if (task.dueDate < clock.date) return { reason: 'overdue', clock };
  if (task.dueDate > clock.date || task.dueTime === null) return null;

  const elapsed = toMinutes(clock.time) - toMinutes(task.dueTime);
  return elapsed >= RECOVERY_MISSED_GRACE_MINUTES
    ? { reason: 'missed_time', clock }
    : null;
}

function sameSchedule(a: RecoverySchedule, b: RecoverySchedule): boolean {
  return a.dueDate === b.dueDate
    && a.dueTime === b.dueTime
    && a.dueTimezone === b.dueTimezone
    && a.dueSemantics === b.dueSemantics;
}

function addAlternative(
  alternatives: RecoveryAlternative[],
  alternative: RecoveryAlternative,
  proposed: RecoverySchedule,
): void {
  if (alternative.schedule && sameSchedule(alternative.schedule, proposed)) return;
  if (alternative.schedule && alternatives.some((item) => item.schedule && sameSchedule(item.schedule, alternative.schedule!))) {
    return;
  }
  alternatives.push(alternative);
}

function buildAlternatives(
  task: Task,
  classification: RecoveryClassification,
  proposed: RecoverySchedule,
): RecoveryAlternative[] {
  const alternatives: RecoveryAlternative[] = [];
  const original = scheduleForTask(task);
  const tomorrow = {
    ...original,
    dueDate: addLocalCalendarDays(classification.clock.date, 1),
  };

  if (task.dueTime !== null) {
    const laterTodayMinutes = toMinutes(classification.clock.time) + RECOVERY_LATER_TODAY_OFFSET_MINUTES;
    if (laterTodayMinutes < 24 * 60) {
      addAlternative(alternatives, {
        kind: 'later_today',
        label: 'Later today',
        schedule: {
          ...original,
          dueDate: classification.clock.date,
          dueTime: toTime(laterTodayMinutes),
        },
      }, proposed);
    }

    const originalMinutes = toMinutes(task.dueTime);
    if (
      classification.reason === 'overdue' &&
      originalMinutes - toMinutes(classification.clock.time) >= RECOVERY_MINIMUM_FUTURE_MINUTES
    ) {
      addAlternative(alternatives, {
        kind: 'today_original',
        label: 'Today at original time',
        schedule: { ...original, dueDate: classification.clock.date },
      }, proposed);
    }
  }

  addAlternative(alternatives, {
    kind: 'tomorrow',
    label: 'Tomorrow',
    schedule: tomorrow,
  }, proposed);
  alternatives.push({ kind: 'keep_current', label: 'Keep current schedule', schedule: null });
  alternatives.push({ kind: 'exclude', label: 'Remove from this recovery plan', schedule: null });
  return alternatives;
}

function recommendation(
  task: Task,
  classification: RecoveryClassification,
): RecoverySchedule {
  const original = scheduleForTask(task);
  if (classification.reason === 'missed_time') {
    return {
      ...original,
      dueDate: addLocalCalendarDays(classification.clock.date, 1),
    };
  }

  if (task.dueTime === null) {
    return { ...original, dueDate: classification.clock.date, dueTime: null };
  }

  const hasRoomToday = toMinutes(task.dueTime) - toMinutes(classification.clock.time)
    >= RECOVERY_MINIMUM_FUTURE_MINUTES;
  return {
    ...original,
    dueDate: hasRoomToday ? classification.clock.date : addLocalCalendarDays(classification.clock.date, 1),
  };
}

function recurrenceMetadata(rule: RecurrenceRule | null | undefined): RecoveryRecurrenceMetadata | null {
  return rule
    ? {
        ruleId: rule.id,
        mode: rule.mode,
        occurrenceCount: rule.occurrenceCount,
        startDate: rule.startDate,
      }
    : null;
}

/** Pure proposal generation. It never reads or writes SQLite. */
export function buildRecoveryPlan(
  tasks: readonly Task[],
  recurrenceRules: ReadonlyMap<string, RecurrenceRule | null> = new Map(),
  context: RecoveryBuildContext,
): RecoveryPlan {
  const generatedAt = context.generatedAt ?? context.now.toISOString();
  const proposals: RecoveryProposal[] = [];

  for (const task of tasks) {
    const classification = classify(task, context);
    if (!classification) continue;
    const previous = scheduleForTask(task);
    const proposed = recommendation(task, classification);
    proposals.push({
      id: `recovery:${task.id}:${task.updatedAt}`,
      taskId: task.id,
      taskTitle: task.title,
      priority: task.priority,
      taskUpdatedAt: task.updatedAt,
      previous,
      proposed,
      reason: classification.reason,
      generatedAt,
      alternatives: buildAlternatives(task, classification, proposed),
      recurrence: recurrenceMetadata(recurrenceRules.get(task.id)),
    });
  }

  proposals.sort((a, b) => {
    const dateOrder = (a.previous.dueDate ?? '').localeCompare(b.previous.dueDate ?? '');
    if (dateOrder !== 0) return dateOrder;
    const priorityOrder = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityOrder !== 0) return priorityOrder;
    const timeOrder = (a.previous.dueTime ?? '').localeCompare(b.previous.dueTime ?? '');
    return timeOrder !== 0 ? timeOrder : a.taskId.localeCompare(b.taskId);
  });

  return {
    id: `recovery-plan:${generatedAt}`,
    generatedAt,
    proposals,
  };
}

/** Read-domain facade: candidate SQL stays bounded and proposals stay ephemeral. */
export class RecoveryService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly recurrenceRules: RecurrenceRulesRepository,
  ) {}

  async generatePlan(now: Date = new Date()): Promise<RecoveryPlan> {
    const deviceTimezone = getDeviceTimeZone() ?? null;
    const deviceDate = getLocalDateString(now);
    // Fixed-timezone tasks can be one calendar day ahead/behind the device.
    // The indexed query is intentionally bounded; pure generation applies the
    // exact timezone-aware eligibility rules afterward.
    const throughDate = addLocalCalendarDays(deviceDate, 1);
    const candidates = await this.tasks.listRecoveryCandidates(throughDate);
    const ruleEntries = await Promise.all(
      candidates.map(async (task) => [task.id, await this.recurrenceRules.getActiveForTask(task.id)] as const),
    );
    return buildRecoveryPlan(
      candidates,
      new Map(ruleEntries),
      { now, deviceTimezone },
    );
  }
}
