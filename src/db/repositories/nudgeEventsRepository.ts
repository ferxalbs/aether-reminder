import { createId } from "@/lib/id";
import {
  applyNudgeEvent,
  createEmptyNudgeProfile,
  sanitizeNudgeProfile,
  type NudgeEvent,
  type NudgeEventType,
  type NudgeProfile,
} from "@/domain/nudges";
import type { SqlDatabase } from "../types";

interface NudgeEventRow {
  id: string;
  event_type: NudgeEventType;
  task_id: string | null;
  nudge_id: string | null;
  occurred_at: string;
  local_weekday: number;
  time_bucket: NudgeEvent["timeBucket"];
  source: string;
  numeric_value: number | null;
  secondary_numeric_value: number | null;
  policy_version: string;
  dedupe_key: string | null;
}

interface NudgeProfileRow {
  profile_json: string;
}

export interface NudgeEventCounts {
  total: number;
  adaptiveActions: number;
  completions: number;
  deferrals: number;
}

export class NudgeEventsRepository {
  constructor(private readonly db: SqlDatabase) {}

  async getProfile(): Promise<NudgeProfile> {
    const row = await this.db.getFirstAsync<NudgeProfileRow>(
      `SELECT profile_json FROM nudge_profiles WHERE id = 'default'`,
    );
    if (!row) return createEmptyNudgeProfile();
    try {
      return sanitizeNudgeProfile(JSON.parse(row.profile_json));
    } catch {
      return createEmptyNudgeProfile();
    }
  }

  /** Insert and aggregate atomically. A duplicate response key is a no-op. */
  async append(event: NudgeEvent): Promise<boolean> {
    let inserted = false;
    await this.db.withTransactionAsync(async () => {
      const result = await this.db.runAsync(
        `INSERT OR IGNORE INTO nudge_events (
           id, event_type, task_id, nudge_id, occurred_at, local_weekday,
           time_bucket, source, numeric_value, secondary_numeric_value,
           policy_version, dedupe_key
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id || createId(),
          event.eventType,
          event.taskId,
          event.nudgeId,
          event.occurredAt,
          event.localWeekday,
          event.timeBucket,
          event.source,
          event.numericValue,
          event.secondaryNumericValue ?? null,
          event.policyVersion,
          event.dedupeKey,
        ],
      );
      inserted = result.changes > 0;
      if (!inserted) return;

      const current = await this.getProfile();
      const next = applyNudgeEvent(current, event);
      await this.db.runAsync(
        `INSERT INTO nudge_profiles (id, profile_json, policy_version, updated_at)
         VALUES ('default', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           profile_json = excluded.profile_json,
           policy_version = excluded.policy_version,
           updated_at = excluded.updated_at`,
        [JSON.stringify(next), next.policyVersion, next.updatedAt],
      );
    });
    return inserted;
  }

  async getLastDeferralForTask(
    taskId: string,
  ): Promise<{ occurredAt: string; nudgeId: string | null } | null> {
    const row = await this.db.getFirstAsync<{
      occurred_at: string;
      nudge_id: string | null;
    }>(
      `SELECT occurred_at, nudge_id FROM nudge_events
       WHERE task_id = ?
         AND event_type IN ('notification_action_snooze', 'notification_action_tomorrow')
       ORDER BY occurred_at DESC, id DESC LIMIT 1`,
      [taskId],
    );
    return row ? { occurredAt: row.occurred_at, nudgeId: row.nudge_id } : null;
  }

  async count(): Promise<NudgeEventCounts> {
    const row = await this.db.getFirstAsync<{
      total: number;
      adaptive_actions: number;
      completions: number;
      deferrals: number;
    }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN source = 'adaptive_nudge_action' THEN 1 ELSE 0 END) AS adaptive_actions,
         SUM(CASE WHEN event_type IN ('task_completed', 'notification_action_complete') THEN 1 ELSE 0 END) AS completions,
         SUM(CASE WHEN event_type IN ('notification_action_snooze', 'notification_action_tomorrow') THEN 1 ELSE 0 END) AS deferrals
       FROM nudge_events`,
    );
    return {
      total: row?.total ?? 0,
      adaptiveActions: row?.adaptive_actions ?? 0,
      completions: row?.completions ?? 0,
      deferrals: row?.deferrals ?? 0,
    };
  }

  async reset(): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(`DELETE FROM nudge_events`);
      await this.db.runAsync(`DELETE FROM nudge_profiles`);
    });
  }

  async listForTask(taskId: string, limit = 50): Promise<NudgeEvent[]> {
    const rows = await this.db.getAllAsync<NudgeEventRow>(
      `SELECT * FROM nudge_events
       WHERE task_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?`,
      [taskId, Math.max(1, Math.floor(limit))],
    );
    return rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      taskId: row.task_id,
      nudgeId: row.nudge_id,
      occurredAt: row.occurred_at,
      localWeekday: row.local_weekday,
      timeBucket: row.time_bucket,
      source: row.source,
      numericValue: row.numeric_value,
      secondaryNumericValue: row.secondary_numeric_value,
      policyVersion: row.policy_version,
      dedupeKey: row.dedupe_key,
    }));
  }
}
