import type { Task } from './entities';
import {
  addLocalCalendarDays,
  getDeviceTimeZone,
  getLocalDateString,
  getLocalTimeString,
  getZonedDateTimeStrings,
} from '@/temporal/localCalendar';
import { isValidLocalDate, isValidLocalTime, localDateTimeInZoneToDate } from '@/temporal/resolve';
import {
  NUDGE_BASELINE_DELAY_MINUTES,
  NUDGE_COOLDOWN_MINUTES,
  NUDGE_DATE_ONLY_TIME,
  NUDGE_MAX_DELAY_MINUTES,
  NUDGE_MIN_DELAY_MINUTES,
  NUDGE_POLICY_VERSION,
  NUDGE_RECOVERY_HANDOFF_MINUTES,
  NUDGE_PLANNING_HORIZON_DAYS,
  NUDGE_SNOOZE_MAX_MINUTES,
  type NudgeDecisionReason,
  type NudgePlanResult,
  type NudgePlannerSettings,
  type NudgeProfile,
  type NudgeProposal,
  type NudgeReminderState,
  type NudgeTimeBucket,
  preferredNudgeDelayMinutes,
  preferredNudgeTimeBucket,
  sanitizeNudgeProfile,
} from './nudges';

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function localParts(date: Date, timezone: string | null | undefined): { date: string; time: string } {
  if (timezone) return getZonedDateTimeStrings(date, timezone);
  return { date: getLocalDateString(date), time: getLocalTimeString(date) };
}

function effectiveTimezone(task: Task, settings: NudgePlannerSettings): string | null {
  if (task.dueSemantics === 'fixed') {
    return task.dueTimezone ?? settings.deviceTimezone ?? getDeviceTimeZone() ?? null;
  }
  return settings.deviceTimezone ?? getDeviceTimeZone() ?? null;
}

function localDateTimeToDate(date: string, time: string, timezone: string | null): Date {
  if (timezone) return localDateTimeInZoneToDate(date, time, timezone);
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (!Number.isFinite(value.getTime())) throw new Error('Invalid local nudge date.');
  return value;
}

function minutesSince(value: string, now: Date): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? (now.getTime() - parsed) / 60_000 : Number.POSITIVE_INFINITY;
}

function timeBucketForTime(time: string): NudgeTimeBucket {
  const hour = Number(time.slice(0, 2));
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  return 'evening';
}

const PREFERRED_BUCKET_START: Record<NudgeTimeBucket, string> = {
  morning: '05:00',
  midday: '11:00',
  afternoon: '14:00',
  evening: '18:00',
};

function nextPreferredBucketStart(
  candidate: Date,
  preferredBucket: NudgeTimeBucket,
  timezone: string | null,
): Date {
  const current = localParts(candidate, timezone);
  let date = current.date;
  let next = localDateTimeToDate(date, PREFERRED_BUCKET_START[preferredBucket], timezone);
  if (next <= candidate) {
    date = addLocalCalendarDays(date, 1);
    next = localDateTimeToDate(date, PREFERRED_BUCKET_START[preferredBucket], timezone);
  }
  return next;
}

function activeAdaptiveNudge(state: NudgeReminderState): boolean {
  return state.adaptiveNudges.some((nudge) =>
    nudge.enabled && !nudge.cancelledAt && !nudge.consumedAt,
  );
}

function negativeTimingFeedback(profile: NudgeProfile, bucket: NudgeTimeBucket): boolean {
  const samples = profile.timingSamples[bucket];
  const deferrals = profile.timingDeferrals[bucket];
  const completions = profile.timingCompletions[bucket];
  return profile.confidence === 'confident' && samples >= 3 && deferrals >= 2 && deferrals > completions * 2;
}

function baselineReason(profile: NudgeProfile): NudgeDecisionReason {
  return profile.sampleCount === 0 ? 'insufficient_learning_data' : 'baseline_followup';
}

function result(
  status: NudgePlanResult['status'],
  reason: NudgeDecisionReason,
  profile: NudgeProfile,
  proposal?: NudgeProposal,
): NudgePlanResult {
  return proposal ? { status, reason, confidence: profile.confidence, proposal } : {
    status,
    reason,
    confidence: profile.confidence,
  };
}

/**
 * Pure, deterministic Adaptive Nudge policy. It proposes one derived
 * opportunity and never changes Task.due* or recurrence state.
 */
export function planNudge(
  task: Task,
  reminderState: NudgeReminderState,
  profileInput: NudgeProfile,
  settingsInput: NudgePlannerSettings,
  now: Date,
): NudgePlanResult {
  const profile = sanitizeNudgeProfile(profileInput);
  const settings: NudgePlannerSettings = {
    enabled: settingsInput.enabled,
    maxAdaptiveNudgesPerTaskPerDay: Math.max(1, Math.floor(settingsInput.maxAdaptiveNudgesPerTaskPerDay)),
    maxAdaptiveNudgesPerDay: Math.max(1, Math.floor(settingsInput.maxAdaptiveNudgesPerDay)),
    cooldownMinutes: Math.max(0, settingsInput.cooldownMinutes),
    recoveryHandoffMinutes: Math.max(NUDGE_RECOVERY_HANDOFF_MINUTES, settingsInput.recoveryHandoffMinutes),
    planningHorizonDays: Math.max(1, settingsInput.planningHorizonDays),
    deviceTimezone: settingsInput.deviceTimezone,
  };

  if (!settings.enabled) return result('none', 'adaptive_nudges_disabled', profile);
  if (task.completed) return result('none', 'suppressed_task_complete', profile);
  if (task.deletedAt) return result('none', 'suppressed_task_deleted', profile);
  if (!task.dueDate) return result('none', 'no_schedule', profile);
  if (!isValidLocalDate(task.dueDate)) return result('none', 'invalid_schedule', profile);
  if (task.dueTime !== null && !isValidLocalTime(task.dueTime)) return result('none', 'invalid_schedule', profile);
  if (reminderState.lastExplicitDeferralAt
    && minutesSince(reminderState.lastExplicitDeferralAt, now) < settings.cooldownMinutes
    && !reminderState.adaptiveNudges.some((nudge) =>
      nudge.enabled && nudge.id === reminderState.lastExplicitDeferralNudgeId,
    )) {
    return result('none', 'explicit_deferral_cooldown', profile);
  }

  const timezone = effectiveTimezone(task, settings);
  let candidate: Date;
  let due: Date | null = null;
  try {
    const clock = localParts(now, timezone);
    if (task.dueTime === null) {
      // Date-only tasks receive an engine-owned flexible evening opportunity;
      // the task remains date-only and its user schedule is untouched.
      if (task.dueDate < clock.date) return result('none', 'delegated_to_smart_recovery', profile);
      candidate = localDateTimeToDate(task.dueDate, NUDGE_DATE_ONLY_TIME, timezone);
      if (candidate <= now) return result('none', 'no_schedule', profile);
    } else {
      due = localDateTimeToDate(task.dueDate, task.dueTime, timezone);
      if (due <= now) {
        const elapsed = (now.getTime() - due.getTime()) / 60_000;
        if (elapsed >= settings.recoveryHandoffMinutes) {
          return result('none', 'delegated_to_smart_recovery', profile);
        }
        candidate = addMinutes(
          now,
          Math.max(NUDGE_MIN_DELAY_MINUTES, NUDGE_BASELINE_DELAY_MINUTES - elapsed),
        );
        if (candidate.getTime() > addMinutes(due, settings.recoveryHandoffMinutes).getTime()) {
          return result('none', 'delegated_to_smart_recovery', profile);
        }
      } else {
        const learnedDelay = preferredNudgeDelayMinutes(profile);
        candidate = addMinutes(due, learnedDelay ?? NUDGE_BASELINE_DELAY_MINUTES);
      }
    }
  } catch {
    return result('none', 'invalid_schedule', profile);
  }

  const horizon = addMinutes(now, settings.planningHorizonDays * 24 * 60);
  if (candidate > horizon) return result('none', 'outside_horizon', profile);

  let candidateParts = localParts(candidate, timezone);
  let bucket = timeBucketForTime(candidateParts.time);
  const preferredBucket = preferredNudgeTimeBucket(profile);
  if (preferredBucket && preferredBucket !== bucket && due && due > now) {
    const preferredCandidate = nextPreferredBucketStart(candidate, preferredBucket, timezone);
    candidate = preferredCandidate;
    candidateParts = localParts(candidate, timezone);
    bucket = timeBucketForTime(candidateParts.time);
  }

  if (candidate > horizon) return result('none', 'outside_horizon', profile);

  if (negativeTimingFeedback(profile, bucket)) {
    return result('none', 'negative_timing_feedback', profile);
  }

  if (activeAdaptiveNudge(reminderState)) return result('none', 'duplicate_pending_nudge', profile);

  if (reminderState.adaptiveNudgesToday >= settings.maxAdaptiveNudgesPerTaskPerDay
    || reminderState.globalAdaptiveNudgesToday >= settings.maxAdaptiveNudgesPerDay) {
    return result('suppressed_by_budget', 'suppressed_daily_budget', profile);
  }

  if (reminderState.lastAdaptiveNudgeAt
    && minutesSince(reminderState.lastAdaptiveNudgeAt, now) < settings.cooldownMinutes) {
    return result('none', 'cooldown', profile);
  }

  let reason = baselineReason(profile);
  const learnedDelay = preferredNudgeDelayMinutes(profile);
  if (learnedDelay !== null && due !== null && learnedDelay !== NUDGE_BASELINE_DELAY_MINUTES) {
    reason = 'learned_snooze_delay';
  } else if (preferredBucket === bucket) {
    reason = 'preferred_time_window';
  }

  // Keep output wall-clock values in the task's own temporal semantics. A
  // floating task intentionally has no persisted timezone.
  const proposal: NudgeProposal = {
    taskId: task.id,
    kind: 'adaptive_followup',
    scheduledDate: candidateParts.date,
    scheduledTime: candidateParts.time,
    timezone: task.dueSemantics === 'fixed' ? task.dueTimezone : null,
    semantics: task.dueSemantics,
    timingPrecision: 'flexible',
    reason,
    generationSource: 'adaptive_nudge_engine',
    policyVersion: NUDGE_POLICY_VERSION,
    idempotencyKey: `adaptive:${task.id}:${task.updatedAt}:${candidateParts.date}T${candidateParts.time}:${NUDGE_POLICY_VERSION}`,
    presentationPolicy: 'gentle',
  };
  return result('proposed', reason, profile, proposal);
}

export class NudgePlanner {
  static plan = planNudge;
}

export const DEFAULT_NUDGE_PLANNER_SETTINGS: Omit<NudgePlannerSettings, 'enabled'> = {
  maxAdaptiveNudgesPerTaskPerDay: 1,
  maxAdaptiveNudgesPerDay: 3,
  cooldownMinutes: NUDGE_COOLDOWN_MINUTES,
  recoveryHandoffMinutes: NUDGE_RECOVERY_HANDOFF_MINUTES,
  planningHorizonDays: NUDGE_PLANNING_HORIZON_DAYS,
};

export const NUDGE_DELAY_BOUNDS = {
  minimum: NUDGE_MIN_DELAY_MINUTES,
  baseline: NUDGE_BASELINE_DELAY_MINUTES,
  maximum: Math.min(NUDGE_MAX_DELAY_MINUTES, NUDGE_SNOOZE_MAX_MINUTES),
};
