import { createId } from '@/lib/id';
import { reportNonFatalError } from '@/lib/nonFatalError';
import { getDeviceTimeZone, getLocalDateString, getLocalTimeString, getZonedDateTimeStrings, addLocalCalendarDays } from '@/temporal/localCalendar';
import { localDateTimeInZoneToDate } from '@/temporal/resolve';
import type { Reminder, Task } from '@/domain/entities';
import type { AppMetaRepository } from '@/db/repositories/appMetaRepository';
import type { NudgeEventsRepository } from '@/db/repositories/nudgeEventsRepository';
import type { RemindersRepository } from '@/db/repositories/remindersRepository';
import type { TasksRepository } from '@/db/repositories/tasksRepository';
import type { LocalNotificationProjection } from '@/services/notifications/localNotificationProjection';
import {
  DEFAULT_NUDGE_PLANNER_SETTINGS,
  NudgePlanner,
} from '@/domain/nudgePlanner';
import {
  NUDGE_POLICY_VERSION,
  createEmptyNudgeProfile,
  type NudgeEvent,
  type NudgeEventType,
  type NudgePlanResult,
  type NudgePlannerSettings,
  type NudgeTimeBucket,
} from '@/domain/nudges';

const ADAPTIVE_NUDGES_ENABLED_KEY = 'adaptive_nudges.enabled';
const ADAPTIVE_NUDGES_TIMEZONE_KEY = 'adaptive_nudges.device_timezone';
const MAX_PLANNED_TASKS = 100;

export type NotificationNudgeAction = 'snooze' | 'tomorrow';

export interface NotificationNudgeActionInput {
  reminder: Reminder;
  action: NotificationNudgeAction;
  responseKey: string;
  now: Date;
  target?: {
    scheduledDate: string;
    scheduledTime: string;
    timezone: string | null;
    semantics: Reminder['semantics'];
  };
}

export interface NotificationNudgeOpenedInput {
  reminder: Reminder;
  responseKey: string;
  now: Date;
}

export interface NudgeDiagnostics {
  enabled: boolean;
  profileSampleCount: number;
  confidence: string;
  eventCounts: Awaited<ReturnType<NudgeEventsRepository['count']>>;
  activeAdaptiveNudges: number;
}

function localDateAndTime(instant: Date, timezone: string | null | undefined): { date: string; time: string } {
  if (timezone) return getZonedDateTimeStrings(instant, timezone);
  return { date: getLocalDateString(instant), time: getLocalTimeString(instant) };
}

function timeBucket(time: string): NudgeTimeBucket {
  const hour = Number(time.slice(0, 2));
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  return 'evening';
}

function localWeekday(instant: Date, timezone: string | null | undefined): number {
  const value = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone ?? undefined,
    weekday: 'short',
  }).format(instant);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value);
}

function buildEvent(input: {
  eventType: NudgeEventType;
  taskId?: string | null;
  nudgeId?: string | null;
  occurredAt: Date;
  source: string;
  numericValue?: number | null;
  secondaryNumericValue?: number | null;
  dedupeKey?: string | null;
  timezone?: string | null;
}): NudgeEvent {
  const local = localDateAndTime(input.occurredAt, input.timezone);
  return {
    id: createId(),
    eventType: input.eventType,
    taskId: input.taskId ?? null,
    nudgeId: input.nudgeId ?? null,
    occurredAt: input.occurredAt.toISOString(),
    localWeekday: Math.max(0, localWeekday(input.occurredAt, input.timezone)),
    timeBucket: timeBucket(local.time),
    source: input.source,
    numericValue: input.numericValue ?? null,
    secondaryNumericValue: input.secondaryNumericValue ?? null,
    policyVersion: NUDGE_POLICY_VERSION,
    dedupeKey: input.dedupeKey ?? null,
  };
}

function targetInstant(target: NotificationNudgeActionInput['target']): Date | null {
  if (!target) return null;
  try {
    const timezone = target.semantics === 'fixed' ? target.timezone : getDeviceTimeZone();
    if (timezone) return localDateTimeInZoneToDate(target.scheduledDate, target.scheduledTime, timezone);
    const [year, month, day] = target.scheduledDate.split('-').map(Number);
    const [hour, minute] = target.scheduledTime.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  } catch {
    return null;
  }
}

function completionDelayMinutes(task: Task): number | null {
  if (!task.completedAt || !task.dueDate || !task.dueTime) return null;
  try {
    const timezone = task.dueSemantics === 'fixed'
      ? task.dueTimezone ?? getDeviceTimeZone()
      : getDeviceTimeZone();
    const due = timezone
      ? localDateTimeInZoneToDate(task.dueDate, task.dueTime, timezone)
      : new Date(`${task.dueDate}T${task.dueTime}:00`);
    const value = (new Date(task.completedAt).getTime() - due.getTime()) / 60_000;
    return Number.isFinite(value) ? Math.max(-24 * 60, Math.min(7 * 24 * 60, value)) : null;
  } catch {
    return null;
  }
}

function completionRelativeToNudgeMinutes(task: Task, reminder: Reminder): number | null {
  if (!task.completedAt || !reminder.scheduledDate || !reminder.scheduledTime) return null;
  try {
    const timezone = reminder.semantics === 'fixed'
      ? reminder.timezone ?? getDeviceTimeZone()
      : getDeviceTimeZone();
    const nudgedAt = timezone
      ? localDateTimeInZoneToDate(reminder.scheduledDate, reminder.scheduledTime, timezone)
      : new Date(`${reminder.scheduledDate}T${reminder.scheduledTime}:00`);
    const value = (new Date(task.completedAt).getTime() - nudgedAt.getTime()) / 60_000;
    return Number.isFinite(value) ? Math.max(-24 * 60, Math.min(7 * 24 * 60, value)) : null;
  } catch {
    return null;
  }
}

function newestReminder(reminders: readonly Reminder[]): Reminder | null {
  return [...reminders].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

/** Domain service for local behavioral learning and derived nudge intent. */
export class NudgeService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly reminders: RemindersRepository,
    private readonly events: NudgeEventsRepository,
    private readonly appMeta: AppMetaRepository,
    private readonly projection: LocalNotificationProjection,
  ) {}

  async isEnabled(): Promise<boolean> {
    return (await this.appMeta.get(ADAPTIVE_NUDGES_ENABLED_KEY)) === '1';
  }

  private plannerSettings(enabled: boolean): NudgePlannerSettings {
    return {
      ...DEFAULT_NUDGE_PLANNER_SETTINGS,
      enabled,
      deviceTimezone: getDeviceTimeZone() ?? null,
    };
  }

  private async projectReminders(reminders: readonly Reminder[]): Promise<void> {
    for (const reminder of reminders) {
      try {
        await this.projection.project(reminder);
      } catch (error) {
        // SQLite desired state remains dirty for reliability reconciliation.
        reportNonFatalError('adaptive-nudge-projection', error);
      }
    }
  }

  private async cancelTaskNudges(taskId: string): Promise<void> {
    const before = await this.reminders.listAdaptiveNudgesForTask(taskId);
    if (before.every((item) => !item.enabled)) return;
    await this.reminders.cancelAdaptiveNudgesForTask(taskId);
    const after = await this.reminders.listAdaptiveNudgesForTask(taskId);
    await this.projectReminders(after.filter((item) => !item.enabled && item.projectionDirty));
  }

  private async cancelAllNudges(): Promise<void> {
    const before = await this.reminders.listAdaptiveNudges();
    if (before.every((item) => !item.enabled)) return;
    await this.reminders.cancelAllAdaptiveNudges();
    const after = await this.reminders.listAdaptiveNudges();
    await this.projectReminders(after.filter((item) => !item.enabled && item.projectionDirty));
  }

  private async invalidateFloatingNudges(): Promise<void> {
    const floating = (await this.reminders.listAdaptiveNudges()).filter(
      (item) => item.enabled && item.semantics === 'floating',
    );
    for (const reminder of floating) await this.reminders.cancelAdaptiveNudge(reminder.id);
    const refreshed = await Promise.all(floating.map((item) => this.reminders.getById(item.id)));
    await this.projectReminders(refreshed.filter((item): item is Reminder => Boolean(item && item.projectionDirty)));
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.appMeta.set(ADAPTIVE_NUDGES_ENABLED_KEY, enabled ? '1' : '0');
    if (!enabled) {
      await this.cancelAllNudges();
      return;
    }
    await this.replanBoundedHorizon();
  }

  async replanTask(taskId: string, now = new Date()): Promise<NudgePlanResult> {
    const enabled = await this.isEnabled();
    const task = await this.tasks.getById(taskId, { includeDeleted: true });
    if (!task) {
      await this.cancelTaskNudges(taskId);
      return {
        status: 'none', reason: 'suppressed_task_deleted', confidence: 'insufficient',
      };
    }

    const reminders = await this.reminders.listForTask(task.id);

    const adaptive = reminders.filter((reminder) => reminder.kind === 'adaptive_followup');
    const primary = reminders.find((reminder) => reminder.kind !== 'adaptive_followup') ?? null;
    const lastDeferral = enabled ? await this.events.getLastDeferralForTask(task.id) : null;
    const profile = enabled ? await this.events.getProfile() : createEmptyNudgeProfile();
    const plannerState = (adaptiveNudgesToday: number, globalAdaptiveNudgesToday: number) => ({
      primaryReminder: primary,
      adaptiveNudges: adaptive,
      adaptiveNudgesToday,
      globalAdaptiveNudgesToday,
      lastAdaptiveNudgeAt: newestReminder(adaptive)?.createdAt ?? null,
      lastExplicitDeferralAt: lastDeferral?.occurredAt ?? null,
      lastExplicitDeferralNudgeId: lastDeferral?.nudgeId ?? null,
    });
    const plannerSettings = this.plannerSettings(enabled);
    // First derive the candidate without a guessed budget date. The planner
    // returns the exact local slot, after which the indexed budget query can
    // enforce pressure limits for that slot (including a learned next-day
    // window).
    let plan = NudgePlanner.plan(
      task,
      plannerState(0, 0),
      profile,
      plannerSettings,
      now,
    );
    if (plan.status === 'proposed' && plan.proposal) {
      const [taskBudget, globalBudget] = await Promise.all([
        this.reminders.countAdaptiveNudgesForDate(plan.proposal.scheduledDate, task.id),
        this.reminders.countAdaptiveNudgesForDate(plan.proposal.scheduledDate),
      ]);
      plan = NudgePlanner.plan(
        task,
        plannerState(taskBudget, globalBudget),
        profile,
        plannerSettings,
        now,
      );
    }

    if (plan.status === 'proposed' && plan.proposal) {
      const saved = await this.reminders.upsertAdaptiveNudge({
        taskId: task.id,
        scheduledDate: plan.proposal.scheduledDate,
        scheduledTime: plan.proposal.scheduledTime,
        timezone: plan.proposal.timezone,
        semantics: plan.proposal.semantics,
        timingPrecision: plan.proposal.timingPrecision,
        enabled: true,
        kind: 'adaptive_followup',
        reason: plan.proposal.reason,
        generationSource: plan.proposal.generationSource,
        policyVersion: plan.proposal.policyVersion,
        idempotencyKey: plan.proposal.idempotencyKey,
      });
      try {
        await this.projection.project(saved);
      } catch (error) {
        reportNonFatalError('adaptive-nudge-projection', error);
      }
      return plan;
    }

    if (
      !enabled
      || plan.reason === 'suppressed_task_complete'
      || plan.reason === 'suppressed_task_deleted'
      || plan.reason === 'delegated_to_smart_recovery'
      || plan.reason === 'no_schedule'
      || plan.reason === 'invalid_schedule'
      || plan.reason === 'negative_timing_feedback'
      || plan.reason === 'outside_horizon'
      || plan.reason === 'explicit_deferral_cooldown'
    ) {
      await this.cancelTaskNudges(task.id);
    }
    return plan;
  }

  async replanBoundedHorizon(now = new Date()): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      await this.cancelAllNudges();
      return;
    }
    const timezone = getDeviceTimeZone() ?? 'unknown';
    const previousTimezone = await this.appMeta.get(ADAPTIVE_NUDGES_TIMEZONE_KEY);
    if (previousTimezone !== timezone) await this.invalidateFloatingNudges();
    await this.appMeta.set(ADAPTIVE_NUDGES_TIMEZONE_KEY, timezone);
    const existing = await this.reminders.listAdaptiveNudges(MAX_PLANNED_TASKS);
    for (const taskId of new Set(existing.map((item) => item.taskId))) {
      const task = await this.tasks.getById(taskId, { includeDeleted: true });
      if (!task || task.completed || task.deletedAt) await this.cancelTaskNudges(taskId);
      else await this.replanTask(taskId, now);
    }
    const deviceDate = localDateAndTime(now, getDeviceTimeZone()).date;
    const throughDate = addLocalCalendarDays(deviceDate, DEFAULT_NUDGE_PLANNER_SETTINGS.planningHorizonDays + 1);
    const tasks = await this.tasks.listNudgeCandidates(
      throughDate,
      MAX_PLANNED_TASKS,
      deviceDate,
    );
    for (const task of tasks) await this.replanTask(task.id, now);
  }

  async recordTaskCompleted(task: Task, source = 'manual'): Promise<void> {
    const adaptive = await this.reminders.listAdaptiveNudgesForTask(task.id);
    const nudge = newestReminder(adaptive.filter((reminder) => reminder.enabled));
    const timezone = task.dueSemantics === 'fixed' ? task.dueTimezone ?? getDeviceTimeZone() : getDeviceTimeZone();
    const completedAt = task.completedAt ? new Date(task.completedAt) : new Date();
    let appendError: unknown = null;
    try {
      await this.events.append(buildEvent({
        eventType: source === 'notification_action'
          ? 'notification_action_complete'
          : 'task_completed',
        taskId: task.id,
        nudgeId: nudge?.id ?? null,
        occurredAt: completedAt,
        source: nudge ? 'adaptive_nudge' : source,
        numericValue: completionDelayMinutes(task),
        secondaryNumericValue: nudge ? completionRelativeToNudgeMinutes(task, nudge) : null,
        dedupeKey: `task-completed:${task.id}:${task.completedAt ?? completedAt.toISOString()}`,
        timezone,
      }));
    } catch (error) {
      appendError = error;
    }
    if (nudge && await this.reminders.markAdaptiveNudgeConsumed(nudge.id)) {
      const consumed = await this.reminders.getById(nudge.id);
      if (consumed?.projectionDirty) await this.projectReminders([consumed]);
    }
    await this.cancelTaskNudges(task.id);
    if (appendError) throw appendError;
  }

  async recordTaskRescheduled(task: Task, source = 'manual'): Promise<void> {
    if (source === 'recovery' || source === 'recovery_undo') return;
    const timezone = task.dueSemantics === 'fixed' ? task.dueTimezone ?? getDeviceTimeZone() : getDeviceTimeZone();
    let appendError: unknown = null;
    try {
      await this.events.append(buildEvent({
        eventType: 'task_rescheduled',
        taskId: task.id,
        occurredAt: new Date(task.updatedAt),
        source,
        timezone,
      }));
    } catch (error) {
      appendError = error;
    }
    await this.cancelTaskNudges(task.id);
    if (appendError) throw appendError;
  }

  async recordSmartRecovery(taskId: string, accepted: boolean, occurredAt = new Date()): Promise<void> {
    let appendError: unknown = null;
    try {
      await this.events.append(buildEvent({
        eventType: accepted ? 'smart_recovery_accepted' : 'smart_recovery_rejected',
        taskId,
        occurredAt,
        source: 'smart_recovery',
        timezone: getDeviceTimeZone() ?? null,
      }));
    } catch (error) {
      appendError = error;
    }
    if (accepted) await this.cancelTaskNudges(taskId);
    if (appendError) throw appendError;
  }

  async recordNotificationAction(input: NotificationNudgeActionInput): Promise<void> {
    const isAdaptive = input.reminder.kind === 'adaptive_followup';
    const instant = input.action === 'snooze' ? targetInstant(input.target) : null;
    const numericValue = instant
      ? Math.max(1, Math.min(240, (instant.getTime() - input.now.getTime()) / 60_000))
      : null;
    const timezone = input.reminder.semantics === 'fixed'
      ? input.reminder.timezone ?? getDeviceTimeZone()
      : getDeviceTimeZone();
    let appendError: unknown = null;
    try {
      await this.events.append(buildEvent({
        eventType: input.action === 'snooze'
          ? 'notification_action_snooze'
          : 'notification_action_tomorrow',
        taskId: input.reminder.taskId,
        nudgeId: isAdaptive ? input.reminder.id : null,
        occurredAt: input.now,
        source: isAdaptive ? 'adaptive_nudge_action' : 'notification_action',
        numericValue,
        dedupeKey: input.responseKey,
        timezone,
      }));
    } catch (error) {
      appendError = error;
    }
    // A primary Snooze/Tomorrow is explicit negative feedback for any
    // derived follow-up already pending for the same task. Keep this safety
    // action independent of the learning write.
    if (!isAdaptive) await this.cancelTaskNudges(input.reminder.taskId);
    if (appendError) throw appendError;
  }

  async recordNotificationOpened(input: NotificationNudgeOpenedInput): Promise<void> {
    const isAdaptive = input.reminder.kind === 'adaptive_followup';
    const timezone = input.reminder.semantics === 'fixed'
      ? input.reminder.timezone ?? getDeviceTimeZone()
      : getDeviceTimeZone();
    await this.events.append(buildEvent({
      eventType: 'notification_opened',
      taskId: input.reminder.taskId,
      nudgeId: isAdaptive ? input.reminder.id : null,
      occurredAt: input.now,
      source: isAdaptive ? 'adaptive_nudge_opened' : 'notification_opened',
      dedupeKey: input.responseKey,
      timezone,
    }));
  }

  async resetLearning(): Promise<void> {
    await this.events.reset();
    await this.cancelAllNudges();
    if (await this.isEnabled()) await this.replanBoundedHorizon();
  }

  async diagnostics(): Promise<NudgeDiagnostics> {
    const profile = await this.events.getProfile();
    return {
      enabled: await this.isEnabled(),
      profileSampleCount: profile.sampleCount,
      confidence: profile.confidence,
      eventCounts: await this.events.count(),
      activeAdaptiveNudges: (await this.reminders.listAdaptiveNudges()).filter((item) => item.enabled).length,
    };
  }
}
