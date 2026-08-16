import type { TaskPriority, TemporalSemantics } from "./entities";

/**
 * NOW/NEXT policy is deliberately small and versioned. These values are the
 * only temporal/ranking thresholds used by the attention planner.
 */
export const ATTENTION_POLICY = {
  version: 1,
  imminentWindowMinutes: 30,
  recentDueWindowMinutes: 30,
  candidateLookbackDays: 1,
  futureWindowDays: 2,
  candidateLimit: 32,
  maxNextItems: 4,
  maxChoiceItems: 3,
  hysteresisMinutes: 15,
} as const;

export type AttentionReasonCode =
  | "manual_focus"
  | "user_selected"
  | "due_imminent"
  | "due_now"
  | "due_today"
  | "high_priority_today"
  | "adaptive_followup_due"
  | "recovered_recently"
  | "next_scheduled";

export type AttentionRankTier = "A" | "B" | "C" | "D" | "E";
export type AttentionConfidence = "high" | "medium" | "low";
export type AttentionSelectionMode = "recommended" | "choose" | "clear";

export type AttentionScheduledContext =
  "due_now" | "due_imminent" | "due_today" | "scheduled_future" | "undated";

export type AttentionNudgeState = "nudge_due" | "nudge_suppressed" | "no_nudge";

export interface AttentionFocusIntent {
  taskId: string;
  createdAt: string;
  source: "manual";
}

/** Normalized temporal facts keep schedule interpretation out of ranking. */
export interface AttentionTemporalFacts {
  status: "undated" | "date_only" | "timed";
  dueAtMs: number | null;
  relevantDueDate: string | null;
  isToday: boolean;
  isDueNow: boolean;
  minutesUntilDue: number | null;
  daysUntilDue: number | null;
  isInNearFuture: boolean;
  /** The next boundary at which this candidate can materially change tier. */
  nextMeaningfulAtMs: number | null;
}

export interface AttentionCandidateFacts {
  taskId: string;
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
  dueTime: string | null;
  dueTimezone: string | null;
  dueSemantics: TemporalSemantics;
  createdAt: string;
  temporal: AttentionTemporalFacts;
  explicitFocus: boolean;
  adaptiveNudge: AttentionNudgeState;
  recoveryOwned: boolean;
  recoveredRecently: boolean;
}

export interface AttentionTemporalContext {
  now: Date;
  localDate: string;
  nextDateBoundaryAtMs: number | null;
}

export interface AttentionRecoveryState {
  proposalCount: number;
  taskIds: readonly string[];
}

export interface AttentionReliabilityState {
  degraded: boolean;
  activeReminderCount: number;
}

export interface AttentionItem {
  taskId: string;
  title: string;
  reasonCodes: AttentionReasonCode[];
  rankTier: AttentionRankTier;
  scheduledContext: AttentionScheduledContext;
  priority: TaskPriority;
  confidence: AttentionConfidence;
  dueDate: string | null;
  dueTime: string | null;
  dueTimezone: string | null;
  dueSemantics: TemporalSemantics;
}

export type AttentionAlertKind =
  "recovery_available" | "reliability_degraded" | "focus_conflict";

export interface AttentionAlert {
  id: string;
  kind: AttentionAlertKind;
  title: string;
  message: string;
  taskId?: string;
  count?: number;
  action: "review_recovery" | "switch_focus" | "open_settings";
}

export interface AttentionPlan {
  generatedAt: string;
  policyVersion: number;
  now: AttentionItem | null;
  next: AttentionItem[];
  choices: AttentionItem[];
  alerts: AttentionAlert[];
  selectionMode: AttentionSelectionMode;
  /** ISO instant for the next meaningful in-app refresh, when known. */
  nextRefreshAt: string | null;
}

export interface AttentionPlannerInput {
  candidates: readonly AttentionCandidateFacts[];
  recoveryState?: AttentionRecoveryState;
  reliabilityState?: AttentionReliabilityState;
  explicitFocus: AttentionFocusIntent | null;
  temporalContext: AttentionTemporalContext;
  previousPlan?: AttentionPlan | null;
  suppressedTaskIds?: readonly string[];
  now?: Date;
}

interface RankedCandidate {
  facts: AttentionCandidateFacts;
  tier: AttentionRankTier;
  rankValue: number;
  proximity: number;
  confidence: AttentionConfidence;
  reasons: AttentionReasonCode[];
}

const TIER_VALUE: Record<AttentionRankTier, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
};

const PRIORITY_VALUE: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function scheduledContext(
  facts: AttentionCandidateFacts,
): AttentionScheduledContext {
  if (facts.temporal.status === "undated") return "undated";
  if (facts.temporal.isDueNow) return "due_now";
  if (
    facts.temporal.minutesUntilDue !== null &&
    facts.temporal.minutesUntilDue >= 0 &&
    facts.temporal.minutesUntilDue <= ATTENTION_POLICY.imminentWindowMinutes
  )
    return "due_imminent";
  if (facts.temporal.isToday) return "due_today";
  return "scheduled_future";
}

function confidenceFor(
  tier: AttentionRankTier,
  facts: AttentionCandidateFacts,
): AttentionConfidence {
  if (tier === "A" || tier === "B") return "high";
  if (tier === "C") return "medium";
  if (tier === "D" && facts.temporal.status === "timed") return "medium";
  return "low";
}

function rankCandidate(
  facts: AttentionCandidateFacts,
  explicitFocus: AttentionFocusIntent | null,
): RankedCandidate | null {
  const isExplicitFocus =
    explicitFocus?.taskId === facts.taskId || facts.explicitFocus;
  if (
    (facts.recoveryOwned && !isExplicitFocus) ||
    facts.adaptiveNudge === "nudge_suppressed"
  )
    return null;
  const hasImminentTime =
    facts.temporal.status === "timed" &&
    facts.temporal.minutesUntilDue !== null &&
    facts.temporal.minutesUntilDue >=
      -ATTENTION_POLICY.recentDueWindowMinutes &&
    facts.temporal.minutesUntilDue <= ATTENTION_POLICY.imminentWindowMinutes;

  let tier: AttentionRankTier;
  if (isExplicitFocus) tier = "A";
  else if (hasImminentTime) tier = "B";
  else if (facts.adaptiveNudge === "nudge_due") tier = "C";
  else if (facts.temporal.isToday) tier = "D";
  else if (facts.temporal.isInNearFuture) tier = "E";
  else return null;

  const reasons: AttentionReasonCode[] = [];
  if (isExplicitFocus) reasons.push("manual_focus", "user_selected");
  if (facts.temporal.isDueNow && facts.temporal.status === "timed")
    reasons.push("due_now");
  else if (hasImminentTime) reasons.push("due_imminent");
  if (facts.adaptiveNudge === "nudge_due")
    reasons.push("adaptive_followup_due");
  if (facts.temporal.isToday) {
    reasons.push("due_today");
    if (facts.priority === "high") reasons.push("high_priority_today");
  } else if (facts.temporal.isInNearFuture) {
    reasons.push("next_scheduled");
  }
  if (facts.recoveredRecently) reasons.push("recovered_recently");

  const proximity =
    facts.temporal.minutesUntilDue ??
    (facts.temporal.daysUntilDue ?? Number.MAX_SAFE_INTEGER) * 24 * 60;

  return {
    facts,
    tier,
    rankValue: TIER_VALUE[tier],
    proximity,
    confidence: confidenceFor(tier, facts),
    reasons: unique(reasons),
  };
}

function compareRanked(a: RankedCandidate, b: RankedCandidate): number {
  if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;
  if (a.proximity !== b.proximity) return a.proximity - b.proximity;
  const priorityDifference =
    PRIORITY_VALUE[a.facts.priority] - PRIORITY_VALUE[b.facts.priority];
  if (priorityDifference !== 0) return priorityDifference;
  const aDate = a.facts.temporal.relevantDueDate ?? "9999-12-31";
  const bDate = b.facts.temporal.relevantDueDate ?? "9999-12-31";
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  const aTime = a.facts.dueTime ?? "99:99";
  const bTime = b.facts.dueTime ?? "99:99";
  if (aTime !== bTime) return aTime.localeCompare(bTime);
  if (a.facts.createdAt !== b.facts.createdAt) {
    return a.facts.createdAt.localeCompare(b.facts.createdAt);
  }
  return a.facts.taskId.localeCompare(b.facts.taskId);
}

function toItem(candidate: RankedCandidate): AttentionItem {
  return {
    taskId: candidate.facts.taskId,
    title: candidate.facts.title,
    reasonCodes: candidate.reasons,
    rankTier: candidate.tier,
    scheduledContext: scheduledContext(candidate.facts),
    priority: candidate.facts.priority,
    confidence: candidate.confidence,
    dueDate: candidate.facts.dueDate,
    dueTime: candidate.facts.dueTime,
    dueTimezone: candidate.facts.dueTimezone,
    dueSemantics: candidate.facts.dueSemantics,
  };
}

function isEffectivelyEquivalent(
  a: RankedCandidate,
  b: RankedCandidate,
): boolean {
  if (a.tier !== b.tier || a.facts.priority !== b.facts.priority) return false;
  if (a.tier === "E") return true;
  if (
    a.tier === "D" &&
    a.facts.temporal.status === "date_only" &&
    b.facts.temporal.status === "date_only"
  ) {
    return true;
  }
  if (
    a.proximity === Number.MAX_SAFE_INTEGER ||
    b.proximity === Number.MAX_SAFE_INTEGER
  )
    return true;
  return Math.abs(a.proximity - b.proximity) <= 5;
}

function shouldChoose(ranked: readonly RankedCandidate[]): boolean {
  const first = ranked[0];
  const second = ranked[1];
  if (!first || !second || first.tier === "A") return false;
  return isEffectivelyEquivalent(first, second);
}

function isCandidateStillValid(
  candidate: RankedCandidate,
  facts: readonly AttentionCandidateFacts[],
  explicitFocus: AttentionFocusIntent | null,
  suppressedTaskIds: ReadonlySet<string>,
): boolean {
  const current = facts.find((item) => item.taskId === candidate.facts.taskId);
  if (
    !current ||
    current.recoveryOwned ||
    suppressedTaskIds.has(current.taskId)
  )
    return false;
  if (explicitFocus?.taskId === current.taskId) return true;
  return rankCandidate(current, explicitFocus) !== null;
}

function materiallyStronger(
  next: RankedCandidate,
  current: RankedCandidate,
): boolean {
  if (next.rankValue < current.rankValue) return true;
  if (next.rankValue > current.rankValue) return false;
  if (next.facts.temporal.isDueNow && !current.facts.temporal.isDueNow)
    return true;
  if (next.facts.priority === "high" && current.facts.priority !== "high") {
    return (
      next.proximity + ATTENTION_POLICY.hysteresisMinutes < current.proximity
    );
  }
  return (
    next.proximity + ATTENTION_POLICY.hysteresisMinutes < current.proximity
  );
}

function stableNow(
  ranked: RankedCandidate[],
  input: AttentionPlannerInput,
  suppressedTaskIds: ReadonlySet<string>,
): RankedCandidate | null {
  const previous =
    input.previousPlan?.selectionMode === "recommended"
      ? input.previousPlan.now
      : null;
  if (!previous || input.explicitFocus?.taskId === previous.taskId)
    return ranked[0] ?? null;
  const current = ranked.find((item) => item.facts.taskId === previous.taskId);
  const strongest = ranked[0];
  if (!current || !strongest || current.facts.taskId === strongest.facts.taskId)
    return strongest ?? current ?? null;
  if (
    !isCandidateStillValid(
      current,
      input.candidates,
      input.explicitFocus,
      suppressedTaskIds,
    )
  ) {
    return strongest;
  }
  return materiallyStronger(strongest, current) ? strongest : current;
}

function nextRefreshAt(input: AttentionPlannerInput): string | null {
  const nowMs = (input.now ?? input.temporalContext.now).getTime();
  const boundaries = input.candidates
    .map((candidate) => candidate.temporal.nextMeaningfulAtMs)
    .filter((value): value is number => value !== null && value > nowMs);
  if (
    input.temporalContext.nextDateBoundaryAtMs &&
    input.temporalContext.nextDateBoundaryAtMs > nowMs
  ) {
    boundaries.push(input.temporalContext.nextDateBoundaryAtMs);
  }
  const next = Math.min(...boundaries);
  return Number.isFinite(next) ? new Date(next).toISOString() : null;
}

export class AttentionPlanner {
  static plan(input: AttentionPlannerInput): AttentionPlan {
    const now = input.now ?? input.temporalContext.now;
    const generatedAt = now.toISOString();
    const suppressedTaskIds = new Set(input.suppressedTaskIds ?? []);
    const ranked = input.candidates
      .filter((candidate) => !suppressedTaskIds.has(candidate.taskId))
      .map((candidate) => rankCandidate(candidate, input.explicitFocus))
      .filter((candidate): candidate is RankedCandidate => candidate !== null)
      .sort(compareRanked);

    const alerts: AttentionAlert[] = [];
    const recovery = input.recoveryState;
    if (recovery && recovery.proposalCount > 0) {
      alerts.push({
        id: "recovery-available",
        kind: "recovery_available",
        title: `${recovery.proposalCount} thing${recovery.proposalCount === 1 ? "" : "s"} slipped`,
        message: "Review your recovery plan.",
        count: recovery.proposalCount,
        action: "review_recovery",
      });
    }

    const reliability = input.reliabilityState;
    if (reliability?.degraded && reliability.activeReminderCount > 0) {
      alerts.push({
        id: "reliability-degraded",
        kind: "reliability_degraded",
        title: "Reminders need attention",
        message: "Some active reminders may not be delivered.",
        action: "open_settings",
      });
    }

    const manualFocus = input.explicitFocus
      ? ranked.find(
          (candidate) => candidate.facts.taskId === input.explicitFocus?.taskId,
        )
      : null;
    const automaticConflict = ranked.find(
      (candidate) =>
        candidate.facts.taskId !== input.explicitFocus?.taskId &&
        candidate.tier === "B" &&
        candidate.facts.temporal.isDueNow,
    );
    if (manualFocus && automaticConflict) {
      alerts.push({
        id: `focus-conflict-${automaticConflict.facts.taskId}`,
        kind: "focus_conflict",
        title: `${automaticConflict.facts.title} is due now`,
        message: "Switch focus?",
        taskId: automaticConflict.facts.taskId,
        action: "switch_focus",
      });
    }

    if (ranked.length === 0) {
      return {
        generatedAt,
        policyVersion: ATTENTION_POLICY.version,
        now: null,
        next: [],
        choices: [],
        alerts,
        selectionMode: "clear",
        nextRefreshAt: nextRefreshAt(input),
      };
    }

    if (!manualFocus && shouldChoose(ranked)) {
      return {
        generatedAt,
        policyVersion: ATTENTION_POLICY.version,
        now: null,
        next: [],
        choices: ranked.slice(0, ATTENTION_POLICY.maxChoiceItems).map(toItem),
        alerts,
        selectionMode: "choose",
        nextRefreshAt: nextRefreshAt(input),
      };
    }

    const selected = stableNow(ranked, input, suppressedTaskIds);
    if (!selected) {
      return {
        generatedAt,
        policyVersion: ATTENTION_POLICY.version,
        now: null,
        next: ranked.slice(0, ATTENTION_POLICY.maxNextItems).map(toItem),
        choices: [],
        alerts,
        selectionMode: "clear",
        nextRefreshAt: nextRefreshAt(input),
      };
    }

    // Near-future work is a useful known NEXT item, but is not enough evidence
    // to manufacture a NOW recommendation when nothing is due or focused.
    if (selected.tier === "E" && !manualFocus) {
      return {
        generatedAt,
        policyVersion: ATTENTION_POLICY.version,
        now: null,
        next: ranked.slice(0, ATTENTION_POLICY.maxNextItems).map(toItem),
        choices: [],
        alerts,
        selectionMode: "clear",
        nextRefreshAt: nextRefreshAt(input),
      };
    }

    const next = ranked
      .filter((candidate) => candidate.facts.taskId !== selected.facts.taskId)
      .slice(0, ATTENTION_POLICY.maxNextItems)
      .map(toItem);
    return {
      generatedAt,
      policyVersion: ATTENTION_POLICY.version,
      now: toItem(selected),
      next,
      choices: [],
      alerts,
      selectionMode: "recommended",
      nextRefreshAt: nextRefreshAt(input),
    };
  }
}

export function planAttention(input: AttentionPlannerInput): AttentionPlan {
  return AttentionPlanner.plan(input);
}
