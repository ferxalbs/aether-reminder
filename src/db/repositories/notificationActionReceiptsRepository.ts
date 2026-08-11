import type { TemporalSemantics } from '@/domain/entities';
import type { SqlDatabase } from '../types';

export interface NotificationActionReceipt {
  responseKey: string;
  nativeNotificationId: string;
  actionIdentifier: string;
  reminderId: string | null;
  targetDate: string | null;
  targetTime: string | null;
  targetTimezone: string | null;
  targetSemantics: TemporalSemantics | null;
  status: 'claimed' | 'completed';
  attemptCount: number;
  claimedAt: string;
  completedAt: string | null;
}

export interface ClaimNotificationActionInput {
  responseKey: string;
  nativeNotificationId: string;
  actionIdentifier: string;
  reminderId: string | null;
  targetDate?: string | null;
  targetTime?: string | null;
  targetTimezone?: string | null;
  targetSemantics?: TemporalSemantics | null;
}

interface NotificationActionReceiptRow {
  response_key: string;
  native_notification_id: string;
  action_identifier: string;
  reminder_id: string | null;
  target_date: string | null;
  target_time: string | null;
  target_timezone: string | null;
  target_semantics: string | null;
  status: 'claimed' | 'completed';
  attempt_count: number;
  claimed_at: string;
  completed_at: string | null;
}

function mapRow(row: NotificationActionReceiptRow): NotificationActionReceipt {
  return {
    responseKey: row.response_key,
    nativeNotificationId: row.native_notification_id,
    actionIdentifier: row.action_identifier,
    reminderId: row.reminder_id,
    targetDate: row.target_date,
    targetTime: row.target_time,
    targetTimezone: row.target_timezone,
    targetSemantics: row.target_semantics as TemporalSemantics | null,
    status: row.status,
    attemptCount: row.attempt_count,
    claimedAt: row.claimed_at,
    completedAt: row.completed_at,
  };
}

export class NotificationActionReceiptsRepository {
  constructor(private readonly db: SqlDatabase) {}

  async claim(input: ClaimNotificationActionInput): Promise<NotificationActionReceipt> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO notification_action_receipts (
        response_key, native_notification_id, action_identifier, reminder_id,
        target_date, target_time, target_timezone, target_semantics,
        status, attempt_count, claimed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'claimed', 1, ?)
      ON CONFLICT(response_key) DO UPDATE SET
        attempt_count = notification_action_receipts.attempt_count + 1,
        claimed_at = excluded.claimed_at
      WHERE notification_action_receipts.status = 'claimed'`,
      [
        input.responseKey,
        input.nativeNotificationId,
        input.actionIdentifier,
        input.reminderId,
        input.targetDate ?? null,
        input.targetTime ?? null,
        input.targetTimezone ?? null,
        input.targetSemantics ?? null,
        now,
      ],
    );

    const row = await this.db.getFirstAsync<NotificationActionReceiptRow>(
      `SELECT * FROM notification_action_receipts WHERE response_key = ?`,
      [input.responseKey],
    );
    if (!row) throw new Error('Notification action receipt claim could not be persisted.');
    return mapRow(row);
  }

  async markCompleted(responseKey: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE notification_action_receipts
       SET status = 'completed', completed_at = ?
       WHERE response_key = ? AND status = 'claimed'`,
      [new Date().toISOString(), responseKey],
    );
  }
}
