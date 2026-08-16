import type { Reminder, Task } from "./entities";
import { RECOVERY_MISSED_GRACE_MINUTES } from "./recovery";

export const NUDGE_POLICY_VERSION = "adaptive-v1";
export const NUDGE_MINIMUM_SAMPLES = 5;
export const NUDGE_CONFIDENT_SAMPLES = 10;
export const NUDGE_BASELINE_DELAY_MINUTES = 20;
export const NUDGE_MIN_DELAY_MINUTES = 10;
export const NUDGE_MAX_DELAY_MINUTES = 25;
export const NUDGE_MAX_PER_TASK_PER_DAY = 1;
export const NUDGE_MAX_GLOBAL_PER_DAY = 3;
export const NUDGE_COOLDOWN_MINUTES = 120;
export const NUDGE_RECOVERY_HANDOFF_MINUTES = RECOVERY_MISSED_GRACE_MINUTES;
export const NUDGE_PLANNING_HORIZON_DAYS = 7;
export const NUDGE_DATE_ONLY_TIME = "18:00";
export const NUDGE_SNOOZE_MAX_MINUTES = 240;

export type NudgeTimeBucket = "morning" | "midday" | "afternoon" | "evening";
export type NudgeConfidence = "insufficient" | "emerging" | "confident";

export const NUDGE_TIME_BUCKETS: readonly NudgeTimeBucket[] = [
  "morning",
  "midday",
  "afternoon",
  "evening",
];

export type NudgeEventType =
  | "task_completed"
  | "notification_opened"
  | "notification_action_complete"
  | "notification_action_snooze"
  | "notification_action_tomorrow"
  | "smart_recovery_accepted"
  | "smart_recovery_rejected"
  | "task_rescheduled"
  | "adaptive_nudge_action";

export interface NudgeEvent {
  id: string;
  eventType: NudgeEventType;
  taskId: string | null;
  nudgeId: string | null;
  occurredAt: string;
  localWeekday: number;
  timeBucket: NudgeTimeBucket;
  source: string;
  /** Bounded numeric signal: snooze minutes or completion delay from due. */
  numericValue: number | null;
  /** Optional second bounded delta, currently completion relative to last nudge. */
  secondaryNumericValue?: number | null;
  policyVersion: string;
  /** Native response key or another local idempotency key. */
  dedupeKey: string | null;
}

export type NudgeCountMap = Record<NudgeTimeBucket, number>;

export interface NudgeProfile {
  policyVersion: string;
  sampleCount: number;
  confidence: NudgeConfidence;
  timingSamples: NudgeCountMap;
  timingCompletions: NudgeCountMap;
  timingDeferrals: NudgeCountMap;
  snoozeSamples: number;
  snoozeAverageMinutes: number | null;
  tomorrowCount: number;
  repeatedDeferrals: number;
  adaptiveCompletionCount: number;
  adaptiveDeferralCount: number;
  manualRescheduleCount: number;
  completionDelayAverageMinutes: number | null;
  adaptiveCompletionDelayAverageMinutes: number | null;
  lastEventAt: string | null;
  updatedAt: string;
}

export interface NudgePlannerSettings {
  enabled: boolean;
  maxAdaptiveNudgesPerTaskPerDay: number;
  maxAdaptiveNudgesPerDay: number;
  cooldownMinutes: number;
  recoveryHandoffMinutes: number;
  planningHorizonDays: number;
  deviceTimezone?: string | null;
}

export interface NudgeReminderState {
  primaryReminder: Reminder | null;
  adaptiveNudges: readonly Reminder[];
  adaptiveNudgesToday: number;
  globalAdaptiveNudgesToday: number;
  lastAdaptiveNudgeAt: string | null;
  lastExplicitDeferralAt: string | null;
  lastExplicitDeferralNudgeId?: string | null;
}

export type NudgeDecisionReason =
  | "baseline_followup"
  | "learned_snooze_delay"
  | "preferred_time_window"
  | "insufficient_learning_data"
  | "suppressed_daily_budget"
  | "suppressed_task_complete"
  | "suppressed_task_deleted"
  | "adaptive_nudges_disabled"
  | "duplicate_pending_nudge"
  | "cooldown"
  | "explicit_deferral_cooldown"
  | "delegated_to_smart_recovery"
  | "negative_timing_feedback"
  | "outside_horizon"
  | "no_schedule"
  | "invalid_schedule";

export type NudgePlanStatus = "proposed" | "none" | "suppressed_by_budget";

export interface NudgeProposal {
  taskId: string;
  kind: "adaptive_followup";
  scheduledDate: string;
  scheduledTime: string;
  timezone: string | null;
  semantics: Task["dueSemantics"];
  timingPrecision: "flexible";
  reason: NudgeDecisionReason;
  generationSource: "adaptive_nudge_engine";
  policyVersion: string;
  idempotencyKey: string;
  presentationPolicy: "gentle";
}

export interface NudgePlanResult {
  status: NudgePlanStatus;
  reason: NudgeDecisionReason;
  confidence: NudgeConfidence;
  proposal?: NudgeProposal;
}

function emptyCounts(): NudgeCountMap {
  return {
    morning: 0,
    midday: 0,
    afternoon: 0,
    evening: 0,
  };
}

export function confidenceForSamples(sampleCount: number): NudgeConfidence {
  if (sampleCount >= NUDGE_CONFIDENT_SAMPLES) return "confident";
  if (sampleCount >= NUDGE_MINIMUM_SAMPLES) return "emerging";
  return "insufficient";
}

export function createEmptyNudgeProfile(
  now = new Date().toISOString(),
): NudgeProfile {
  return {
    policyVersion: NUDGE_POLICY_VERSION,
    sampleCount: 0,
    confidence: "insufficient",
    timingSamples: emptyCounts(),
    timingCompletions: emptyCounts(),
    timingDeferrals: emptyCounts(),
    snoozeSamples: 0,
    snoozeAverageMinutes: null,
    tomorrowCount: 0,
    repeatedDeferrals: 0,
    adaptiveCompletionCount: 0,
    adaptiveDeferralCount: 0,
    manualRescheduleCount: 0,
    completionDelayAverageMinutes: null,
    adaptiveCompletionDelayAverageMinutes: null,
    lastEventAt: null,
    updatedAt: now,
  };
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeCountMap(value: unknown): NudgeCountMap {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    morning: Math.max(0, Math.floor(finiteNumber(record.morning))),
    midday: Math.max(0, Math.floor(finiteNumber(record.midday))),
    afternoon: Math.max(0, Math.floor(finiteNumber(record.afternoon))),
    evening: Math.max(0, Math.floor(finiteNumber(record.evening))),
  };
}

/** Tolerant reader for a locally persisted profile after upgrades or corruption. */
export function sanitizeNudgeProfile(value: unknown): NudgeProfile {
  const base = createEmptyNudgeProfile();
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const sampleCount = Math.max(0, Math.floor(finiteNumber(record.sampleCount)));
  const snoozeAverage = finiteNumber(record.snoozeAverageMinutes, NaN);
  const completionAverage = finiteNumber(
    record.completionDelayAverageMinutes,
    NaN,
  );
  const adaptiveCompletionAverage = finiteNumber(
    record.adaptiveCompletionDelayAverageMinutes,
    NaN,
  );
  return {
    ...base,
    policyVersion:
      typeof record.policyVersion === "string"
        ? record.policyVersion
        : base.policyVersion,
    sampleCount,
    confidence: confidenceForSamples(sampleCount),
    timingSamples: safeCountMap(record.timingSamples),
    timingCompletions: safeCountMap(record.timingCompletions),
    timingDeferrals: safeCountMap(record.timingDeferrals),
    snoozeSamples: Math.max(0, Math.floor(finiteNumber(record.snoozeSamples))),
    snoozeAverageMinutes: Number.isFinite(snoozeAverage)
      ? bounded(snoozeAverage, 1, NUDGE_SNOOZE_MAX_MINUTES)
      : null,
    tomorrowCount: Math.max(0, Math.floor(finiteNumber(record.tomorrowCount))),
    repeatedDeferrals: Math.max(
      0,
      Math.floor(finiteNumber(record.repeatedDeferrals)),
    ),
    adaptiveCompletionCount: Math.max(
      0,
      Math.floor(finiteNumber(record.adaptiveCompletionCount)),
    ),
    adaptiveDeferralCount: Math.max(
      0,
      Math.floor(finiteNumber(record.adaptiveDeferralCount)),
    ),
    manualRescheduleCount: Math.max(
      0,
      Math.floor(finiteNumber(record.manualRescheduleCount)),
    ),
    completionDelayAverageMinutes: Number.isFinite(completionAverage)
      ? bounded(completionAverage, -24 * 60, 7 * 24 * 60)
      : null,
    adaptiveCompletionDelayAverageMinutes: Number.isFinite(
      adaptiveCompletionAverage,
    )
      ? bounded(adaptiveCompletionAverage, -24 * 60, 7 * 24 * 60)
      : null,
    lastEventAt:
      typeof record.lastEventAt === "string" ? record.lastEventAt : null,
    updatedAt:
      typeof record.updatedAt === "string" ? record.updatedAt : base.updatedAt,
  };
}

function ewma(previous: number | null, next: number, alpha = 0.35): number {
  return bounded(
    previous === null ? next : previous + alpha * (next - previous),
    0,
    NUDGE_SNOOZE_MAX_MINUTES,
  );
}

/** Apply one compact explicit event to the aggregate profile. */
export function applyNudgeEvent(
  profileInput: NudgeProfile,
  event: NudgeEvent,
): NudgeProfile {
  const profile = sanitizeNudgeProfile(profileInput);
  const next: NudgeProfile = {
    ...profile,
    timingSamples: { ...profile.timingSamples },
    timingCompletions: { ...profile.timingCompletions },
    timingDeferrals: { ...profile.timingDeferrals },
    sampleCount: profile.sampleCount + 1,
    lastEventAt: event.occurredAt,
    updatedAt: event.occurredAt,
  };
  const bucket = event.timeBucket;
  next.timingSamples[bucket] += 1;

  if (
    event.eventType === "task_completed" ||
    event.eventType === "notification_action_complete"
  ) {
    next.timingCompletions[bucket] += 1;
    if (event.nudgeId || event.source === "adaptive_nudge") {
      next.adaptiveCompletionCount += 1;
    }
    if (event.numericValue !== null && Number.isFinite(event.numericValue)) {
      const delay = bounded(event.numericValue, -24 * 60, 7 * 24 * 60);
      next.completionDelayAverageMinutes =
        next.completionDelayAverageMinutes === null
          ? delay
          : next.completionDelayAverageMinutes +
            0.25 * (delay - next.completionDelayAverageMinutes);
    }
    if (
      event.secondaryNumericValue !== null &&
      event.secondaryNumericValue !== undefined &&
      Number.isFinite(event.secondaryNumericValue)
    ) {
      const delay = bounded(event.secondaryNumericValue, -24 * 60, 7 * 24 * 60);
      next.adaptiveCompletionDelayAverageMinutes =
        next.adaptiveCompletionDelayAverageMinutes === null
          ? delay
          : next.adaptiveCompletionDelayAverageMinutes +
            0.25 * (delay - next.adaptiveCompletionDelayAverageMinutes);
    }
  }

  if (event.eventType === "notification_action_snooze") {
    next.snoozeSamples += 1;
    if (event.numericValue !== null && Number.isFinite(event.numericValue)) {
      const duration = bounded(event.numericValue, 1, NUDGE_SNOOZE_MAX_MINUTES);
      next.snoozeAverageMinutes = ewma(next.snoozeAverageMinutes, duration);
      if (duration <= NUDGE_MIN_DELAY_MINUTES) next.repeatedDeferrals += 1;
    }
    next.timingDeferrals[bucket] += 1;
    if (event.nudgeId || event.source === "adaptive_nudge_action")
      next.adaptiveDeferralCount += 1;
  }

  if (event.eventType === "notification_action_tomorrow") {
    next.tomorrowCount += 1;
    next.timingDeferrals[bucket] += 1;
    next.repeatedDeferrals += 1;
    if (event.nudgeId || event.source === "adaptive_nudge_action")
      next.adaptiveDeferralCount += 1;
  }

  if (event.eventType === "task_rescheduled") next.manualRescheduleCount += 1;
  next.confidence = confidenceForSamples(next.sampleCount);
  return next;
}

export function preferredNudgeDelayMinutes(
  profileInput: NudgeProfile,
): number | null {
  const profile = sanitizeNudgeProfile(profileInput);
  if (
    profile.snoozeSamples < NUDGE_MINIMUM_SAMPLES ||
    profile.snoozeAverageMinutes === null
  )
    return null;
  return Math.round(
    bounded(
      profile.snoozeAverageMinutes,
      NUDGE_MIN_DELAY_MINUTES,
      NUDGE_MAX_DELAY_MINUTES,
    ),
  );
}

export function preferredNudgeTimeBucket(
  profileInput: NudgeProfile,
): NudgeTimeBucket | null {
  const profile = sanitizeNudgeProfile(profileInput);
  if (profile.confidence !== "confident") return null;
  let best: NudgeTimeBucket | null = null;
  let bestRate = 0;
  for (const bucket of NUDGE_TIME_BUCKETS) {
    const samples = profile.timingSamples[bucket];
    if (samples < 2) continue;
    const rate = profile.timingCompletions[bucket] / samples;
    if (rate > bestRate) {
      bestRate = rate;
      best = bucket;
    }
  }
  return bestRate >= 0.5 ? best : null;
}

export function isReminderAdaptive(
  reminder: Reminder | null | undefined,
): boolean {
  return reminder?.kind === "adaptive_followup";
}
