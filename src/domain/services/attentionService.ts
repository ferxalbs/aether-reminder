import type { AppMetaRepository } from "@/db/repositories/appMetaRepository";
import type { TasksRepository } from "@/db/repositories/tasksRepository";
import type { Task } from "@/domain/entities";
import type { RecoveryPlan } from "@/domain/recovery";
import {
  ATTENTION_POLICY,
  AttentionPlanner,
  type AttentionCandidateFacts,
  type AttentionFocusIntent,
  type AttentionPlan,
  type AttentionTemporalFacts,
} from "@/domain/attentionPlanner";
import {
  addLocalCalendarDays,
  getDeviceTimeZone,
  getLocalDateString,
  getLocalTimeString,
  getZonedDateTimeStrings,
} from "@/temporal/localCalendar";
import {
  isValidLocalDate,
  isValidLocalTime,
  localDateTimeInZoneToDate,
} from "@/temporal/resolve";
import type { NudgeService } from "./nudgeService";
import type { ReliabilityDiagnosticsService } from "@/services/reliability/reliabilityDiagnostics";

export const ATTENTION_FOCUS_META_KEY = "attention.focus";
export const ATTENTION_CANDIDATE_LIMIT = ATTENTION_POLICY.candidateLimit;

export interface AttentionPlanOptions {
  now?: Date;
  recoveryPlan?: RecoveryPlan | null;
  previousPlan?: AttentionPlan | null;
  suppressedTaskIds?: readonly string[];
}

function parseFocus(value: string | null): AttentionFocusIntent | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof parsed.taskId === "string" &&
      parsed.taskId.length > 0 &&
      typeof parsed.createdAt === "string" &&
      parsed.source === "manual"
    ) {
      return {
        taskId: parsed.taskId,
        createdAt: parsed.createdAt,
        source: "manual",
      };
    }
  } catch {
    // Invalid persisted intent is cleared by the caller.
  }
  return null;
}

function timezoneFor(
  task: Task,
  deviceTimezone: string | undefined,
): string | null {
  return task.dueSemantics === "fixed"
    ? (task.dueTimezone ?? deviceTimezone ?? null)
    : (deviceTimezone ?? null);
}

function localParts(
  now: Date,
  timezone: string | null,
): { date: string; time: string } {
  return timezone
    ? getZonedDateTimeStrings(now, timezone)
    : { date: getLocalDateString(now), time: getLocalTimeString(now) };
}

function localInstant(
  date: string,
  time: string,
  timezone: string | null,
): Date {
  if (timezone) return localDateTimeInZoneToDate(date, time, timezone);
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function dayDifference(from: string, to: string): number | null {
  if (!isValidLocalDate(from) || !isValidLocalDate(to)) return null;
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) -
      Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      86_400_000,
  );
}

function nextDateBoundary(
  localDate: string,
  timezone: string | null,
): number | null {
  const tomorrow = addLocalCalendarDays(localDate, 1);
  try {
    return localInstant(tomorrow, "00:00", timezone).getTime();
  } catch {
    return null;
  }
}

function dateOnlyTemporal(
  dueDate: string,
  localDate: string,
): AttentionTemporalFacts {
  const daysUntilDue = dayDifference(localDate, dueDate);
  const isToday = dueDate === localDate;
  return {
    status: "date_only",
    dueAtMs: null,
    relevantDueDate: dueDate,
    isToday,
    isDueNow: false,
    minutesUntilDue: null,
    daysUntilDue,
    isInNearFuture:
      daysUntilDue !== null &&
      daysUntilDue > 0 &&
      daysUntilDue <= ATTENTION_POLICY.futureWindowDays,
    nextMeaningfulAtMs: null,
  };
}

function buildTemporalFacts(
  task: Task,
  now: Date,
  localDate: string,
  deviceTimezone: string | undefined,
): AttentionTemporalFacts {
  if (!task.dueDate || !isValidLocalDate(task.dueDate)) {
    return {
      status: "undated",
      dueAtMs: null,
      relevantDueDate: null,
      isToday: false,
      isDueNow: false,
      minutesUntilDue: null,
      daysUntilDue: null,
      isInNearFuture: false,
      nextMeaningfulAtMs: null,
    };
  }

  if (!task.dueTime || !isValidLocalTime(task.dueTime)) {
    return dateOnlyTemporal(task.dueDate, localDate);
  }

  const timezone = timezoneFor(task, deviceTimezone);
  try {
    const dueAt = localInstant(task.dueDate, task.dueTime, timezone);
    const minutesUntilDue = (dueAt.getTime() - now.getTime()) / 60_000;
    const daysUntilDue = dayDifference(localDate, task.dueDate);
    const isToday = task.dueDate === localDate;
    const isInNearFuture =
      daysUntilDue !== null &&
      daysUntilDue > 0 &&
      daysUntilDue <= ATTENTION_POLICY.futureWindowDays;
    const imminentBoundary =
      dueAt.getTime() - ATTENTION_POLICY.imminentWindowMinutes * 60_000;
    const nextMeaningfulAtMs =
      now.getTime() < imminentBoundary
        ? imminentBoundary
        : now.getTime() < dueAt.getTime()
          ? dueAt.getTime()
          : null;
    return {
      status: "timed",
      dueAtMs: dueAt.getTime(),
      relevantDueDate: task.dueDate,
      isToday,
      isDueNow: minutesUntilDue <= 0,
      minutesUntilDue,
      daysUntilDue,
      isInNearFuture,
      nextMeaningfulAtMs,
    };
  } catch {
    // A malformed timezone must not create a false imminent recommendation.
    return dateOnlyTemporal(task.dueDate, localDate);
  }
}

function buildCandidate(
  task: Task,
  now: Date,
  localDate: string,
  deviceTimezone: string | undefined,
  focus: AttentionFocusIntent | null,
  nudgeState: AttentionCandidateFacts["adaptiveNudge"],
  recoveryTaskIds: ReadonlySet<string>,
): AttentionCandidateFacts {
  return {
    taskId: task.id,
    title: task.title,
    priority: task.priority,
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    dueTimezone: task.dueTimezone,
    dueSemantics: task.dueSemantics,
    createdAt: task.createdAt,
    temporal: buildTemporalFacts(task, now, localDate, deviceTimezone),
    explicitFocus: focus?.taskId === task.id,
    adaptiveNudge: nudgeState,
    recoveryOwned: recoveryTaskIds.has(task.id),
    recoveredRecently: false,
  };
}

function dedupeTasks(tasks: readonly Task[]): Task[] {
  const byId = new Map<string, Task>();
  for (const task of tasks) {
    if (!task.completed && !task.deletedAt) byId.set(task.id, task);
  }
  return [...byId.values()];
}

export class AttentionService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly nudges: NudgeService,
    private readonly reliability: ReliabilityDiagnosticsService,
    private readonly appMeta: AppMetaRepository,
  ) {}

  async getFocus(): Promise<AttentionFocusIntent | null> {
    const focus = parseFocus(await this.appMeta.get(ATTENTION_FOCUS_META_KEY));
    if (!focus) {
      await this.appMeta
        .delete(ATTENTION_FOCUS_META_KEY)
        .catch(() => undefined);
      return null;
    }
    const task = await this.tasks.getById(focus.taskId);
    if (!task || task.completed || task.deletedAt) {
      await this.appMeta
        .delete(ATTENTION_FOCUS_META_KEY)
        .catch(() => undefined);
      return null;
    }
    return focus;
  }

  async focusNow(
    taskId: string,
    now = new Date(),
  ): Promise<AttentionFocusIntent> {
    const task = await this.tasks.getById(taskId);
    if (!task || task.completed || task.deletedAt)
      throw new Error("Task is not available for focus.");
    const focus: AttentionFocusIntent = {
      taskId,
      createdAt: now.toISOString(),
      source: "manual",
    };
    await this.appMeta.set(ATTENTION_FOCUS_META_KEY, JSON.stringify(focus));
    return focus;
  }

  async clearFocus(): Promise<void> {
    await this.appMeta.delete(ATTENTION_FOCUS_META_KEY);
  }

  async plan(options: AttentionPlanOptions = {}): Promise<AttentionPlan> {
    const now = options.now ?? new Date();
    const deviceTimezone = getDeviceTimeZone();
    const currentLocal = localParts(now, deviceTimezone ?? null);
    const focus = await this.getFocus();
    const [nudgeSignals, reliabilityState] = await Promise.all([
      this.nudges.getAttentionSignals(now, ATTENTION_CANDIDATE_LIMIT),
      this.reliability.collectAttentionState(),
    ]);

    const [windowTasks, focusedTask] = await Promise.all([
      this.tasks.listAttentionCandidates({
        fromDate: addLocalCalendarDays(
          currentLocal.date,
          -ATTENTION_POLICY.candidateLookbackDays,
        ),
        throughDate: addLocalCalendarDays(
          currentLocal.date,
          ATTENTION_POLICY.futureWindowDays,
        ),
        explicitTaskIds: focus ? [focus.taskId] : [],
        limit: ATTENTION_CANDIDATE_LIMIT,
      }),
      focus ? this.tasks.getById(focus.taskId) : Promise.resolve(null),
    ]);
    const recoveryTaskIds = new Set(
      options.recoveryPlan?.proposals.map((proposal) => proposal.taskId) ?? [],
    );
    const candidates = dedupeTasks([
      ...windowTasks,
      ...(focusedTask ? [focusedTask] : []),
    ]).map((task) =>
      buildCandidate(
        task,
        now,
        currentLocal.date,
        deviceTimezone,
        focus,
        nudgeSignals.get(task.id) ?? "no_nudge",
        recoveryTaskIds,
      ),
    );

    return AttentionPlanner.plan({
      candidates,
      recoveryState: {
        proposalCount: options.recoveryPlan?.proposals.length ?? 0,
        taskIds:
          options.recoveryPlan?.proposals.map((proposal) => proposal.taskId) ??
          [],
      },
      reliabilityState,
      explicitFocus: focus,
      temporalContext: {
        now,
        localDate: currentLocal.date,
        nextDateBoundaryAtMs: nextDateBoundary(
          currentLocal.date,
          deviceTimezone ?? null,
        ),
      },
      previousPlan: options.previousPlan,
      suppressedTaskIds: options.suppressedTaskIds,
      now,
    });
  }
}
